'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { RefreshCw, Plus, LayoutGrid, Smartphone } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

const COLORS = ['#e05252','#f5a623','#34c759','#d4a843','#a78bfa','#e8623f','#3e9e74','#cf8a3f','#5b8dd9','#d4569e']
function avatarColor(username: string) {
  let h = 0; for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return COLORS[h % COLORS.length]
}
function initials(username: string) {
  return username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', suspended: 'Baneada', 'shadow banned': 'Warning', new: 'Nueva', unused: 'Desactivada', retiring: 'A retirar',
}
const STATUS_COLOR: Record<string, string> = {
  active: '#34c759', suspended: '#e05252', 'shadow banned': '#f5a623', new: '#d4a843', unused: '#6b7280', retiring: '#f5a623',
}

function Sparkline({ data, up, id }: { data: number[]; up: boolean; id: string }) {
  const w = 200, h = 44
  if (data.length < 2) return <div style={{ height: h }} />
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
  const X = (i: number) => (i / (data.length - 1)) * w
  const Y = (v: number) => h - 3 - ((v - mn) / rng) * (h - 8)
  const pts = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const area = `${pts} L${w},${h} L0,${h} Z`
  const stroke = up ? '#d4a843' : '#e05252'
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${id})`} />
      <path d={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Account {
  id: string
  username: string
  status: string
  model: string | null
  employee: string | null
  employeeId: string | null
  phoneRef: string | null
  igPassword: string | null
  igGroup: string | null
  niche: string | null
  accountType: string | null
  igEmail: string | null
  fa2: string | null
  notes: string | null
  sparkline: { fecha: string; seguidores: number }[]
  latest: {
    fecha: string
    seguidores: number | null
    seguidoresGanados: number | null
    siguiendo: number | null
    reproduccionesTotal: number | null
    postsHoy: number | null
    reelsHoy: number | null
    likesDia: number | null
    comentariosDia: number | null
  } | null
  prev: { seguidores: number | null } | null
  engagement: number | null
  seguidores: number | null
  posts: {
    id: string; shortcode: string; tipo: string; fechaPub: string | null
    visitas: number | null; likes: number | null; comentarios: number | null
  }[]
}

const TABS = [
  { label: 'Todas',        value: '' },
  { label: 'Activas',      value: 'active' },
  { label: 'Nuevas',       value: 'new' },
  { label: 'Warning',      value: 'shadow banned' },
  { label: 'Baneadas',     value: 'suspended' },
  { label: 'Retirar',      value: 'retiring' },
  { label: 'Desactivadas', value: 'unused' },
  { label: '⛔ Móvil bloqueado', value: 'blocked_phone' },
  { label: 'Unused sin empleado', value: 'unused_no_employee' },
]

function isBlockedPhoneAcc(a: { phoneRef: string | null }): boolean {
  return (a.phoneRef ?? '').includes('⛔')
}
function isUnusedNoEmployeeAcc(a: { status: string; employee: string | null }): boolean {
  return a.status.toLowerCase() === 'unused' && !a.employee
}
function isSpecialAcc(a: { phoneRef: string | null; status: string; employee: string | null }): boolean {
  return isBlockedPhoneAcc(a) || isUnusedNoEmployeeAcc(a)
}

// ── Account card ──────────────────────────────────────────────────────────────
function AccountCard({ acc, onOpen, onUnlock, unlocking, onDeactivate, onReactivate, deactivating }: {
  acc: Account; onOpen: () => void
  onUnlock?: () => void; unlocking?: boolean
  onDeactivate?: () => void; onReactivate?: () => void; deactivating?: boolean
}) {
  const color = avatarColor(acc.username)
  const inits = initials(acc.username)
  const sparkVals = (acc.sparkline ?? []).map(s => s.seguidores)
  const latest = acc.latest?.seguidores ?? null
  const prev = acc.prev?.seguidores ?? null
  const delta = latest !== null && prev !== null && prev > 0 ? ((latest - prev) / prev) * 100 : null
  const up = delta === null ? true : delta >= 0
  const statusKey = acc.status.toLowerCase()
  const statusLabel = STATUS_LABEL[statusKey] ?? acc.status
  const statusColor = STATUS_COLOR[statusKey] ?? '#6b7280'

  return (
    <div
      onClick={onOpen}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 0,
        cursor: 'pointer', transition: 'border-color .15s',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, minWidth: 40, borderRadius: 12,
          background: color, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff',
        }}>
          {inits}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{acc.username}
          </div>
          {acc.model && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{acc.model}</div>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
          background: `${statusColor}22`, color: statusColor, flexShrink: 0,
        }}>{statusLabel}</span>
      </div>

      {/* Followers */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>
            {latest !== null ? fmt(latest) : '—'}
          </span>
          {delta !== null && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: up ? 'rgba(52,199,89,0.12)' : 'rgba(224,82,82,0.12)',
              color: up ? '#34c759' : '#e05252',
            }}>
              {up ? '↑' : '↓'} {up ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 2 }}>
          SEGUIDORES
        </div>
      </div>

      {/* Sparkline */}
      {sparkVals.length >= 2 && (
        <div style={{ margin: '10px -18px', overflow: 'hidden' }}>
          <Sparkline data={sparkVals} up={up} id={acc.id} />
        </div>
      )}

      {/* Engagement */}
      <div style={{ marginBottom: 14, marginTop: sparkVals.length < 2 ? 12 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Engagement</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {acc.engagement !== null ? acc.engagement.toFixed(1) + '%' : '—'}
          </span>
        </div>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          {acc.engagement !== null && (
            <div style={{
              height: '100%',
              width: `${Math.min((acc.engagement / 10) * 100, 100)}%`,
              background: '#d4a843', borderRadius: 3,
            }} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
          {acc.phoneRef ?? <span style={{ color: 'var(--border)' }}>Sin móvil</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {acc.employee && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{acc.employee}</span>
          )}
          {acc.status === 'suspended' && onUnlock && (
            <button
              onClick={e => { e.stopPropagation(); onUnlock() }}
              disabled={unlocking}
              title="Marcar como activa y resincronizar"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(52,199,89,0.4)',
                background: 'rgba(52,199,89,0.1)', color: '#34c759',
                fontSize: 11, fontWeight: 700, cursor: unlocking ? 'not-allowed' : 'pointer',
                opacity: unlocking ? 0.6 : 1, flexShrink: 0,
              }}
            >
              🔓 {unlocking ? '…' : 'Desbloquear'}
            </button>
          )}
          {acc.status === 'unused' && onReactivate && (
            <button
              onClick={e => { e.stopPropagation(); onReactivate() }}
              disabled={deactivating}
              title="Reactivar cuenta"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(52,199,89,0.35)',
                background: 'rgba(52,199,89,0.08)', color: '#34c759',
                fontSize: 11, fontWeight: 700, cursor: deactivating ? 'not-allowed' : 'pointer',
                opacity: deactivating ? 0.6 : 1, flexShrink: 0,
              }}
            >
              ▶ {deactivating ? '…' : 'Reactivar'}
            </button>
          )}
          {acc.status !== 'unused' && acc.status !== 'suspended' && onDeactivate && (
            <button
              onClick={e => { e.stopPropagation(); onDeactivate() }}
              disabled={deactivating}
              title="Desactivar cuenta (no se borra)"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(107,114,128,0.35)',
                background: 'rgba(107,114,128,0.08)', color: '#6b7280',
                fontSize: 11, fontWeight: 700, cursor: deactivating ? 'not-allowed' : 'pointer',
                opacity: deactivating ? 0.6 : 1, flexShrink: 0,
              }}
            >
              ⏸ {deactivating ? '…' : 'Desactivar'}
            </button>
          )}
          <a
            href={`https://instagram.com/${acc.username}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Ver en Instagram"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7,
              background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
              color: '#fff', flexShrink: 0, textDecoration: 'none',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
            </svg>
          </a>
        </div>
      </div>

    </div>
  )
}

