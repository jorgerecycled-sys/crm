import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireInstagramAccess, requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'

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
      .select('id, username, status, igPassword, fa2, employeeId, poolAssignedAt, poolAssignedFollowers, createdAt, erp_users!ig_accounts_employeeId_fkey(id, firstName, lastName)')
      .eq('pool', pool)
      .order('createdAt', { ascending: false })
      .range(0, 999)

    if (!isManager) {
      query = query.or(`status.eq.pool_available,employeeId.eq.${user.sub}`)
    }

    const { data: accounts, error } = await query
    if (error?.code === '42703') return apiResponse({ pool, accounts: [], isManager, info: 'Columnas de pool no creadas aún. Ejecuta supabase/ig_pool_accounts.sql' })
    if (error) throw error

    const ids = (accounts ?? []).map(a => a.id)
    const { data: meas } = ids.length
      ? await supabase.from('ig_measurements').select('accountId, fecha, seguidores').in('accountId', ids).order('fecha', { ascending: false }).range(0, 4999)
      : { data: [] }
    const latestByAccount = new Map<string, number | null>()
    for (const m of meas ?? []) {
      if (!latestByAccount.has(m.accountId)) latestByAccount.set(m.accountId, m.seguidores)
    }

    const shaped = (accounts ?? []).map(a => {
      const erpUser = (a as unknown as Record<string, unknown>).erp_users as { id: string; firstName: string; lastName: string } | null
      const latest = latestByAccount.get(a.id) ?? null
      const isMine = a.employeeId === user.sub
      const canSeeCreds = isManager || isMine
      return {
        id: a.id,
        username: a.username,
        status: a.status,
        employeeId: a.employeeId,
        employee: erpUser ? `${erpUser.firstName} ${erpUser.lastName}` : null,
        poolAssignedAt: a.poolAssignedAt,
        poolAssignedFollowers: a.poolAssignedFollowers,
        seguidores: latest,
        gain: latest !== null && a.poolAssignedFollowers !== null ? latest - a.poolAssignedFollowers : null,
        igPassword: canSeeCreds ? a.igPassword : null,
        fa2: canSeeCreds ? a.fa2 : null,
      }
    })

    return apiResponse({ pool, accounts: shaped, isManager })
  } catch (e) {
    return handleApiError(e)
  }
}
