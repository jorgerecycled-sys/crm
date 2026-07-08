import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

// GET: list expenses for a given month (YYYY-MM)
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  const { searchParams } = new URL(req.url)
  const mes    = searchParams.get('mes')    ?? new Date().toISOString().slice(0, 7)  // YYYY-MM
  const modelo = searchParams.get('modelo') ?? null

  const [fixedRes, varRes, comRes] = await Promise.all([
    (() => {
      let q = supabase.from('fin_gastos_fijos').select('*').eq('mes', mes).order('modelo')
      if (modelo) q = q.eq('modelo', modelo)
      return q
    })(),
    (() => {
      const start = `${mes}-01`
      const end   = `${mes}-31`
      let q = supabase.from('fin_gastos_variables').select('*').gte('fecha', start).lte('fecha', end).order('fecha', { ascending: false })
      if (modelo) q = q.eq('modelo', modelo)
      return q
    })(),
    (() => {
      let q = supabase.from('fin_reglas_comision').select('*').eq('activa', true).order('modelo')
      if (modelo) q = q.eq('modelo', modelo)
      return q
    })(),
  ])

  const missing = [fixedRes, varRes, comRes].some(r => r.error?.code === '42P01')
  if (missing) {
    return NextResponse.json({ fijos: [], variables: [], comisiones: [], missing: true })
  }

  return NextResponse.json({
    fijos:      fixedRes.data   ?? [],
    variables:  varRes.data     ?? [],
    comisiones: comRes.data     ?? [],
  })
}

// POST: create a new expense or commission rule
// body: { tipo: 'fijo'|'variable'|'comision', ...fields }
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const { tipo, ...fields } = body

    let table: string
    if (tipo === 'fijo')      table = 'fin_gastos_fijos'
    else if (tipo === 'variable') table = 'fin_gastos_variables'
    else if (tipo === 'comision') table = 'fin_reglas_comision'
    else return NextResponse.json({ error: 'tipo inválido: fijo | variable | comision' }, { status: 400 })

    const { data, error } = await supabase.from(table).insert(fields).select().single()
    if (error) throw error
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE: delete an expense or commission rule
// query: tipo=fijo|variable|comision, id=...
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  try {
    const { searchParams } = new URL(req.url)
    const tipo = searchParams.get('tipo')
    const id   = searchParams.get('id')
    if (!tipo || !id) return NextResponse.json({ error: 'tipo e id requeridos' }, { status: 400 })

    let table: string
    if (tipo === 'fijo')      table = 'fin_gastos_fijos'
    else if (tipo === 'variable') table = 'fin_gastos_variables'
    else if (tipo === 'comision') table = 'fin_reglas_comision'
    else return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })

    if (tipo === 'comision') {
      const { error } = await supabase.from(table).update({ activa: false }).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
