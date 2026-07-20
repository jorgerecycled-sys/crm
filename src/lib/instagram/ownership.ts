import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

// Empleado can only ever touch accounts assigned to them — throws 403
// (as a plain Response, not a DB error) if the account belongs to someone else.
export async function assertOwnsAccountIfEmployee(id: string, authUser: { roleName: string; sub: string }) {
  if (authUser.roleName !== 'Empleado') return null
  const { data: existing, error } = await supabase.from('ig_accounts').select('employeeId').eq('id', id).maybeSingle()
  if (error) throw error
  if (!existing) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  if (existing.employeeId !== authUser.sub) {
    return NextResponse.json({ error: 'No puedes modificar una cuenta que no es tuya' }, { status: 403 })
  }
  return null
}
