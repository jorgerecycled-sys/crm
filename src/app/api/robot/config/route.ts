import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try { await requireAuth(req) } catch (e) { return handleApiError(e) }

  const { data, error } = await supabase
    .from('robot_config')
    .select('*')
    .order('jobName')

  if (error?.code === '42P01') return NextResponse.json({ configs: [], missing: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  try { await requireAuth(req) } catch (e) { return handleApiError(e) }

  try {
    const { jobName, preferredHour, enabled } = await req.json() as {
      jobName: string; preferredHour?: number; enabled?: boolean
    }
    if (!jobName) return NextResponse.json({ error: 'jobName requerido' }, { status: 400 })

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (preferredHour !== undefined) updates.preferredHour = Math.max(0, Math.min(23, preferredHour))
    if (enabled       !== undefined) updates.enabled       = enabled

    const { error } = await supabase
      .from('robot_config')
      .upsert({ jobName, ...updates }, { onConflict: 'jobName' })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
