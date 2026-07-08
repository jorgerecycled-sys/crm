import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  const { data, error } = await supabase
    .from('ig_phone_alerts')
    .select('*')
    .order('updatedAt', { ascending: false })

  if (error?.code === '42P01') {
    return NextResponse.json({ alerts: [], missing: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ alerts: data ?? [] })
}

// PATCH: mark a phone alert as resolved
export async function PATCH(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  try {
    const { phoneRef } = await req.json() as { phoneRef: string }
    const { error } = await supabase
      .from('ig_phone_alerts')
      .update({ status: 'ok', resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq('phoneRef', phoneRef)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
