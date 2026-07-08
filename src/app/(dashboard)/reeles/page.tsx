'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

interface ReelRow {
  accountId: string
  username:  string
  employee:  string | null
  phoneRef:  string | null
  model:     string | null
  status:    string
  reels:     number
}

interface EmpStat {
  name:     string
  reels:    number
  required: number
  accounts: number
}

function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0]
}

function reelColor(uploaded: number, total: number) {
  if (total === 0) return '#5a6480'
  const pct = uploaded / total
  if (pct >= 1)   return '#34c759'
  if (pct >= 0.5) return '#f5a623'
  return '#e05252'
}

type SortKey = 'username' | 'reels' | 'employee' | 'phoneRef'

export default function ReelsReportPage() {
  const { user } = useAuthStore()
  const router   = useRouter()

  const [fecha,          setFecha]          = useState(yesterday)
  const [rows,           setRows]           = useState<ReelRow[]>([])
  const [required,       setRequired]       = useState(2)
  const [loading,        setLoading]        = useState(false)
  const [statusFilter,   setStatusFilter]   = useState<'all' | 'ok' | 'missing'>('all')
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null)
  const [search,         setSearch]         = useState('')
  const [sortKey,        setSortKey]        = useState<SortKey>('reels')
  const [sortAsc,        setSortAsc]        = useState(true)

  useEffect(() => {
    if (user && user.roleName === 'Empleado') router.replace('/dashboard')
  }, [user, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = useAuthStore.getState().accessToken
      const r = await fetch(`/api/admin/reel-report?fecha=${fecha}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setRows(d.rows ?? [])
      setRequired(d.required ?? 2)
      setEmployeeFilter(null)
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => { load() }, [load])

  // ── Employee summary cards ──────────────────────────────────────────────────
  const employeeStats = useMemo<EmpStat[]>(() => {
    const map = new Map<string, EmpStat>()
    for (const r of rows) {
      const name = r.employee ?? '(Sin asignar)'
      if (!map.has(name)) map.set(name, { name, reels: 0, required: 0, accounts: 0 })
      const e = map.get(name)!
      e.reels    += r.reels
      e.required += required
      e.accounts++
    }
    return Array.from(map.values()).sort((a, b) => {
      const pa = a.required ? a.reels / a.required : 0
      const pb = b.required ? b.reels / b.required : 0
      return pa - pb  // worst first
    })
  }, [rows, required])

  // ── Global stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const ok      = rows.filter(r => r.reels >= required).length
    const partial = rows.filter(r => r.reels > 0 && r.reels < required).length
    const none    = rows.filter(r => r.reels === 0).length
    return { total: rows.length, ok, partial, none }
  }, [rows, required])

  // ── Filtered + sorted table rows ───────────────────────────────────────────
  const sorted = useMemo(() => {
    const q = search.toLowerCase()
    let out = rows.filter(r => {
      if (statusFilter === 'ok'      && r.reels < required)  return false
      if (statusFilter === 'missing' && r.reels >= required) return false
      if (employeeFilter && (r.employee ?? '(Sin asignar)') !== employeeFilter) return false
      if (q && !r.username.toLowerCase().includes(q) &&
          !(r.employee ?? '').toLowerCase().includes(q) &&
          !(r.phoneRef ?? '').toLowerCase().includes(q)) return false
      return true
    })
    return [...out].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'reels')    cmp = a.reels - b.reels
      if (sortKey === 'username') cmp = a.username.localeCompare(b.username)
      if (sortKey === 'employee') cmp = (a.employee ?? '').localeCompare(b.employee ?? '')
      if (sortKey === 'phoneRef') cmp = (a.phoneRef ?? '').localeCompare(b.phoneRef ?? '')
      return sortAsc ? cmp : -cmp
    })
  }, [rows, statusFilter, employeeFilter, search, sortKey, sortAsc, required])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }
  function th(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th onClick={() => toggleSort(key)} style={{
        padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800,
        color: active ? '#d4a843' : '#3a4464', textTransform: 'uppercase',
        letterSpacing: '.07em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
      }}>
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    )
  }

  if (user?.roleName === 'Empleado') return null

  const S = (x: React.CSSProperties) => x

  return (
    <div style={S({ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' })}>

      {/* ── Header ── */}
      <div style={S({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 })}>
        <div>
          <div style={S({ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 })}>
            <span style={S({ fontSize: 26 })}>🎬</span>
            <h1 style={S({ fontSize: 24, fontWeight: 900, color: '#e8ecf5', letterSpacing: '-.03em', margin: 0 })}>Reels Diarios</h1>
          </div>
          <p style={S({ fontSize: 13, color: '#5a6480', margin: 0 })}>
            Cumplimiento de subida · {required} reels por cuenta y día
          </p>
        </div>
        <div style={S({ display: 'flex', alignItems: 'center', gap: 10 })}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={S({ padding: '7px 12px', borderRadius: 7, background: '#0c0f1e', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 13, outline: 'none', colorScheme: 'dark' })}
          />
          <button onClick={load} disabled={loading}
            style={S({ background: '#111628', border: '1px solid #1c2240', color: '#7280a0', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 })}>
            ↺ Actualizar
          </button>
        </div>
      </div>

      {/* ── Global stats ── */}
      <div style={S({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 })}>
        {[
          { label: 'Total cuentas', value: stats.total,   color: '#5b8dd9' },
          { label: '✓ Completas',   value: stats.ok,      color: '#34c759' },
          { label: '⚠ Solo 1',      value: stats.partial, color: '#f5a623' },
          { label: '✗ Sin reels',   value: stats.none,    color: '#e05252' },
        ].map(s => (
          <div key={s.label} style={S({ background: '#0c0f1e', border: `1px solid ${s.color}22`, borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: '12px 16px' })}>
            <div style={S({ fontSize: 10, fontWeight: 700, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 })}>{s.label}</div>
            <div style={S({ fontSize: 26, fontWeight: 900, color: s.color, fontVariantNumeric: 'tabular-nums' })}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Employee cards ── */}
      {employeeStats.length > 0 && (
        <div style={S({ marginBottom: 28 })}>
          <div style={S({ fontSize: 11, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 })}>
            Resumen por empleado
          </div>
          <div style={S({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 })}>
            {employeeStats.map(e => {
              const color   = reelColor(e.reels, e.required)
              const pct     = e.required > 0 ? Math.min((e.reels / e.required) * 100, 100) : 0
              const isActive = employeeFilter === e.name
              return (
                <div key={e.name}
                  onClick={() => setEmployeeFilter(isActive ? null : e.name)}
                  style={S({
                    background: isActive ? `${color}14` : '#0c0f1e',
                    border: `1px solid ${isActive ? color + '66' : '#1a1f38'}`,
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 10, padding: '14px 16px',
                    cursor: 'pointer', transition: 'border-color .15s, background .15s',
                  })}
                >
                  {/* Name */}
                  <div style={S({ fontSize: 13, fontWeight: 800, color: '#e8ecf5', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                    {e.name}
                  </div>

                  {/* Big fraction */}
                  <div style={S({ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 })}>
                    <span style={S({ fontSize: 28, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', lineHeight: 1 })}>
                      {e.reels}
                    </span>
                    <span style={S({ fontSize: 14, fontWeight: 700, color: '#3a4464' })}>/{e.required}</span>
                    <span style={S({ fontSize: 10, color: '#3a4464', marginLeft: 4 })}>reels</span>
                  </div>

                  {/* Progress bar */}
                  <div style={S({ height: 4, background: '#1a1f38', borderRadius: 4, overflow: 'hidden', marginBottom: 8 })}>
                    <div style={S({ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .3s' })} />
                  </div>

                  {/* Footer */}
                  <div style={S({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                    <span style={S({ fontSize: 11, color: '#3a4464' })}>{e.accounts} cuentas</span>
                    <span style={S({ fontSize: 11, fontWeight: 700, color })}>
                      {pct === 100 ? '✓ Perfecto' : pct === 0 ? '✗ Ninguno' : `${Math.round(pct)}%`}
                    </span>
                  </div>

                  {isActive && (
                    <div style={S({ marginTop: 8, fontSize: 10, color, fontWeight: 700, textAlign: 'center' })}>
                      Filtrando · clic para quitar
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Table filters ── */}
      <div style={S({ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' })}>
        <div style={S({ position: 'relative' })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2.5"
            style={S({ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' })}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cuenta, empleado, móvil…"
            style={S({ padding: '7px 12px 7px 30px', borderRadius: 7, background: '#0c0f1e', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 13, outline: 'none', minWidth: 240 })}
          />
        </div>
        {(['all', 'ok', 'missing'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={S({ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: statusFilter === f ? '#d4a843' : '#111628', color: statusFilter === f ? '#000' : '#5a6480' })}>
            {f === 'all' ? 'Todas' : f === 'ok' ? '✓ Completas' : '✗ Incompletas'}
          </button>
        ))}
        {employeeFilter && (
          <span style={S({ fontSize: 12, color: '#d4a843', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 })}>
            · {employeeFilter}
            <button onClick={() => setEmployeeFilter(null)}
              style={S({ background: 'none', border: 'none', color: '#5a6480', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 })}>✕</button>
          </span>
        )}
        <span style={S({ fontSize: 12, color: '#3a4464', marginLeft: 'auto' })}>
          {loading ? 'Cargando…' : `${sorted.length} cuentas`}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={S({ background: '#0c0f1e', border: '1px solid #1a1f38', borderRadius: 10, overflow: 'hidden' })}>
        <div style={S({ overflowX: 'auto' })}>
          <table style={S({ width: '100%', borderCollapse: 'collapse' })}>
            <thead>
              <tr style={S({ borderBottom: '1px solid #1a1f38' })}>
                {th('username', 'Cuenta')}
                {th('employee', 'Empleado')}
                {th('phoneRef', 'Móvil')}
                <th style={S({ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.07em' })}>Modelo</th>
                {th('reels', 'Reels')}
                <th style={S({ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.07em' })}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={6} style={S({ padding: 40, textAlign: 'center', color: '#3a4464', fontSize: 13 })}>
                  {loading ? 'Cargando datos…' : 'No hay datos para esta fecha'}
                </td></tr>
              )}
              {sorted.map(row => {
                const color  = reelColor(row.reels, required)
                const rowBg  = row.reels === 0 ? 'rgba(224,82,82,0.04)' : row.reels < required ? 'rgba(245,166,35,0.04)' : 'transparent'
                return (
                  <tr key={row.accountId} style={S({ borderBottom: '1px solid #0e1228', background: rowBg })}>
                    <td style={S({ padding: '10px 14px' })}>
                      <div style={S({ display: 'flex', alignItems: 'center', gap: 8 })}>
                        <div style={S({ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 })} />
                        <a href={`https://instagram.com/${row.username}`} target="_blank" rel="noopener noreferrer"
                          style={S({ fontSize: 13, fontWeight: 700, color: '#e8ecf5', textDecoration: 'none' })}>
                          @{row.username}
                        </a>
                      </div>
                    </td>
                    <td style={S({ padding: '10px 14px', fontSize: 12, color: '#7280a0' })}>
                      {row.employee
                        ? <button onClick={() => setEmployeeFilter(f => f === row.employee ? null : row.employee)}
                            style={S({ background: 'none', border: 'none', color: employeeFilter === row.employee ? '#d4a843' : '#7280a0', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: employeeFilter === row.employee ? 700 : 400 })}>
                            {row.employee}
                          </button>
                        : '—'}
                    </td>
                    <td style={S({ padding: '10px 14px', fontSize: 12, color: '#7280a0', fontFamily: 'monospace' })}>{row.phoneRef ?? '—'}</td>
                    <td style={S({ padding: '10px 14px', fontSize: 12, color: '#5a6480' })}>{row.model ?? '—'}</td>
                    <td style={S({ padding: '10px 14px' })}>
                      <div style={S({ display: 'flex', gap: 4 })}>
                        {Array.from({ length: required }).map((_, i) => (
                          <div key={i} style={S({
                            width: 22, height: 22, borderRadius: 5, fontSize: 10, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: i < row.reels ? color + '33' : '#1a1f38',
                            color: i < row.reels ? color : '#2a3050',
                            border: `1px solid ${i < row.reels ? color + '66' : '#1a1f38'}`,
                          })}>
                            {i < row.reels ? '▶' : '○'}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={S({ padding: '10px 14px' })}>
                      <span style={S({ fontSize: 12, fontWeight: 700, color })}>
                        {row.reels >= required ? `✓ ${row.reels}/${required}` : row.reels > 0 ? `⚠ ${row.reels}/${required}` : `✗ ${row.reels}/${required}`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={S({ marginTop: 14, fontSize: 11, color: '#2a3050' })}>
        Datos basados en posts detectados por el sync diario. El robot crea una incidencia automática cuando hay reels pendientes.
      </p>
    </div>
  )
}