// ── Phone-grouped view ────────────────────────────────────────────────────────
function PhoneGroupedView({
  accounts, onOpen, onUnlock, unlockingId, onDeactivate, onReactivate, deactivatingId,
  onDeactivatePhone, onReactivatePhone, phoneSearch, onPhoneSearch,
}: {
  accounts: Account[]; onOpen: (acc: Account) => void
  onUnlock?: (acc: Account) => void; unlockingId?: string | null
  onDeactivate?: (acc: Account) => void; onReactivate?: (acc: Account) => void; deactivatingId?: string | null
  onDeactivatePhone?: (ref: string, accs: Account[]) => void
  onReactivatePhone?: (ref: string, accs: Account[]) => void
  phoneSearch?: string; onPhoneSearch?: (v: string) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of accounts) {
      const key = a.phoneRef ?? '(Sin móvil)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    const all = Array.from(map.entries())
      .map(([ref, accs]) => ({ ref, accounts: accs }))
      .sort((a, b) => b.accounts.length - a.accounts.length)
    if (!phoneSearch?.trim()) return all
    const q = phoneSearch.trim().toLowerCase()
    return all.filter(g => g.ref.toLowerCase().includes(q))
  }, [accounts, phoneSearch])

  const activeGroups   = groups.filter(g => g.accounts.some(a => a.status !== 'unused'))
  const inactiveGroups = groups.filter(g => g.accounts.every(a => a.status === 'unused'))

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['(Sin móvil)']))
  function toggleGroupCollapsed(ref: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  function PhoneCard({ ref: phoneRef, accounts: accs, inactive }: { ref: string; accounts: Account[]; inactive?: boolean }) {
    const active   = accs.filter(a => a.status === 'active').length
    const problems = accs.filter(a => ['suspended', 'shadow banned'].includes(a.status)).length
    const headerColor = inactive ? '#6b7280' : '#d4a843'
    const collapsed = collapsedGroups.has(phoneRef)
    return (
      <div style={{ background: 'var(--surface)', border: `1px solid ${inactive ? 'rgba(107,114,128,0.3)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', opacity: inactive ? 0.85 : 1 }}>
        {/* Phone header */}
        <div onClick={() => toggleGroupCollapsed(phoneRef)} style={{ padding: '12px 18px', background: inactive ? 'rgba(107,114,128,0.04)' : 'rgba(212,168,67,0.04)', borderBottom: collapsed ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={headerColor} strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
          <span style={{ fontSize: 14, fontWeight: 800, color: headerColor, flex: 1 }}>{phoneRef}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 8 }}>{accs.length} cuentas</span>
          {!inactive && <span style={{ fontSize: 11, color: '#34c759', fontWeight: 700 }}>{active} activas</span>}
          {!inactive && problems > 0 && <span style={{ fontSize: 11, color: '#e05252', fontWeight: 700, marginLeft: 6 }}>{problems} problemas</span>}
          {!inactive && onDeactivatePhone && phoneRef !== '(Sin móvil)' && (
            <button
              onClick={e => { e.stopPropagation(); onDeactivatePhone(phoneRef, accs) }}
              title="Desactivar todas las cuentas de este móvil"
              style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(107,114,128,0.35)', background: 'rgba(107,114,128,0.08)', color: '#6b7280', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
            >
              ⏸ Desactivar móvil
            </button>
          )}
          {inactive && onReactivatePhone && (
            <button
              onClick={e => { e.stopPropagation(); onReactivatePhone(phoneRef, accs) }}
              title="Reactivar todas las cuentas de este móvil"
              style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(52,199,89,0.35)', background: 'rgba(52,199,89,0.08)', color: '#34c759', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
            >
              ▶ Reactivar móvil
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{collapsed ? '▼' : '▲'}</span>
        </div>
        {/* Accounts */}
        {!collapsed && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {accs.map(acc => {
            const statusKey = acc.status.toLowerCase()
            const statusLabel = STATUS_LABEL[statusKey] ?? acc.status
            const statusColor = STATUS_COLOR[statusKey] ?? '#6b7280'
            const f = acc.latest?.seguidores
            const g = acc.latest?.seguidoresGanados
            const isProb = acc.status === 'suspended' || acc.status === 'shadow banned'
            return (
              <div key={acc.id} onClick={() => onOpen(acc)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: 'var(--surface2)', borderRadius: 8,
                border: `1px solid ${isProb ? '#e0525233' : 'var(--border)'}`,
                cursor: 'pointer',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: inactive ? '#7280a0' : '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{acc.username}
                </span>
                {acc.model && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{acc.model}</span>}
                {g != null && <span style={{ fontSize: 11, fontWeight: 700, color: g >= 0 ? '#34c759' : '#e05252', flexShrink: 0 }}>{g >= 0 ? '+' : ''}{fmt(g)}</span>}
                {f != null && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{fmt(f)}</span>}
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: `${statusColor}22`, color: statusColor, flexShrink: 0 }}>{statusLabel}</span>
                {acc.status === 'suspended' && onUnlock && (
                  <button onClick={e => { e.stopPropagation(); onUnlock(acc) }} disabled={unlockingId === acc.id}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(52,199,89,0.4)', background: 'rgba(52,199,89,0.1)', color: '#34c759', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    🔓 {unlockingId === acc.id ? '…' : 'Desbloquear'}
                  </button>
                )}
                {acc.status === 'unused' && onReactivate && (
                  <button onClick={e => { e.stopPropagation(); onReactivate(acc) }} disabled={deactivatingId === acc.id}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(52,199,89,0.35)', background: 'rgba(52,199,89,0.08)', color: '#34c759', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    ▶ {deactivatingId === acc.id ? '…' : 'Reactivar'}
                  </button>
                )}
                {acc.status !== 'unused' && acc.status !== 'suspended' && onDeactivate && (
                  <button onClick={e => { e.stopPropagation(); onDeactivate(acc) }} disabled={deactivatingId === acc.id}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(107,114,128,0.3)', background: 'rgba(107,114,128,0.06)', color: '#6b7280', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    ⏸ {deactivatingId === acc.id ? '…' : 'Desactivar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>
    )
  }

  const totalPhones = groups.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Buscador de móvil */}
      <div style={{ position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2.5"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          value={phoneSearch ?? ''}
          onChange={e => onPhoneSearch?.(e.target.value)}
          placeholder="Buscar móvil…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 14px 9px 34px', borderRadius: 9,
            background: '#0a0d18', border: '1px solid #1c2240',
            color: '#e8ecf5', fontSize: 13, outline: 'none',
          }}
        />
        {phoneSearch && (
          <button onClick={() => onPhoneSearch?.('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>
      {phoneSearch && (
        <div style={{ fontSize: 12, color: '#4a5568', marginTop: -6 }}>
          {totalPhones} {totalPhones === 1 ? 'móvil encontrado' : 'móviles encontrados'}
        </div>
      )}

      {activeGroups.map(({ ref, accounts: accs }) => (
        <PhoneCard key={ref} ref={ref} accounts={accs} />
      ))}

      {inactiveGroups.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(107,114,128,0.2)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              📦 Móviles desactivados ({inactiveGroups.length})
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(107,114,128,0.2)' }} />
          </div>
          {inactiveGroups.map(({ ref, accounts: accs }) => (
            <PhoneCard key={ref} ref={ref} accounts={accs} inactive />
          ))}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CuentasPage() {
  const params = useParams()
  const channel = params.channel as string
  const router = useRouter()
  const isEmpleado = useAuthStore(s => s.user?.roleName) === 'Empleado'
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [empleadoFilter, setEmpleadoFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'movil'>('grid')
  const [syncing, setSyncing] = useState(false)
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [phoneSearch, setPhoneSearch] = useState('')
  const [detailAcc, setDetailAcc] = useState<Account | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<{ notes: string; igPassword: string; igEmail: string; fa2: string; phoneRef: string }>({ notes: '', igPassword: '', igEmail: '', fa2: '', phoneRef: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status')
    if (status) setStatusFilter(status)
  }, [])

  useEffect(() => {
    const token = useAuthStore.getState().accessToken
    fetch('/api/crm/instagram/stats', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const modelos = useMemo(() => Array.from(new Set(accounts.map(a => a.model).filter(Boolean))).sort() as string[], [accounts])
  const empleados = useMemo(() => Array.from(new Set(accounts.map(a => a.employee).filter(Boolean))).sort() as string[], [accounts])

  const filtered = useMemo(() => {
    return accounts.filter(a => {
      const q = search.toLowerCase()
      const matchQ = !q || a.username.toLowerCase().includes(q) || (a.model ?? '').toLowerCase().includes(q)
      const matchM = !modeloFilter || (a.model ?? '') === modeloFilter
      const matchE = !empleadoFilter || (a.employee ?? '') === empleadoFilter
      if (!matchQ || !matchM || !matchE) return false

      if (statusFilter === 'blocked_phone') return isBlockedPhoneAcc(a)
      if (statusFilter === 'unused_no_employee') return isUnusedNoEmployeeAcc(a)
      if (isSpecialAcc(a)) return false // hidden from normal tabs by default
      return !statusFilter || a.status.toLowerCase() === statusFilter
    })
  }, [accounts, search, statusFilter, modeloFilter, empleadoFilter])

  const sorted = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const priority = (a: Account): number => {
      if (a.status === 'suspended') {
        const fecha = a.latest?.fecha ?? ''
        return fecha >= cutoffStr ? 0 : 100   // reciente arriba, antigua al final
      }
      if (a.status === 'shadow banned') return 1
      if (a.status === 'active')        return 2
      if (a.status === 'new')           return 3
      return 10
    }

    return [...filtered].sort((a, b) => {
      if (!statusFilter) {
        const aP = priority(a)
        const bP = priority(b)
        if (aP !== bP) return aP - bP
      }
      const aF = a.latest?.seguidores ?? -1
      const bF = b.latest?.seguidores ?? -1
      return sortDir === 'asc' ? aF - bF : bF - aF
    })
  }, [filtered, statusFilter, sortDir])

  const tabCounts = useMemo(() => {
    const out: Record<string, number> = { '': 0, blocked_phone: 0, unused_no_employee: 0 }
    for (const a of accounts) {
      if (isBlockedPhoneAcc(a)) out.blocked_phone++
      if (isUnusedNoEmployeeAcc(a)) out.unused_no_employee++
      if (isSpecialAcc(a)) continue // excluded from normal tab counts
      const s = a.status.toLowerCase()
      out[s] = (out[s] ?? 0) + 1
      out[''] = (out[''] ?? 0) + 1
    }
    return out
  }, [accounts])

  async function handleSync() {
    setSyncing(true)
    try {
      const token = useAuthStore.getState().accessToken
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      const r = await fetch('/api/crm/instagram/sync', { method: 'POST', headers, body: JSON.stringify({ force: false }) })
      const d = await r.json()
      if (d.info) {
        toast(d.info, 'info')
      } else if (d.ok) {
        toast(`Sync: ${d.procesadas} cuentas actualizadas${d.errores > 0 ? `, ${d.errores} errores` : ''}`, d.errores > 0 ? 'error' : 'success')
        const r2 = await fetch('/api/crm/instagram/stats', { headers })
        const d2 = await r2.json()
        setAccounts(d2.accounts ?? [])
      } else {
        toast(d.error ?? 'Error en sync', 'error')
      }
    } catch (e) {
      toast((e as Error).message ?? 'Error', 'error')
    } finally { setSyncing(false) }
  }

  async function handleUnlock(acc: Account) {
    setUnlockingId(acc.id)
    try {
      const token = useAuthStore.getState().accessToken
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      await fetch(`/api/crm/instagram/accounts/${acc.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'active' }) })
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, status: 'active' } : a))
      toast(`@${acc.username} desbloqueada — sincronizando...`, 'success')
      const r = await fetch('/api/crm/instagram/sync', { method: 'POST', headers, body: JSON.stringify({ accountId: acc.id, force: true }) })
      const d = await r.json()
      if (d.ok) {
        toast(`@${acc.username} sincronizada`, 'success')
        const r2 = await fetch('/api/crm/instagram/stats', { headers })
        const d2 = await r2.json()
        setAccounts(d2.accounts ?? [])
      }
    } catch {
      toast('Error al desbloquear', 'error')
    } finally {
      setUnlockingId(null)
    }
  }

  async function handleDeactivate(acc: Account) {
    setDeactivatingId(acc.id)
    try {
      const token = useAuthStore.getState().accessToken
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      await fetch(`/api/crm/instagram/accounts/${acc.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'unused' }) })
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, status: 'unused' } : a))
      toast(`@${acc.username} desactivada`, 'success')
    } catch {
      toast('Error al desactivar', 'error')
    } finally { setDeactivatingId(null) }
  }

  async function handleReactivate(acc: Account) {
    setDeactivatingId(acc.id)
    try {
      const token = useAuthStore.getState().accessToken
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      await fetch(`/api/crm/instagram/accounts/${acc.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'active' }) })
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, status: 'active' } : a))
      toast(`@${acc.username} reactivada`, 'success')
    } catch {
      toast('Error al reactivar', 'error')
    } finally { setDeactivatingId(null) }
  }

  async function handleDeactivatePhone(phoneRef: string, accs: Account[]) {
    const toDeactivate = accs.filter(a => a.status !== 'unused')
    for (const acc of toDeactivate) await handleDeactivate(acc)
    toast(`Móvil ${phoneRef} desactivado (${toDeactivate.length} cuentas)`, 'success')
  }

  async function handleReactivatePhone(phoneRef: string, accs: Account[]) {
    const toReactivate = accs.filter(a => a.status === 'unused')
    for (const acc of toReactivate) await handleReactivate(acc)
    toast(`Móvil ${phoneRef} reactivado (${toReactivate.length} cuentas)`, 'success')
  }

  function openPanel(acc: Account) {
    setDetailAcc(acc)
    setShowPwd(false)
    setEditing(false)
    setEditForm({ notes: acc.notes ?? '', igPassword: acc.igPassword ?? '', igEmail: acc.igEmail ?? '', fa2: acc.fa2 ?? '', phoneRef: acc.phoneRef ?? '' })
  }

  async function handleSaveEdit() {
    if (!detailAcc) return
    setSaving(true)
    try {
      const token = useAuthStore.getState().accessToken
      const body: Record<string, string | null> = {
        notes: editForm.notes || null,
        igPassword: editForm.igPassword || null,
        igEmail: editForm.igEmail || null,
        fa2: editForm.fa2 || null,
        phoneRef: editForm.phoneRef || null,
      }
      const r = await fetch(`/api/crm/instagram/accounts/${detailAcc.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
      const updated = { ...detailAcc, ...body }
      setAccounts(prev => prev.map(a => a.id === detailAcc.id ? updated as Account : a))
      setDetailAcc(updated as Account)
      setEditing(false)
      toast('Guardado', 'success')
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setSaving(false) }
  }

  // Count per model and employee (from unfiltered accounts so pills always show totals)
  const modeloCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of accounts) if (a.model) out[a.model] = (out[a.model] ?? 0) + 1
    return out
  }, [accounts])
  const empleadoCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of accounts) if (a.employee) out[a.employee] = (out[a.employee] ?? 0) + 1
    return out
  }, [accounts])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>
      Cargando cuentas…
    </div>
  )

  const panelSparkVals = detailAcc ? (detailAcc.sparkline ?? []).map(s => s.seguidores) : []
  const panelLatest = detailAcc?.latest?.seguidores ?? null
  const panelPrev = detailAcc?.prev?.seguidores ?? null
  const panelDelta = panelLatest !== null && panelPrev !== null && panelPrev > 0 ? ((panelLatest - panelPrev) / panelPrev) * 100 : null
  const panelUp = panelDelta === null ? true : panelDelta >= 0
  const panelStatusColor = detailAcc ? (STATUS_COLOR[detailAcc.status] ?? '#6b7280') : '#6b7280'

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Cuentas</h1>
          <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 13 }}>
            {filtered.length} cuentas{search || statusFilter || modeloFilter || empleadoFilter ? ' (filtradas)' : ' en cartera'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('grid')} title="Cuadrícula"
              style={{ padding: '7px 12px', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', background: viewMode === 'grid' ? '#d4a843' : 'transparent', color: viewMode === 'grid' ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
              <LayoutGrid size={14} /> Cuadrícula
            </button>
            <button onClick={() => setViewMode('movil')} title="Por móvil"
              style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', background: viewMode === 'movil' ? '#d4a843' : 'transparent', color: viewMode === 'movil' ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
              <Smartphone size={14} /> Por móvil
            </button>
          </div>
          {!isEmpleado && (
            <button onClick={handleSync} disabled={syncing} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
              opacity: syncing ? 0.6 : 1,
            }}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sincronizar
            </button>
          )}
          <Link href={`/crm/${channel}/ig-cuentas`} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            background: '#d4a843', color: '#000',
          }}>
            <Plus size={14} />
            Añadir
          </Link>
        </div>
      </div>

      {/* Search + Selects */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar @cuenta…"
          style={{ padding: '8px 14px', borderRadius: 8, minWidth: 200, background: '#0d1124', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 13, outline: 'none' }}
        />
        <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)}
          style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none', minWidth: 160, cursor: 'pointer', colorScheme: 'dark' }}>
          <option value="">Todos los modelos</option>
          {modelos.map(m => <option key={m} value={m}>{m} ({modeloCounts[m]})</option>)}
        </select>
        <select value={empleadoFilter} onChange={e => setEmpleadoFilter(e.target.value)}
          style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none', minWidth: 180, cursor: 'pointer', colorScheme: 'dark' }}>
          <option value="">Todos los empleados</option>
          {empleados.map(e => <option key={e} value={e}>{e} ({empleadoCounts[e]})</option>)}
        </select>
        <select value={sortDir} onChange={e => setSortDir(e.target.value as 'desc' | 'asc')}
          style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}>
          <option value="desc">↓ Más seguidores</option>
          <option value="asc">↑ Menos seguidores</option>
        </select>
        {(modeloFilter || empleadoFilter) && (
          <button onClick={() => { setModeloFilter(''); setEmpleadoFilter('') }}
            style={{ background: 'transparent', border: '1px solid #1c2240', borderRadius: 8, color: '#7280a0', padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const active = statusFilter === tab.value
          const count = tabCounts[tab.value] ?? 0
          return (
            <button key={tab.value} onClick={() => setStatusFilter(tab.value)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 500,
              background: active ? '#d4a843' : 'var(--surface)',
              color: active ? '#000' : 'var(--muted)',
              border: active ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', transition: 'all 0.12s',
            }}>
              {tab.label}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 20, height: 20, borderRadius: 999, padding: '0 5px',
                fontSize: 11, fontWeight: 700,
                background: active ? 'rgba(0,0,0,0.2)' : 'var(--surface2)',
                color: active ? '#000' : 'var(--muted)',
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: 15 }}>
          No se encontraron cuentas
        </div>
      ) : viewMode === 'movil' ? (
        <PhoneGroupedView
          accounts={sorted}
          onOpen={acc => router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(acc.username)}`)}
          onUnlock={handleUnlock}
          unlockingId={unlockingId}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          deactivatingId={deactivatingId}
          onDeactivatePhone={handleDeactivatePhone}
          onReactivatePhone={handleReactivatePhone}
          phoneSearch={phoneSearch}
          onPhoneSearch={setPhoneSearch}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {sorted.map(acc => (
            <AccountCard
              key={acc.id}
              acc={acc}
              onOpen={() => openPanel(acc)}
              onUnlock={() => handleUnlock(acc)}
              unlocking={unlockingId === acc.id}
              onDeactivate={() => handleDeactivate(acc)}
              onReactivate={() => handleReactivate(acc)}
              deactivating={deactivatingId === acc.id}
            />
          ))}
        </div>
      )}

      {/* Account detail side panel */}
      {detailAcc && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }} onClick={() => setDetailAcc(null)}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} />
            <div onClick={e => e.stopPropagation()} style={{
              width: 420, maxWidth: '100vw', height: '100%', background: '#0a0d1a',
              borderLeft: '1px solid #1c2240', display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
            }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1c2240' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: avatarColor(detailAcc.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {initials(detailAcc.username)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>@{detailAcc.username}</div>
                    <div style={{ fontSize: 12, color: '#7280a0', marginTop: 1 }}>
                      {[detailAcc.model, detailAcc.niche].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `${panelStatusColor}22`, color: panelStatusColor }}>
                      {STATUS_LABEL[detailAcc.status] ?? detailAcc.status}
                    </span>
                    <button onClick={() => setDetailAcc(null)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ padding: '20px 24px 0' }}>
                {/* Big number */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
                    {panelLatest !== null ? fmt(panelLatest) : '—'}
                  </span>
                  {panelDelta !== null && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: panelUp ? 'rgba(52,199,89,0.12)' : 'rgba(224,82,82,0.12)',
                      color: panelUp ? '#34c759' : '#e05252' }}>
                      {panelUp ? '↑' : '↓'}{panelUp ? '+' : ''}{panelDelta.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#4a5568', letterSpacing: '0.1em', marginBottom: 16 }}>SEGUIDORES</div>

                {/* Sparkline */}
                {panelSparkVals.length >= 2 && (
                  <div style={{ margin: '0 -24px', marginBottom: 20 }}>
                    <Sparkline data={panelSparkVals} up={panelUp} id={`panel-${detailAcc.id}`} />
                  </div>
                )}

                {/* Metric pills */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Engagement', value: detailAcc.engagement !== null ? `${detailAcc.engagement.toFixed(1)}%` : '—' },
                    { label: 'Plays', value: detailAcc.latest?.reproduccionesTotal ? fmt(detailAcc.latest.reproduccionesTotal) : '—' },
                    { label: 'Posts hoy', value: detailAcc.latest?.postsHoy !== null && detailAcc.latest?.postsHoy !== undefined ? String(detailAcc.latest.postsHoy) : '—' },
                    { label: 'Likes/día', value: detailAcc.latest?.likesDia ? fmt(detailAcc.latest.likesDia) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, color: '#4a5568', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: value === '—' ? '#2a3450' : '#e8ecf5' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Info row */}
                {([
                  { label: 'Empleado', value: detailAcc.employee },
                  { label: 'Móvil', value: detailAcc.phoneRef },
                  detailAcc.igGroup ? { label: 'Grupo', value: detailAcc.igGroup } : null,
                  detailAcc.accountType ? { label: 'Tipo', value: detailAcc.accountType } : null,
                ] as ({ label: string; value: string | null } | null)[]).filter((x): x is { label: string; value: string | null } => x !== null && x.value !== null).map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid #1c2240' }}>
                    <span style={{ fontSize: 12, color: '#7280a0', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 12, color: '#e8ecf5', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Credentials + Notes */}
              <div style={{ padding: '16px 24px', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Credenciales</div>
                  <button onClick={() => setEditing(e => !e)}
                    style={{ fontSize: 11, fontWeight: 700, color: editing ? '#e05252' : '#5b8dd9', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {editing ? '✕ Cancelar' : '✏ Editar'}
                  </button>
                </div>

                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { key: 'igPassword', label: 'CONTRASEÑA', type: 'password' },
                      { key: 'igEmail', label: 'EMAIL', type: 'email' },
                      { key: 'fa2', label: '2FA / CÓDIGO', type: 'text' },
                      { key: 'phoneRef', label: 'MÓVIL', type: 'text' },
                    ].map(({ key, label, type }) => (
                      <div key={key}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <input
                          type={type}
                          value={editForm[key as keyof typeof editForm]}
                          onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder={`Vacío = sin cambios`}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#060c1f', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 12, outline: 'none', fontFamily: key === 'fa2' || key === 'igPassword' ? 'monospace' : 'inherit' }}
                        />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>NOTAS</div>
                      <textarea
                        value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        placeholder="Notas internas sobre esta cuenta…"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#060c1f', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                    <button onClick={handleSaveEdit} disabled={saving}
                      style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#d4a843', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <>
                    {detailAcc.notes && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>NOTAS</div>
                        <div style={{ fontSize: 12, color: '#e8ecf5', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{detailAcc.notes}</div>
                      </div>
                    )}
                    {detailAcc.igPassword && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>CONTRASEÑA</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
                            {showPwd ? detailAcc.igPassword : '•'.repeat(Math.min(detailAcc.igPassword.length, 16))}
                          </span>
                          <button onClick={() => setShowPwd(p => !p)} style={{ background: 'none', border: 'none', color: '#5b8dd9', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{showPwd ? 'Ocultar' : 'Ver'}</button>
                          <button onClick={() => navigator.clipboard.writeText(detailAcc.igPassword!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {detailAcc.igEmail && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>EMAIL</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', flex: 1, wordBreak: 'break-all' }}>{detailAcc.igEmail}</span>
                          <button onClick={() => navigator.clipboard.writeText(detailAcc.igEmail!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {detailAcc.fa2 && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>2FA</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#e8ecf5', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{detailAcc.fa2}</span>
                          <button onClick={() => navigator.clipboard.writeText(detailAcc.fa2!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {!detailAcc.igPassword && !detailAcc.igEmail && !detailAcc.fa2 && !detailAcc.notes && (
                      <div style={{ fontSize: 12, color: '#2a3450', fontStyle: 'italic' }}>Sin credenciales guardadas — pulsa Editar para añadir</div>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              <div style={{ marginTop: 'auto', padding: '16px 24px 24px', display: 'flex', gap: 8 }}>
                <a href={`https://instagram.com/${detailAcc.username}`} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#1c2240', color: '#e8ecf5', fontWeight: 600, fontSize: 13, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  Instagram ↗
                </a>
                <button onClick={() => { setDetailAcc(null); router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(detailAcc.username)}`) }}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#1c2240', color: '#7280a0', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                  Stats completas →
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  )
}
