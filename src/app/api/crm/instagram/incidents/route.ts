import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    let { data, error } = await supabase
      .from('ig_incidents')
      .select('*, ig_accounts(username, model, status)')
      .order('createdAt', { ascending: false })
      .limit(50)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ incidents: [] })
      // PGRST200: FK not in schema cache — retry without join
      if (error.code === 'PGRST200') {
        const fallback = await supabase
          .from('ig_incidents')
          .select('id, accountId, description, tipo, status, reportedBy, createdAt')
          .order('createdAt', { ascending: false })
          .limit(50)
        return NextResponse.json({ incidents: fallback.data ?? [] })
      }
      throw error
    }
    return NextResponse.json({ incidents: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const { accountId, description, tipo, reportedBy } = body as Record<string, string>
    if (!description?.trim()) {
      return NextResponse.json({ error: 'description requerida' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('ig_incidents')
      .insert({ accountId: accountId || null, description: description.trim(), tipo: tipo || 'general', reportedBy: reportedBy || null, status: 'open' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ incident: data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const { id, status } = body as { id: string; status: string }
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const { data, error } = await supabase
      .from('ig_incidents')
      .update({ status, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ incident: data })
  } catch (e) {
    return handleApiError(e)
  }
}
