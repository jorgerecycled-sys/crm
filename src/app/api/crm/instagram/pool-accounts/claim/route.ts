import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireInstagramAccess, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function POST(req: NextRequest) {
  try {
    const user = await requireInstagramAccess(req)
    const body = await req.json()
    const id = body?.id as string | undefined
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data: acc, error: findError } = await supabase
      .from('ig_accounts')
      .select('id, pool')
      .eq('id', id)
      .maybeSingle()
    if (findError) throw findError
    if (!acc || !acc.pool) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

    const { data: latestMeas } = await supabase
      .from('ig_measurements')
      .select('seguidores')
      .eq('accountId', id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Atomic claim: the extra .eq('status','pool_available') guard means the update
    // only succeeds if nobody else grabbed it first (race-safe first-come-first-served).
    const { data: updated, error: updError } = await supabase
      .from('ig_accounts')
      .update({
        employeeId: user.sub,
        status: 'pool_assigned',
        poolAssignedAt: new Date().toISOString(),
        poolAssignedFollowers: latestMeas?.seguidores ?? 0,
      })
      .eq('id', id)
      .eq('status', 'pool_available')
      .select()
      .maybeSingle()
    if (updError) throw updError
    if (!updated) return NextResponse.json({ error: 'Esta cuenta ya fue asignada por otra persona' }, { status: 409 })

    return apiResponse(updated)
  } catch (e) {
    return handleApiError(e)
  }
}
