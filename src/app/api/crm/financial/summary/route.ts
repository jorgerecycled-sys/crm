import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

// GET: net profit summary by model for a given month
// Combines: Infloww revenue (from cache) + expenses
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)

  const start = `${mes}-01`
  const end   = `${mes}-31`

  const [txRes, fixedRes, varRes, comRes] = await Promise.all([
    supabase.from('infloww_cache').select('modelo, tipo, importe').gte('fecha', start).lte('fecha', end),
    supabase.from('fin_gastos_fijos').select('*').eq('mes', mes),
    supabase.from('fin_gastos_variables').select('*').gte('fecha', start).lte('fecha', end),
    supabase.from('fin_reglas_comision').select('*').eq('activa', true),
  ])

  const missing = [fixedRes, varRes, comRes].some(r => r.error?.code === '42P01')

  type Row = { modelo: string | null; tipo: string; importe: number }
  const transactions: Row[] = (txRes.data ?? []).map(r => ({
    modelo: r.modelo,
    tipo: r.tipo,
    importe: Number(r.importe),
  }))

  // Build per-model revenue
  const revenue: Record<string, { suscripcion: number; mensaje_ppv: number; propina: number; chargeback: number; refund: number; bruto: number }> = {}
  for (const tx of transactions) {
    const m = tx.modelo ?? 'Sin modelo'
    if (!revenue[m]) revenue[m] = { suscripcion: 0, mensaje_ppv: 0, propina: 0, chargeback: 0, refund: 0, bruto: 0 }
    const amount = tx.tipo === 'chargeback' || tx.tipo === 'refund' ? -Math.abs(tx.importe) : tx.importe
    revenue[m][tx.tipo as keyof typeof revenue[string]] = (revenue[m][tx.tipo as keyof typeof revenue[string]] ?? 0) + amount
    revenue[m].bruto += amount
  }

  // Build per-model expenses
  const expenses: Record<string, { fijos: number; variables: number; comisiones: number; total: number }> = {}
  const addExpense = (modelo: string, field: 'fijos' | 'variables' | 'comisiones', amount: number) => {
    if (!expenses[modelo]) expenses[modelo] = { fijos: 0, variables: 0, comisiones: 0, total: 0 }
    expenses[modelo][field] += amount
    expenses[modelo].total += amount
  }

  // Apply fixed expenses
  for (const g of fixedRes.data ?? []) {
    if (g.modelo === 'global') {
      // Distribute global expenses equally across all models with revenue
      const modelos = Object.keys(revenue)
      if (modelos.length > 0) {
        const share = Number(g.importe) / modelos.length
        for (const m of modelos) addExpense(m, 'fijos', share)
      }
    } else {
      addExpense(g.modelo, 'fijos', Number(g.importe))
    }
  }

  // Apply variable expenses
  for (const g of varRes.data ?? []) {
    if (g.modelo === 'global') {
      const modelos = Object.keys(revenue)
      if (modelos.length > 0) {
        const share = Number(g.importe) / modelos.length
        for (const m of modelos) addExpense(m, 'variables', share)
      }
    } else {
      addExpense(g.modelo, 'variables', Number(g.importe))
    }
  }

  // Apply commission rules
  for (const com of comRes.data ?? []) {
    const m = com.modelo
    if (!revenue[m]) continue
    const base = com.base === 'mensajes_propinas'
      ? (revenue[m].mensaje_ppv + revenue[m].propina)
      : revenue[m].bruto
    const commission = base * (Number(com.porcentaje) / 100)
    addExpense(m, 'comisiones', commission)
  }

  // Build final summary
  const allModelos = new Set([...Object.keys(revenue), ...Object.keys(expenses)])
  const rows = Array.from(allModelos).map(modelo => {
    const rev = revenue[modelo] ?? { suscripcion: 0, mensaje_ppv: 0, propina: 0, chargeback: 0, refund: 0, bruto: 0 }
    const exp = expenses[modelo] ?? { fijos: 0, variables: 0, comisiones: 0, total: 0 }
    return {
      modelo,
      bruto:       rev.bruto,
      suscripcion: rev.suscripcion,
      mensaje_ppv: rev.mensaje_ppv,
      propina:     rev.propina,
      gastosFijos:     exp.fijos,
      gastosVariables: exp.variables,
      comisiones:      exp.comisiones,
      neto: rev.bruto - exp.total,
    }
  }).sort((a, b) => b.neto - a.neto)

  const totals = rows.reduce((t, r) => ({
    bruto: t.bruto + r.bruto,
    gastos: t.gastos + r.gastosFijos + r.gastosVariables + r.comisiones,
    neto: t.neto + r.neto,
  }), { bruto: 0, gastos: 0, neto: 0 })

  return NextResponse.json({ mes, rows, totals, missing, inflowwData: transactions.length > 0 })
}
