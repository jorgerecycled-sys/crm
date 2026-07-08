import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

const INFLOWW_API_KEY = (process.env.INFLOWW_API_KEY ?? '').trim()
const INFLOWW_API_URL = (process.env.INFLOWW_API_URL ?? 'https://api.infloww.com/v1').trim()

// GET: fetch and cache transactions from Infloww
// Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), modelo (optional), refresh (boolean)
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  if (!INFLOWW_API_KEY) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: 'INFLOWW_API_KEY no configurada. Añade la variable de entorno en Vercel.',
      transactions: [],
      summary: null,
    })
  }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const endDate   = searchParams.get('endDate')   ?? new Date().toISOString().split('T')[0]
  const modelo    = searchParams.get('modelo')     ?? null
  const refresh   = searchParams.get('refresh') === 'true'

  try {
    // Serve from cache unless refresh requested
    if (!refresh) {
      let cacheQ = supabase
        .from('infloww_cache')
        .select('*')
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .order('fecha', { ascending: false })
      if (modelo) cacheQ = cacheQ.eq('modelo', modelo)

      const { data: cached, error: cErr } = await cacheQ
      if (cErr?.code !== '42P01' && !cErr && cached && cached.length > 0) {
        return NextResponse.json({ ok: true, configured: true, source: 'cache', transactions: cached, summary: summarize(cached) })
      }
    }

    // Fetch from Infloww API
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (modelo) params.set('account', modelo)

    const res = await fetch(`${INFLOWW_API_URL}/transactions?${params}`, {
      headers: { Authorization: `Bearer ${INFLOWW_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, configured: true, error: `Infloww API error ${res.status}: ${text.slice(0, 200)}` }, { status: 502 })
    }

    const raw = await res.json() as { transactions?: InflowwTx[]; data?: InflowwTx[] }
    const txList: InflowwTx[] = raw.transactions ?? raw.data ?? []

    const rows = txList.map(tx => ({
      id:        String(tx.id ?? tx.transaction_id ?? ''),
      modelo:    (tx.model_name ?? tx.account_name ?? tx.modelo ?? null) as string | null,
      tipo:      normalizeTipo(String(tx.type ?? tx.transaction_type ?? '')),
      importe:   parseFloat(String(tx.amount ?? tx.net ?? 0)),
      fecha:     String(tx.date ?? tx.created_at ?? '').split('T')[0],
      rawData:   tx,
      syncedAt:  new Date().toISOString(),
    })).filter(r => r.id && r.fecha)

    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from('infloww_cache')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
      if (upErr && upErr.code !== '42P01') console.warn('[infloww] cache upsert error:', upErr.message)
    }

    return NextResponse.json({ ok: true, configured: true, source: 'live', transactions: rows, summary: summarize(rows) })
  } catch (e) {
    console.error('[infloww]', e)
    return NextResponse.json({ ok: false, configured: true, error: String(e) }, { status: 500 })
  }
}

type InflowwTx = Record<string, unknown>

function normalizeTipo(raw: string): string {
  const t = raw.toLowerCase()
  if (t.includes('sub'))       return 'suscripcion'
  if (t.includes('tip') || t.includes('propina')) return 'propina'
  if (t.includes('message') || t.includes('ppv') || t.includes('mensaje')) return 'mensaje_ppv'
  if (t.includes('chargeback')) return 'chargeback'
  if (t.includes('refund'))     return 'refund'
  return raw || 'otro'
}

function summarize(rows: { modelo: string | null; tipo: string; importe: number }[]) {
  const byModel: Record<string, { suscripcion: number; mensaje_ppv: number; propina: number; chargeback: number; refund: number; total: number }> = {}
  for (const r of rows) {
    const m = r.modelo ?? 'Sin modelo'
    if (!byModel[m]) byModel[m] = { suscripcion: 0, mensaje_ppv: 0, propina: 0, chargeback: 0, refund: 0, total: 0 }
    const amount = r.tipo === 'chargeback' || r.tipo === 'refund' ? -Math.abs(r.importe) : r.importe
    byModel[m][r.tipo as keyof typeof byModel[string]] = (byModel[m][r.tipo as keyof typeof byModel[string]] ?? 0) + amount
    byModel[m].total += amount
  }
  return byModel
}
