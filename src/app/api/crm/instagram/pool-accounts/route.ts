import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireInstagramAccess, requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { calcAccountMetrics } from '@/lib/instagram/metrics'

const POOLS = ['jailbreak', 'pool'] as const

export async function GET(req: NextRequest) {
  try {
    const user = await requireInstagramAccess(req)
    const { searchParams } = new URL(req.url)
    const pool = searchParams.get('pool')
    if (!pool || !(POOLS as readonly string[]).includes(pool)) {
      return NextResponse.json({ error: 'pool inválido' }, { status: 400 })
    }

    let isManager = false
    try {
      await requirePermission(req, 'pool-accounts:manage')
      isManager = true
    } catch {
      // not an admin — that's fine, just gets the restricted view below
    }

    let query = supabase
      .from('ig_accounts')
      .select('id, username, status, model, phoneRef, igPassword, fa2, employeeId, poolAssignedAt, poolAssignedFollowers, createdAt, erp_users!ig_accounts_employeeId_fkey(id, firstName, lastName)')
      .eq('pool', pool)
      .order('createdAt', { ascending: false })
      .range(0, 999)

    if (!isManager) {
      query = query.or(`status.eq.pool_available,employeeId.eq.${user.sub}`)
    }

    const { data: accounts, error } = await query
    if (error?.code === '42703') return apiResponse({ pool, accounts: [], isManager, info: 'Columnas de pool no creadas aún. Ejecuta supabase/ig_pool_accounts.sql' })
    if (error) throw error
    if (!accounts || accounts.length === 0) return apiResponse({ pool, accounts: [], isManager })

    const ids = accounts.map(a => a.id)
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: allMeasurements } = await supabase
      .from('ig_measurements')
      .select('accountId, fecha, seguidores, siguiendo, seguidoresGanados, reproduccionesTotal, postsHoy, reelsHoy, likesDia, comentariosDia')
      .in('accountId', ids)
      .gte('fecha', cutoff)
      .order('fecha', { ascending: false })
      .range(0, 9999)
    const { data: allPosts } = await supabase
      .from('ig_posts')
      .select('accountId, id, shortcode, tipo, fechaPub, visitas, likes, comentarios')
      .in('accountId', ids)
      .order('fechaPub', { ascending: false })
      .range(0, 9999)

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

    const shaped = accounts.map(a => {
      const erpUser = (a as unknown as Record<string, unknown>).erp_users as { id: string; firstName: string; lastName: string } | null
      const measurements = (measurementMap.get(a.id) ?? []).slice(0, 30)
      const posts = (postMap.get(a.id) ?? []).slice(0, 100)
      const metrics = calcAccountMetrics(new Date(a.createdAt ?? Date.now()), measurements, posts)
      const latest = measurements[0] ?? null
      const prev = measurements[1] ?? null
      const sparkline = measurements
        .slice(0, 10)
        .reverse()
        .filter(m => m.seguidores !== null)
        .map(m => ({ fecha: m.fecha, seguidores: m.seguidores as number }))

      const isMine = a.employeeId === user.sub
      const canSeeCreds = isManager || isMine

      return {
        id: a.id,
        username: a.username,
        status: a.status,
        model: a.model,
        employeeId: a.employeeId,
        employee: erpUser ? `${erpUser.firstName} ${erpUser.lastName}` : null,
        phoneRef: a.phoneRef,
        poolAssignedAt: a.poolAssignedAt,
        poolAssignedFollowers: a.poolAssignedFollowers,
        latest,
        prev,
        sparkline,
        posts,
        ...metrics,
        gain: latest?.seguidores != null && a.poolAssignedFollowers != null ? latest.seguidores - a.poolAssignedFollowers : null,
        igPassword: canSeeCreds ? a.igPassword : null,
        fa2: canSeeCreds ? a.fa2 : null,
      }
    })

    return apiResponse({ pool, accounts: shaped, isManager })
  } catch (e) {
    return handleApiError(e)
  }
}
