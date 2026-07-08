'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function pct(part: number, total: number) {
  if (!total) return '—'
  return `${Math.round((part / total) * 100)}%`
}

interface SummaryRow {
  modelo: string
  bruto: number
  suscripcion: number
  mensaje_ppv: number
  propina: number
  gastosFijos: number
  gastosVariables: number
  comisiones: number
  neto: number
}

interface Totals { bruto: number; gastos: number; neto: number }

interface GastoFijo { id: string; modelo: string; concepto: string; importe: number; mes: string }
interface GastoVar  { id: string; modelo: string; concepto: string; importe: number; fecha: string }
interface Comision  { id: string; empleadoId: string; modelo: string; porcentaje: number; base: string; activa: boolean }

interface Expenses {
  fijos: GastoFijo[]
  variables: GastoVar[]
  comisiones: Comision[]
  missing?: boolean
}

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

export default function FinancieroPage() {
  const [mes, setMes] = useState(CURRENT_MONTH)
  const [summary, setSummary] = useState<{ rows: SummaryRow[]; totals: Totals; missing: boolean; inflowwData: boolean } | null>(null)
  const [expenses, setExpenses] = useState<Expenses | null>(null)
  const [inflowwStatus, setInflowwStatus] = useState<{ configured: boolean; message?: string } | null>(null)
  const [tab, setTab] = useState<'resumen' | 'fijos' | 'variables' | 'comisiones'>('resumen')
  const [loading, setLoading] = useState(true)
  const [jobMsg, setJobMsg] = useState('')

  const [newFijo, setNewFijo]   = useState({ modelo: '', concepto: '', importe: '' })
  const [newVar, setNewVar]     = useState({ modelo: '', concepto: '', importe: '', fecha: new Date().toISOString().split('T')[0] })
  const [newCom, setNewCom]     = useState({ empleadoId: '', modelo: '', porcentaje: '', base: 'mensajes_propinas' })
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const token = useAuthStore.getState().accessToken
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const [sumRes, expRes, igRes] = await Promise.all([
      fetch(`/api/crm/financial/summary?mes=${mes}`, { headers: h }).then(r => r.json()),
      fetch(`/api/crm/financial/expenses?mes=${mes}`, { headers: h }).then(r => r.json()),
      fetch('/api/crm/financial/infloww', { headers: h }).then(r => r.json()).catch(() => null),
    ])
    setSummary(sumRes)
    setExpenses(expRes)
    if (igRes) setInflowwStatus({ configured: igRes.configured, message: igRes.message })
    setLoading(false)
  }, [mes])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function runJob(job: 'detect-performance' | 'detect-devices') {
    setJobMsg('Ejecutando...')
    const token = useAuthStore.getState().accessToken
    const r = await fetch(`/api/cron/${job}`, { headers: { Authorization: `Bearer ${token}` } })
    const d = await r.json() as Record<string, unknown>
    setJobMsg(job === 'detect-performance'
      ? `Detección rendimiento: ${d.evaluated} evaluadas, ${d.retiring} marcadas como "retirar"`
      : `Detección móviles: ${d.evaluated} móviles, ${d.toChange} con alerta "cambiar"`)
    setTimeout(() => setJobMsg(''), 6000)
  }

  async function addExpense(tipo: 'fijo' | 'variable' | 'comision') {
    setSaving(true)
    const token = useAuthStore.getState().accessToken
    let body: object
    if (tipo === 'fijo')      body = { tipo: 'fijo',      ...newFijo,  importe: parseFloat(newFijo.importe) }
    else if (tipo === 'variable') body = { tipo: 'variable', ...newVar,   importe: parseFloat(newVar.importe) }
    else                      body = { tipo: 'comision',  ...newCom,  porcentaje: parseFloat(newCom.porcentaje) }

    await fetch('/api/crm/financial/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (tipo === 'fijo')      setNewFijo({ modelo: '', concepto: '', importe: '' })
    else if (tipo === 'variable') setNewVar({ modelo: '', concepto: '', importe: '', fecha: new Date().toISOString().split('T')[0] })
    else                      setNewCom({ empleadoId: '', modelo: '', porcentaje: '', base: 'mensajes_propinas' })
    fetchAll()
  }

  async function deleteExpense(tipo: 'fijo' | 'variable' | 'comision', id: string) {
    const token = useAuthStore.getState().accessToken
    await fetch(`/api/crm/financial/expenses?tipo=${tipo}&id=${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    fetchAll()
  }

  const s = (style: Record<string, unknown>) => style

  return (
    <div style={s({ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' })}>
      {/* Header */}
      <div style={s({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 })}>
        <div>
          <h1 style={s({ fontSize: 22, fontWeight: 800, color: '#e8ecf5', letterSpacing: '-.02em' })}>Financiero</h1>
          <p style={s({ fontSize: 13, color: '#7280a0', marginTop: 2 })}>Ingresos · Gastos · Neto por modelo</p>
        </div>
        <div style={s({ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' })}>
          <input
            type="month" value={mes} onChange={e => setMes(e.target.value)}
            style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 6, color: '#e8ecf5', padding: '6px 10px', fontSize: 13 })}
          />
          <button onClick={() => runJob('detect-performance')}
            style={s({ background: '#d4832a22', border: '1px solid #d4832a44', color: '#d4832a', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
            ▶ Detección rendimiento
          </button>
          <button onClick={() => runJob('detect-devices')}
            style={s({ background: '#4e7fe822', border: '1px solid #4e7fe844', color: '#4e7fe8', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
            ▶ Detección móviles
          </button>
        </div>
      </div>

      {jobMsg && (
        <div style={s({ background: '#1fad6e22', border: '1px solid #1fad6e44', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#1fad6e' })}>
          {jobMsg}
        </div>
      )}

      {/* Infloww status */}
      {inflowwStatus && !inflowwStatus.configured && (
        <div style={s({ background: '#e9a82d11', border: '1px solid #e9a82d33', borderRadius: 8, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 })}>
          <span style={s({ fontSize: 20 })}>⚠️</span>
          <div>
            <div style={s({ fontSize: 14, fontWeight: 700, color: '#e9a82d' })}>Infloww no configurado</div>
            <div style={s({ fontSize: 12, color: '#7280a0', marginTop: 2 })}>
              {inflowwStatus.message ?? 'Añade INFLOWW_API_KEY e INFLOWW_API_URL en las variables de entorno de Vercel para sincronizar ingresos.'}
            </div>
          </div>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"
            style={s({ marginLeft: 'auto', background: '#e9a82d', color: '#000', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' })}>
            Añadir en Vercel →
          </a>
        </div>
      )}

      {expenses?.missing && (
        <div style={s({ background: '#d9484822', border: '1px solid #d9484844', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#d94848' })}>
          ⚠ Las tablas financieras no existen aún. Ejecuta <code style={s({ fontFamily: 'monospace' })}>supabase/phone_alerts_financial.sql</code> en Supabase.
        </div>
      )}

      {/* Tabs */}
      <div style={s({ display: 'flex', gap: 0, marginBottom: 20, background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, padding: 4 })}>
        {(['resumen', 'fijos', 'variables', 'comisiones'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={s({ flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
              background: tab === t ? '#1c2240' : 'transparent',
              color: tab === t ? '#e8ecf5' : '#3a4464',
            })}>
            {t === 'resumen' ? '📊 Resumen' : t === 'fijos' ? '🏢 Gastos Fijos' : t === 'variables' ? '📋 Gastos Variables' : '💼 Comisiones'}
          </button>
        ))}
      </div>

      {/* ── RESUMEN ─────────────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <div>
          {/* KPI row */}
          {summary && (
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 })}>
              {[
                { label: 'Bruto total', value: eur(summary.totals.bruto), color: '#4e7fe8' },
                { label: 'Gastos total', value: eur(summary.totals.gastos), color: '#d94848' },
                { label: 'Neto total', value: eur(summary.totals.neto), color: summary.totals.neto >= 0 ? '#1fad6e' : '#d94848' },
              ].map(k => (
                <div key={k.label} style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, padding: '16px 18px' })}>
                  <div style={s({ fontSize: 11, color: '#7280a0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 })}>{k.label}</div>
                  <div style={s({ fontSize: 26, fontWeight: 900, color: k.color, letterSpacing: '-.03em' })}>{k.value}</div>
                  {!summary.inflowwData && <div style={s({ fontSize: 11, color: '#3a4464', marginTop: 4 })}>Sin datos Infloww</div>}
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={s({ color: '#3a4464', textAlign: 'center', padding: 40 })}>Cargando...</div>
          ) : (
            <div style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, overflow: 'hidden' })}>
              <div style={s({ overflowX: 'auto' })}>
                <table style={s({ width: '100%', borderCollapse: 'collapse' })}>
                  <thead>
                    <tr style={s({ borderBottom: '1px solid #1c2240' })}>
                      {['Modelo', 'Bruto', 'Suscripciones', 'Mensajes/PPV', 'Propinas', 'G.Fijos', 'G.Variables', 'Comisiones', 'Neto'].map(h => (
                        <th key={h} style={s({ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' })}>
                          {h === 'Modelo' ? <span style={s({ textAlign: 'left', display: 'block' })}>{h}</span> : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.rows ?? []).map((row, i) => (
                      <tr key={row.modelo} style={s({ borderBottom: '1px solid #111628', background: i % 2 === 0 ? 'transparent' : '#08090f08' })}>
                        <td style={s({ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#e8ecf5' })}>{row.modelo}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: '#4e7fe8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' })}>{eur(row.bruto)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#7280a0', fontVariantNumeric: 'tabular-nums' })}>{eur(row.suscripcion)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#7280a0', fontVariantNumeric: 'tabular-nums' })}>{eur(row.mensaje_ppv)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#7280a0', fontVariantNumeric: 'tabular-nums' })}>{eur(row.propina)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#d94848', fontVariantNumeric: 'tabular-nums' })}>−{eur(row.gastosFijos)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#d94848', fontVariantNumeric: 'tabular-nums' })}>−{eur(row.gastosVariables)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: '#d94848', fontVariantNumeric: 'tabular-nums' })}>−{eur(row.comisiones)}</td>
                        <td style={s({ padding: '11px 14px', textAlign: 'right', fontSize: 14, fontWeight: 900, color: row.neto >= 0 ? '#1fad6e' : '#d94848', fontVariantNumeric: 'tabular-nums' })}>{eur(row.neto)}</td>
                      </tr>
                    ))}
                    {(summary?.rows ?? []).length === 0 && (
                      <tr><td colSpan={9} style={s({ padding: 32, textAlign: 'center', color: '#3a4464', fontSize: 13 })}>
                        Sin datos. {summary?.inflowwData === false ? 'Conecta Infloww para ver ingresos.' : 'Añade gastos para empezar.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GASTOS FIJOS ─────────────────────────────────────────────────── */}
      {tab === 'fijos' && (
        <div>
          <ExpenseForm title="Añadir gasto fijo" fields={[
            { key: 'modelo', label: 'Modelo (o "global")', value: newFijo.modelo, onChange: v => setNewFijo(p => ({ ...p, modelo: v })) },
            { key: 'concepto', label: 'Concepto', value: newFijo.concepto, onChange: v => setNewFijo(p => ({ ...p, concepto: v })) },
            { key: 'importe', label: 'Importe (€)', type: 'number', value: newFijo.importe, onChange: v => setNewFijo(p => ({ ...p, importe: v })) },
          ]} onSubmit={() => addExpense('fijo')} saving={saving} />
          <ExpenseTable
            headers={['Modelo', 'Concepto', 'Importe', '']}
            rows={(expenses?.fijos ?? []).map(g => [g.modelo, g.concepto, eur(g.importe), g.id])}
            onDelete={id => deleteExpense('fijo', id as string)}
          />
        </div>
      )}

      {/* ── GASTOS VARIABLES ─────────────────────────────────────────────── */}
      {tab === 'variables' && (
        <div>
          <ExpenseForm title="Añadir gasto variable" fields={[
            { key: 'modelo', label: 'Modelo (o "global")', value: newVar.modelo, onChange: v => setNewVar(p => ({ ...p, modelo: v })) },
            { key: 'concepto', label: 'Concepto', value: newVar.concepto, onChange: v => setNewVar(p => ({ ...p, concepto: v })) },
            { key: 'importe', label: 'Importe (€)', type: 'number', value: newVar.importe, onChange: v => setNewVar(p => ({ ...p, importe: v })) },
            { key: 'fecha', label: 'Fecha', type: 'date', value: newVar.fecha, onChange: v => setNewVar(p => ({ ...p, fecha: v })) },
          ]} onSubmit={() => addExpense('variable')} saving={saving} />
          <ExpenseTable
            headers={['Modelo', 'Concepto', 'Importe', 'Fecha', '']}
            rows={(expenses?.variables ?? []).map(g => [g.modelo, g.concepto, eur(g.importe), g.fecha, g.id])}
            onDelete={id => deleteExpense('variable', id as string)}
          />
        </div>
      )}

      {/* ── COMISIONES ───────────────────────────────────────────────────── */}
      {tab === 'comisiones' && (
        <div>
          <div style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontSize: 12, color: '#7280a0' })}>
            <strong style={s({ color: '#e8ecf5' })}>Base de comisión:</strong> &quot;mensajes_propinas&quot; = % sobre (mensajes PPV + propinas).
            &quot;bruto&quot; = % sobre ingresos brutos totales del modelo.
          </div>
          <ExpenseForm title="Añadir regla de comisión" fields={[
            { key: 'empleadoId', label: 'ID / nombre empleado', value: newCom.empleadoId, onChange: v => setNewCom(p => ({ ...p, empleadoId: v })) },
            { key: 'modelo', label: 'Modelo', value: newCom.modelo, onChange: v => setNewCom(p => ({ ...p, modelo: v })) },
            { key: 'porcentaje', label: '% comisión', type: 'number', value: newCom.porcentaje, onChange: v => setNewCom(p => ({ ...p, porcentaje: v })) },
            { key: 'base', label: 'Base', value: newCom.base, onChange: v => setNewCom(p => ({ ...p, base: v })), isSelect: true, options: ['mensajes_propinas', 'bruto'] },
          ]} onSubmit={() => addExpense('comision')} saving={saving} />
          <ExpenseTable
            headers={['Empleado', 'Modelo', '%', 'Base', '']}
            rows={(expenses?.comisiones ?? []).map(c => [c.empleadoId, c.modelo, `${c.porcentaje}%`, c.base, c.id])}
            onDelete={id => deleteExpense('comision', id as string)}
          />
        </div>
      )}
    </div>
  )
}

interface FormField {
  key: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  isSelect?: boolean
  options?: string[]
}

function ExpenseForm({ title, fields, onSubmit, saving }: { title: string; fields: FormField[]; onSubmit: () => void; saving: boolean }) {
  const s = (style: Record<string, unknown>) => style
  return (
    <div style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, padding: '16px 18px', marginBottom: 16 })}>
      <div style={s({ fontSize: 12, fontWeight: 800, color: '#7280a0', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 })}>{title}</div>
      <div style={s({ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' })}>
        {fields.map(f => (
          <div key={f.key} style={s({ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: 1 })}>
            <label style={s({ fontSize: 11, color: '#3a4464', fontWeight: 700 })}>{f.label}</label>
            {f.isSelect ? (
              <select value={f.value} onChange={e => f.onChange(e.target.value)}
                style={s({ background: '#16162a', border: '1px solid #1c2240', borderRadius: 5, color: '#e2e2e2', padding: '7px 10px', fontSize: 13 })}>
                {(f.options ?? []).map(o => <option key={o} value={o} style={s({ background: '#16162a' })}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type ?? 'text'} value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.label}
                style={s({ background: '#111628', border: '1px solid #1c2240', borderRadius: 5, color: '#e8ecf5', padding: '7px 10px', fontSize: 13 })} />
            )}
          </div>
        ))}
        <button onClick={onSubmit} disabled={saving}
          style={s({ background: '#e9a82d', color: '#000', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end' })}>
          {saving ? '...' : '+ Añadir'}
        </button>
      </div>
    </div>
  )
}

function ExpenseTable({ headers, rows, onDelete }: { headers: string[]; rows: (string | number)[][]; onDelete: (id: unknown) => void }) {
  const s = (style: Record<string, unknown>) => style
  const dataRows = rows
  return (
    <div style={s({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, overflow: 'hidden' })}>
      <table style={s({ width: '100%', borderCollapse: 'collapse' })}>
        <thead>
          <tr style={s({ borderBottom: '1px solid #1c2240' })}>
            {headers.map(h => (
              <th key={h} style={s({ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.07em' })}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={i} style={s({ borderBottom: '1px solid #111628' })}>
              {row.slice(0, -1).map((cell, j) => (
                <td key={j} style={s({ padding: '10px 14px', fontSize: 13, color: j === 2 ? '#e9a82d' : '#e8ecf5' })}>{String(cell)}</td>
              ))}
              <td style={s({ padding: '10px 14px', textAlign: 'right' })}>
                <button onClick={() => onDelete(row[row.length - 1])}
                  style={s({ background: 'transparent', border: 'none', color: '#3a4464', cursor: 'pointer', fontSize: 13, padding: '2px 6px' })}
                  title="Eliminar">✕</button>
              </td>
            </tr>
          ))}
          {dataRows.length === 0 && (
            <tr><td colSpan={headers.length} style={s({ padding: 24, textAlign: 'center', color: '#3a4464', fontSize: 13 })}>Sin registros</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
