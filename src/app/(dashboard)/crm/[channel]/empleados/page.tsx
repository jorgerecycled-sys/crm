'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { AccountStatsModal, type ModalAccount } from '@/components/crm/AccountStatsModal'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

const STATUS_CYCLE = [null, 'active', 'shadow banned', 'suspended'] as const
const STATUS_CYCLE_COLORS = ['var(--muted)', '#34c759', '#f5a623', '#e05252']
const STATUS_CYCLE_ICONS = ['⇅', '●', '!', '✕']

const AVATAR_COLORS = ['#e05252','#f5a623','#34c759','#d4a843','#a78bfa','#e8623f','#3e9e74','#cf8a3f','#5b8dd9','#d4569e']
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

interface Account extends ModalAccount {
  employeeId: string | null
}

interface RealEmployee {
  id: string
  name: string
  linkedAccounts: number
}

interface EmpGroup {
  id: string | null
  name: string
  color: string
  accounts: Account[]
  totalFollowers: number
  ganados: number
  hasGanados: boolean
  active: number
  suspended: number
  shadow: number
  otros: number
}

export default function EmpleadosPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [employees, setEmployees] = useState<RealEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [statusCycle, setStatusCycle] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  useEffect(() => {
    const token = useAuthStore.getState().accessToken
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    Promise.all([
      fetch('/api/crm/instagram/stats?includePool=true', { headers: h }).then(r => r.json()),
      fetch('/api/crm/instagram/employee-names', { headers: h }).then(r => r.json()).catch(() => ({ withAccount: [] })),
    ])
      .then(([stats, empNames]) => {
        setAccounts(stats.accounts ?? [])
        setEmployees((empNames.withAccount ?? []).map((e: { id: string; name: string; linkedAccounts: number }) => ({ id: e.id, name: e.name, linkedAccounts: e.linkedAccounts })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Groups mirror the real employees in Usuarios (matched by employeeId, not
  // by the free-text `employee` name) — an employee with zero accounts still
  // shows up, and accounts nobody has claimed land in a separate bucket.
  const groups = useMemo<EmpGroup[]>(() => {
    const byEmployeeId = new Map<string, Account[]>()
    const unassigned: Account[] = []
    for (const a of accounts) {
      if (a.employeeId) {
        if (!byEmployeeId.has(a.employeeId)) byEmployeeId.set(a.employeeId, [])
        byEmployeeId.get(a.employeeId)!.push(a)
      } else {
        unassigned.push(a)
      }
    }

    function buildGroup(id: string | null, name: string, accs: Account[]): EmpGroup {
      const active = accs.filter(a => a.status === 'active').length
      const suspended = accs.filter(a => a.status === 'suspended').length
      const shadow = accs.filter(a => a.status === 'shadow banned').length
      const otros = accs.length - active - suspended - shadow
      const totalFollowers = accs.reduce((s, a) => s + (a.latest?.seguidores ?? 0), 0)
      const ganadosList = accs.map(a => a.latest?.seguidoresGanados).filter((g): g is number => g !== null)
      const ganados = ganadosList.reduce((s, g) => s + g, 0)
      const hasGanados = ganadosList.length > 0
      return { id, name, color: avatarColor(name), accounts: accs, totalFollowers, ganados, hasGanados, active, suspended, shadow, otros }
    }

    const employeeGroups = employees
      .map(emp => buildGroup(emp.id, emp.name, byEmployeeId.get(emp.id) ?? []))
      .sort((a, b) => b.totalFollowers - a.totalFollowers)

    const groups = [...employeeGroups]
    if (unassigned.length > 0) groups.push(buildGroup(null, '(Sin asignar)', unassigned))
    return groups
  }, [accounts, employees])

  const totalFollowers = groups.reduce((s, g) => s + g.totalFollowers, 0)

  const selGroup = selected ? groups.find(g => (g.id ?? '(Sin asignar)') === selected) : null

  const sortedAccounts = useMemo(() => {
    if (!selGroup) return []
    const sf = STATUS_CYCLE[statusCycle]
    const rows = sf ? selGroup.accounts.filter(a => a.status === sf) : selGroup.accounts
    if (!sort) return [...rows].sort((a, b) => (b.latest?.seguidores ?? 0) - (a.latest?.seguidores ?? 0))
    return [...rows].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      switch (sort.col) {
        case 'cuenta': return a.username.localeCompare(b.username) * d
        case 'modelo': return (a.model ?? '').localeCompare(b.model ?? '') * d
        case 'seguidores': return ((a.latest?.seguidores ?? -1) - (b.latest?.seguidores ?? -1)) * d
        case 'ganados': return ((a.latest?.seguidoresGanados ?? -Infinity) - (b.latest?.seguidoresGanados ?? -Infinity)) * d
        default: return (b.latest?.seguidores ?? 0) - (a.latest?.seguidores ?? 0)
      }
    })
  }, [selGroup, sort, statusCycle])

  function toggleSort(col: string) {
    setStatusCycle(0)
    setSort(prev => prev?.col === col ? (prev.dir === 'desc' ? { col, dir: 'asc' } : null) : { col, dir: 'desc' })
  }
  function cycleStatus() {
    setSort(null)
    setStatusCycle(c => (c + 1) % STATUS_CYCLE.length)
  }
  function sortArrow(col: string) {
    return sort?.col === col
      ? <span style={{ fontSize: 9, color: '#d4a843', marginLeft: 3 }}>{sort.dir === 'desc' ? '↓' : '↑'}</span>
      : <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', marginLeft: 3 }}>⇅</span>
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>
      Cargando…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Empleados</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
          {employees.length} empleados · {accounts.length} cuentas · {fmt(totalFollowers)} seguidores totales
        </p>
      </div>

      {/* Employee cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {groups.map(g => {
          const pctActive = g.accounts.length > 0 ? (g.active / g.accounts.length) * 100 : 0
          const groupKey = g.id ?? '(Sin asignar)'
          const isSelected = selected === groupKey
          return (
            <div
              key={groupKey}
              onClick={() => { setSelected(isSelected ? null : groupKey); setSort(null); setStatusCycle(0) }}
              style={{
                background: 'var(--surface)', border: `1px solid ${isSelected ? g.color : 'var(--border)'}`,
                borderRadius: 14, padding: 18, cursor: 'pointer',
                transition: 'border-color 0.15s',
                display: 'flex', flexDirection: 'column', gap: 14,
                opacity: g.id === null ? 0.7 : 1,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: g.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {g.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                    {g.accounts.length} cuenta{g.accounts.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                    {g.totalFollowers > 0 ? fmt(g.totalFollowers) : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 2 }}>Seguidores</div>
                </div>
              </div>

              {/* Ganados */}
              {g.hasGanados && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ganados hoy:</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.ganados >= 0 ? '#34c759' : '#e05252' }}>
                    {g.ganados >= 0 ? '+' : ''}{fmt(g.ganados)}
                  </span>
                </div>
              )}

              {/* Status breakdown */}
              {g.accounts.length > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <span>{g.active} activas</span>
                    {g.suspended > 0 && <span style={{ color: '#e05252' }}>{g.suspended} baneadas</span>}
                    {g.shadow > 0 && <span style={{ color: '#f5a623' }}>{g.shadow} warning</span>}
                    {g.otros > 0 && <span>{g.otros} otras</span>}
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ height: '100%', width: `${(g.active / g.accounts.length) * 100}%`, background: '#34c759', transition: 'width 0.3s' }} />
                    <div style={{ height: '100%', width: `${(g.shadow / g.accounts.length) * 100}%`, background: '#f5a623', transition: 'width 0.3s' }} />
                    <div style={{ height: '100%', width: `${(g.suspended / g.accounts.length) * 100}%`, background: '#e05252', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Sin cuentas asignadas todavía</div>
              )}

              {/* Pct active badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {g.accounts.length > 0 ? `${Math.round(pctActive)}% cuentas activas` : ' '}
                </span>
                <span style={{ fontSize: 11, color: g.color, fontWeight: 600 }}>
                  {isSelected ? 'Ocultar ▲' : 'Ver cuentas ▼'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Account list for selected employee */}
      {selGroup && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: selGroup.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Cuentas — {selGroup.name} ({sortedAccounts.length}{sortedAccounts.length !== selGroup.accounts.length ? ` de ${selGroup.accounts.length}` : ''})
            </span>
            {(sort || statusCycle > 0) && (
              <button onClick={() => { setSort(null); setStatusCycle(0) }}
                style={{ marginLeft: 'auto', fontSize: 10, color: '#7280a0', background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
                ✕ Limpiar
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {([
                    { col: 'cuenta', label: 'Cuenta' },
                    { col: 'modelo', label: 'Modelo' },
                    { col: 'seguidores', label: 'Seguidores' },
                    { col: 'ganados', label: 'Ganados hoy' },
                  ] as { col: string; label: string }[]).map(({ col, label }) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: sort?.col === col ? '#d4a843' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                      {label}{sortArrow(col)}
                    </th>
                  ))}
                  <th onClick={cycleStatus} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: STATUS_CYCLE_COLORS[statusCycle], textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    Estado{' '}
                    <span style={{ fontSize: statusCycle === 0 ? 8 : 9, color: statusCycle === 0 ? 'rgba(255,255,255,0.15)' : STATUS_CYCLE_COLORS[statusCycle], marginLeft: 3 }}>
                      {STATUS_CYCLE_ICONS[statusCycle]}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAccounts
                  .map(acc => {
                    const f = acc.latest?.seguidores ?? null
                    const g = acc.latest?.seguidoresGanados ?? null
                    const sColor = acc.status === 'active' ? '#34c759' : acc.status === 'suspended' ? '#e05252' : '#f5a623'
                    const sLabel = acc.status === 'active' ? 'Activa' : acc.status === 'suspended' ? 'Baneada' : acc.status === 'shadow banned' ? 'Warning' : acc.status
                    return (
                      <tr key={acc.id} onClick={() => setSelectedAccount(acc)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          @{acc.username}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
                          {acc.model ?? '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#fff' }}>
                          {f !== null ? fmt(f) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: g !== null ? (g >= 0 ? '#34c759' : '#e05252') : 'var(--muted)' }}>
                          {g !== null ? `${g >= 0 ? '+' : ''}${fmt(g)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: `${sColor}22`, color: sColor }}>
                            {sLabel}
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

      {employees.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '80px 20px', fontSize: 15 }}>
          No hay empleados dados de alta en Usuarios todavía.
        </div>
      )}

      {selectedAccount && <AccountStatsModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />}
    </div>
  )
}
