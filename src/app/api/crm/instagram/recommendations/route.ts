import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const { data, error } = await supabase
      .from('ig_recommendations')
      .select('*')
      .eq('activa', true)
      .order('createdAt', { ascending: false })
      .limit(20)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ recommendations: [] })
      throw error
    }
    return NextResponse.json({ recommendations: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const { texto, prioridad, categoria, createdBy } = body as Record<string, string>
    if (!texto?.trim()) {
      return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('ig_recommendations')
      .insert({ texto: texto.trim(), prioridad: prioridad || 'media', categoria: categoria || 'general', createdBy: createdBy || 'admin', activa: true })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ recommendation: data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const { error } = await supabase
      .from('ig_recommendations')
      .update({ activa: false })
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
