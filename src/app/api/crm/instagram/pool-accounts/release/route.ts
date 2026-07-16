import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireInstagramAccess, requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function POST(req: NextRequest) {
  try {
    const user = await requireInstagramAccess(req)
    const body = await req.json()
    const id = body?.id as string | undefined
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data: acc, error: findError } = await supabase
      .from('ig_accounts')
      .select('id, employeeId, pool')
      .eq('id', id)
      .maybeSingle()
    if (findError) throw findError
    if (!acc || !acc.pool) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

    let allowed = acc.employeeId === user.sub
    if (!allowed) {
      try { await requirePermission(req, 'pool-accounts:manage'); allowed = true }
      catch { /* not an admin either */ }
    }
    if (!allowed) return NextResponse.json({ error: 'No puedes liberar una cuenta que no es tuya' }, { status: 403 })

    const { data: updated, error: updError } = await supabase
      .from('ig_accounts')
      .update({ employeeId: null, status: 'pool_available', poolAssignedAt: null, poolAssignedFollowers: null })
      .eq('id', id)
      .select()
      .maybeSingle()
    if (updError) throw updError

    return apiResponse(updated)
  } catch (e) {
    return handleApiError(e)
  }
}
