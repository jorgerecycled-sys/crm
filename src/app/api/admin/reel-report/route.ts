import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const REELS_REQUIRED = parseInt(process.env.REELS_REQUIRED ?? '2')

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    if (user.roleName === 'Empleado') return apiResponse({ error: 'Sin permiso' }, 403)

    const { searchParams } = new URL(req.url)
    const fecha = searchParams.get('fecha') ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]

    const { data: accounts, error: acErr } = await supabase
      .from('ig_accounts')
      .select('id, username, employee, phoneRef, model, status')
      .in('status', ['active', 'shadow banned'])
      .order('username', { ascending: true })
      .range(0, 1999)
    if (acErr) throw acErr

    const ids = (accounts ?? []).map(a => a.id)
    const { data: posts, error: pErr } = ids.length
      ? await supabase
          .from('ig_posts')
          .select('accountId')
          .eq('tipo', 'Reel')
          .eq('fechaPub', fecha)
          .in('accountId', ids)
          .range(0, 9999)
      : { data: [], error: null }
    if (pErr) throw pErr

    const reelCounts = new Map<string, number>()
    for (const p of posts ?? []) reelCounts.set(p.accountId, (reelCounts.get(p.accountId) ?? 0) + 1)

    const rows = (accounts ?? []).map(acc => ({
      accountId: acc.id,
      username:  acc.username,
      employee:  acc.employee ?? null,
      phoneRef:  acc.phoneRef ?? null,
      model:     acc.model    ?? null,
      status:    acc.status,
      reels:     reelCounts.get(acc.id) ?? 0,
    }))

    const compliant = rows.filter(r => r.reels >= REELS_REQUIRED).length
    return apiResponse({ fecha, rows, required: REELS_REQUIRED, compliant, missing: rows.length - compliant })
  } catch (e) {
    return handleApiError(e)
  }
}
