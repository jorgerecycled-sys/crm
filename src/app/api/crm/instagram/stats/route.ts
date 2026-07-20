import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { calcAccountMetrics } from '@/lib/instagram/metrics'
import { inChunks } from '@/lib/supabase/chunked'

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req)
    const isEmployee = authUser.roleName === 'Empleado'
    const { searchParams } = new URL(req.url)
    const includePool = searchParams.get('includePool') === 'true'
    const onlyPool = searchParams.get('pool') // e.g. 'jailbreak' — include normal accounts + this one pool

    // ── 1. Accounts (lightweight, no nested joins) ────────────────────
    let accountsQuery = supabase
      .from('ig_accounts')
      .select('*, erp_users!ig_accounts_employeeId_fkey(id, firstName, lastName)')
      .order('createdAt', { ascending: false })
      .range(0, 999)
    if (!includePool) {
      accountsQuery = onlyPool
        ? accountsQuery.or(`pool.is.null,pool.eq.${onlyPool}`)
        : accountsQuery.is('pool', null)
    }

    if (isEmployee) accountsQuery = accountsQuery.eq('employeeId', authUser.sub)

    let { data: accounts, error: accountsError } = await accountsQuery

    // Fallback if employeeId column not yet migrated
    if (accountsError && (accountsError.code === '42703' || accountsError.code === '42P01' || accountsError.message?.includes('employeeId'))) {
      const fallback = await supabase
        .from('ig_accounts')
        .select('*')
        .order('createdAt', { ascending: false })
        .range(0, 999)
      accounts = fallback.data
      accountsError = fallback.error
    }

    if (accountsError) throw accountsError
    if (!accounts || accounts.length === 0) {
      return apiResponse({ accounts: [], totals: { totalAccounts: 0, activeAccounts: 0, totalFollowers: 0, totalPlays: 0, avgEngagement: 0 }, lastSyncAt: null })
    }

    const accountIds = accounts.map(a => a.id)

    // ── 2. Measurements — last 45 days for all accounts, chunked (large id
    // lists blow past PostgREST's ~16KB header limit via .in()) ───────────
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const allMeasurements = await inChunks(accountIds, (chunk) =>
      supabase
        .from('ig_measurements')
        .select('accountId, fecha, seguidores, siguiendo, seguidoresGanados, reproduccionesTotal, postsHoy, reelsHoy, likesDia, comentariosDia')
        .in('accountId', chunk)
        .gte('fecha', cutoff)
        .order('fecha', { ascending: false })
        .range(0, 9999)
    )

    // ── 3. Posts — last 100 per account, chunked ──────────────────────
    const allPosts = await inChunks(accountIds, (chunk) =>
      supabase
        .from('ig_posts')
        .select('accountId, id, shortcode, tipo, fechaPub, visitas, likes, comentarios')
        .in('accountId', chunk)
        .order('fechaPub', { ascending: false })
        .range(0, 9999)
    )

    // ── 4. Latest sync timestamp ──────────────────────────────────────
    const { data: latestSync } = await supabase
      .from('ig_measurements')
      .select('createdAt')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── 5. Group by accountId ─────────────────────────────────────────
    const measurementMap = new Map<string, typeof allMeasurements>()
    for (const m of allMeasurements ?? []) {
      const arr = measurementMap.get(m.accountId) ?? []
      arr.push(m)
      measurementMap.set(m.accountId, arr)
    }

    const postMap = new Map<string, typeof allPosts>()
    for (const p of allPosts ?? []) {
      const arr = postMap.get(p.accountId) ?? []
      arr.push(p)
      postMap.set(p.accountId, arr)
    }

    // ── 6. Enrich each account ────────────────────────────────────────
    const enriched = accounts.map((acc) => {
      const measurements = (measurementMap.get(acc.id) ?? []).slice(0, 30)
      const posts = (postMap.get(acc.id) ?? []).slice(0, 100)

      const metrics = calcAccountMetrics(new Date(acc.createdAt ?? Date.now()), measurements, posts)
      const latest = measurements[0] ?? null
      const prev = measurements[1] ?? null
      const sparkline = measurements
        .slice(0, 10)
        .reverse()
        .filter((m) => m.seguidores !== null)
        .map((m) => ({ fecha: m.fecha, seguidores: m.seguidores as number }))

      const erpUser = (acc as Record<string, unknown>).erp_users as { firstName: string; lastName: string } | null

      return {
        id: acc.id,
        username: acc.username,
        igId: acc.igId,
        status: acc.status,
        notes: acc.notes,
        model: acc.model,
        pool: acc.pool ?? null,
        origen: acc.pool === 'jailbreak' ? 'JailBreak' : acc.pool ? 'Pool' : 'Instagram',
        employeeId: acc.employeeId ?? null,
        employee: erpUser ? `${erpUser.firstName} ${erpUser.lastName}`.trim() : (acc.employee ?? null),
        phoneRef: acc.phoneRef,
        // Credentials are only bundled here for Empleado (their own accounts,
        // already scoped above) — everyone else fetches them one at a time via
        // the audit-logged /accounts/[id]/credentials endpoint.
        igPassword: isEmployee ? (acc.igPassword ?? null) : null,
        igEmail: isEmployee ? (acc.igEmail ?? null) : null,
        fa2: isEmployee ? (acc.fa2 ?? null) : null,
        igGroup: acc.igGroup ?? acc.grupo ?? null,
        accountType: acc.accountType ?? acc.igType ?? null,
        niche: acc.niche,
        igCreatedOn: acc.igCreatedOn,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt,
        latest,
        prev,
        sparkline,
        posts,
        ...metrics,
      }
    })

    const workingAccounts = enriched.filter((a) => (a.status === 'active' || a.status === 'shadow banned') && a.seguidores !== null)
    const totalFollowers = workingAccounts.reduce((s, a) => s + (a.seguidores ?? 0), 0)
    const totalPlays = workingAccounts.reduce((s, a) => s + (a.latest?.reproduccionesTotal ?? 0), 0)
    const validEngagement = workingAccounts.filter((a) => a.engagement !== null)
    const avgEngagement = validEngagement.length > 0
      ? validEngagement.reduce((s, a) => s + (a.engagement ?? 0), 0) / validEngagement.length
      : 0
    const activeAccounts = enriched.filter((a) => a.status === 'active' && a.seguidores !== null)

    return apiResponse({
      accounts: enriched,
      totals: {
        totalAccounts: accounts.length,
        activeAccounts: activeAccounts.length,
        totalFollowers,
        totalPlays,
        avgEngagement: isNaN(avgEngagement) ? 0 : avgEngagement,
      },
      lastSyncAt: latestSync?.createdAt ?? null,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
