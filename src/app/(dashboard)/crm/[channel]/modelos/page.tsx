'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

function avatarColor(username: string) {
  const COLORS = ['#e05252','#f5a623','#34c759','#d4a843','#a78bfa','#e8623f','#3e9e74','#cf8a3f','#5b8dd9','#d4569e']
  let h = 0; for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return COLORS[h % COLORS.length]
}

const MODEL_COLORS = ['#d4a843','#34c759','#f5a623','#a78bfa','#e8623f','#e05252','#cf8a3f','#5b8dd9','#d4569e','#3ecf8e']

interface Account {
  id: string
  username: string
  status: string
  model: string | null
  employee: string | null
  sparkline: { fecha: string; seguidores: number }[]
  latest: { seguidores: number | null; seguidoresGanados: number | null } | null
  prev: { seguidores: number | null } | null
  engagement: number | null
}

interface ModelGroup {
  name: string
  color: string
  accounts: Account[]
  totalFollowers: number
  prevFollowers: number
  delta: number
}

export default function ModelosPage() {
  const { channel } = useParams<{ channel: string }>()
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const autoFilterHandled = useRef(false)
  useEffect(() => {
    const token = useAuthStore.getState().accessToken
    fetch('/api/crm/instagram/stats', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Auto-filter from URL ?modelo=NAME
  useEffect(() => {
    if (loading || autoFilterHandled.current) return
    const modelo = new URLSearchParams(window.location.search).get('modelo')
    if (modelo) { setActiveModel(modelo); autoFilterHandled.current = true }
  }, [loading])

  const groups = useMemo<ModelGroup[]>(() => {
    const map = new Map<string, Account[]>()
    for (const a of accounts) {
      const key = a.model ?? '(Sin modelo)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return Array.from(map.entries()).map(([name, accs], idx) => {
      const totalFollowers = accs.reduce((s, a) => s + (a.latest?.seguidores ?? 0), 0)
      const prevFollowers = accs.reduce((s, a) => s + (a.prev?.seguidores ?? 0), 0)
      const delta = totalFollowers - prevFollowers
      return { name, color: MODEL_COLORS[idx % MODEL_COLORS.length], accounts: accs, totalFollowers, prevFollowers, delta }
    }).sort((a, b) => b.totalFollowers - a.totalFollowers)
  }, [accounts])

  // Chart data: sparklines per model (last 10 days aggregated)
  const chartSeries = useMemo(() => {
    return groups.slice(0, 8).map(g => {
      const dateMap = new Map<string, number>()
      for (const acc of g.accounts) {
        for (const sp of (acc.sparkline ?? [])) {
          dateMap.set(sp.fecha, (dateMap.get(sp.fecha) ?? 0) + sp.seguidores)
        }
      }
      const points = Array.from(dateMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, value }))
      return { name: g.name, color: g.color, points }
    })
  }, [groups])

  const allDates = useMemo(() => {
    const dates = new Set<string>()
    for (const s of chartSeries) for (const p of s.points) dates.add(p.date)
    return Array.from(dates).sort()
  }, [chartSeries])

  const filteredSeries = activeModel ? chartSeries.filter(s => s.name === activeModel) : chartSeries

  const visibleGroup = activeModel ? groups.find(g => g.name === activeModel) : null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>
      Cargando…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Modelos</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
          Comparativa de crecimiento · {groups.length} modelos · {accounts.filter(a => a.status === 'active').length} cuentas activas
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setActiveModel(null)} style={{
          padding: '6px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          background: !activeModel ? '#d4a843' : 'var(--surface2)',
          color: !activeModel ? '#000' : 'var(--muted)',
          border: `1px solid ${!activeModel ? '#d4a843' : 'var(--border)'}`,
        }}>Todos</button>
        {groups.map(g => {
          const isActive = activeModel === g.name
          return (
            <button key={g.name} onClick={() => setActiveModel(isActive ? null : g.name)} style={{
              padding: '6px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              background: isActive ? `${g.color}22` : 'var(--surface2)',
              color: isActive ? g.color : 'var(--muted)',
              border: `1px solid ${isActive ? g.color + '55' : 'var(--border)'}`,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              {g.name}
            </button>
          )
        })}
      </div>

      {/* Chart */}
      {allDates.length >= 2 && filteredSeries.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
              {activeModel ? `Crecimiento — ${activeModel}` : 'Crecimiento de seguidores por modelo'}
            </div>
            {!activeModel && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {chartSeries.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ModelChart series={filteredSeries} allDates={allDates} />
        </div>
      )}

      {/* Summary cards when no filter */}
      {!activeModel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {groups.map(g => (
            <button key={g.name} onClick={() => setActiveModel(g.name)} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{g.name}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1, marginBottom: 6 }}>
                {g.totalFollowers > 0 ? fmt(g.totalFollowers) : '—'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{g.accounts.length} cuentas</span>
                {g.delta !== 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                    background: g.delta >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(224,82,82,0.12)',
                    color: g.delta >= 0 ? '#34c759' : '#e05252',
                  }}>
                    {g.delta > 0 ? '+' : ''}{fmt(g.delta)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Accounts table for selected model */}
      {visibleGroup && visibleGroup.accounts.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: visibleGroup.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Cuentas — {visibleGroup.name} ({visibleGroup.accounts.length})
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cuenta','Seguidores','Variación','Engagement','Empleado','Estado'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Cuenta' || h === 'Empleado' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleGroup.accounts
                  .sort((a, b) => (b.latest?.seguidores ?? 0) - (a.latest?.seguidores ?? 0))
                  .map((acc, rank) => {
                    const color = avatarColor(acc.username)
                    const inits = acc.username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
                    const f = acc.latest?.seguidores ?? 0
                    const p = acc.prev?.seguidores ?? 0
                    const delta = f - p
                    const deltaPct = p > 0 ? (delta / p) * 100 : null
                    return (
                      <tr key={acc.id} onClick={() => router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(acc.username)}`)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 9, background: color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
                              {inits}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>@{acc.username}</div>
                              {rank === 0 && <div style={{ fontSize: 10, color: '#34c759', fontWeight: 700 }}>🏆 Top cuenta</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#fff' }}>
                          {f > 0 ? fmt(f) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {delta !== 0 ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? '#34c759' : '#e05252' }}>
                              {delta > 0 ? '+' : ''}{fmt(delta)}
                              {deltaPct !== null && <span style={{ fontSize: 10, opacity: 0.75 }}> ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>}
                            </span>
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: acc.engagement !== null && acc.engagement > 3 ? '#34c759' : 'var(--muted)' }}>
                          {acc.engagement !== null ? acc.engagement.toFixed(1) + '%' : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 12 }}>
                          {acc.employee ?? '—'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: acc.status === 'active' ? 'rgba(52,199,89,0.12)' : 'rgba(224,82,82,0.12)', color: acc.status === 'active' ? '#34c759' : '#e05252' }}>
                            {acc.status === 'active' ? 'Activa' : acc.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '80px 20px', fontSize: 15 }}>
          No hay datos de modelos. Añade el campo "Modelo" a las cuentas de Instagram.
        </div>
      )}
    </div>
  )
}

function ModelChart({ series, allDates }: {
  series: { name: string; color: string; points: { date: string; value: number }[] }[]
  allDates: string[]
}) {
  const w = 720, h = 200, pb = 26, pt = 12
  const allVals = series.flatMap(s => s.points.map(p => p.value))
  const globalMax = Math.max(...allVals) || 1
  const globalMin = Math.min(...allVals) * 0.995
  const X = (i: number) => (i / Math.max(allDates.length - 1, 1)) * w
  const Y = (v: number) => h - pb - ((v - globalMin) / (globalMax - globalMin || 1)) * (h - pt - pb)
  const nLabels = Math.min(7, allDates.length)
  const labelIdxs = Array.from({ length: nLabels }, (_, i) => Math.round(i * (allDates.length - 1) / Math.max(nLabels - 1, 1)))

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        {series.map((s, idx) => (
          <linearGradient key={idx} id={`mf${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1="0" x2={w} y1={pt + t*(h-pt-pb)} y2={pt + t*(h-pt-pb)} stroke="#1c2030" strokeWidth="1" />
      ))}
      {series.map((s, idx) => {
        const lookup: Record<string, number> = {}
        s.points.forEach(p => { lookup[p.date] = p.value })
        let last = s.points[0]?.value ?? 0
        const filled = allDates.map(d => { if (lookup[d] !== undefined) last = lookup[d]; return last })
        const pts = filled.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
        const area = `${pts} L${X(allDates.length-1).toFixed(1)},${h-pb} L0,${h-pb} Z`
        const lastY = Y(filled[filled.length - 1] ?? 0)
        return (
          <g key={idx}>
            <path d={area} fill={`url(#mf${idx})`} />
            <path d={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={X(allDates.length-1)} cy={lastY} r="4" fill={s.color} stroke="#13161e" strokeWidth="2" />
          </g>
        )
      })}
      {labelIdxs.map(i => (
        <text key={i} x={X(i)} y={h-7} textAnchor="middle" fontSize="9.5" fill="#4a5a7a" fontFamily="sans-serif">
          {i === 0 ? 'antes' : i === allDates.length-1 ? 'hoy' : allDates[i].slice(5).replace('-','/')}
        </text>
      ))}
    </svg>
  )
}
