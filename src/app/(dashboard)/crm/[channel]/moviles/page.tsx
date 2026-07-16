'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'
import { LayoutGrid, List } from 'lucide-react'
import { AccountStatsModal } from '@/components/crm/AccountStatsModal'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

function GaugeCircle({ pct, size = 58 }: { pct: number; size?: number }) {
  const stroke = 5, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, pct / 100)) * circ
  const color = pct >= 70 ? '#34c759' : pct >= 40 ? '#f5a623' : '#e05252'
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#252a3a" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
        {Math.round(pct)}%
      </div>
    </div>
  )
}

function SignalBars({ level }: { level: number }) {
  const bars = [0.35, 0.55, 0.75, 1.0]
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {bars.map((h, i) => (
        <rect key={i} x={i * 4} y={12 - h * 12} width="3" height={h * 12} rx="1"
          fill={i < level ? '#d4a843' : '#252a3a'} />
      ))}
    </svg>
  )
}

const STATUS_COLOR: Record<string, string> = {
  active: '#34c759', suspended: '#e05252', 'shadow banned': '#f5a623', new: '#d4a843', unused: '#6b7280', retiring: '#f5a623',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', suspended: 'Baneada', 'shadow banned': 'Warning', new: 'Nueva', unused: 'Inactiva', retiring: 'A retirar',
}

interface Account {
  id: string
  username: string
  status: string
  latest: {
    seguidores: number | null
    seguidoresGanados: number | null
    reproduccionesTotal: number | null
    siguiendo: number | null
    postsHoy: number | null
    reelsHoy: number | null
    likesDia: number | null
    comentariosDia: number | null
  } | null
  prev: { seguidores: number | null } | null
  sparkline: { fecha: string; seguidores: number }[]
  phoneRef: string | null
  model: string | null
  employee: string | null
  engagement: number | null
  seguidores: number | null
  posts: {
    id: string; shortcode: string; tipo: string; fechaPub: string | null
    visitas: number | null; likes: number | null; comentarios: number | null
  }[]
}

interface PhoneGroup {
  ref: string
  accounts: Account[]
  totalFollowers: number
  ganados: number
  hasGanados: boolean
  totalRepro: number
  active: number
  suspended: number
  shadow: number
  pct: number
}

interface PhoneAlert { phoneRef: string; status: string; deadCount: number; reason: string | null }

interface PhoneInfo {
  phoneRef: string
  gmailUser: string | null
  gmailPassword: string | null
  appleId: string | null
  appleIdPassword: string | null
  appleIdPhone: string | null
  remoteLink: string | null
  notes: string | null
}

export default function MovilesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [phoneAlerts, setPhoneAlerts] = useState<Map<string, PhoneAlert>>(new Map())
  const [phoneInfo, setPhoneInfo] = useState<Map<string, PhoneInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [empleadoFilter, setEmpleadoFilter] = useState('')
  const [phoneFilterMode, setPhoneFilterMode] = useState<'normal' | 'blocked'>('normal')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [highlightPhone, setHighlightPhone] = useState<string | null>(null)
  const phoneRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const autoScrollHandled = useRef(false)
  const [detailPhoneRef, setDetailPhoneRef] = useState<string | null>(null)
  const [showGmailPwd, setShowGmailPwd] = useState(false)
  const [showApplePwd, setShowApplePwd] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneEditForm, setPhoneEditForm] = useState<{ gmailUser: string; gmailPassword: string; appleId: string; appleIdPassword: string; appleIdPhone: string; remoteLink: string; notes: string }>({
    gmailUser: '', gmailPassword: '', appleId: '', appleIdPassword: '', appleIdPhone: '', remoteLink: '', notes: '',
  })
  const [savingPhone, setSavingPhone] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  useEffect(() => {
    const token = useAuthStore.getState().accessToken
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    Promise.all([
      fetch('/api/crm/instagram/stats', { headers: h }).then(r => r.json()),
      fetch('/api/crm/instagram/phone-alerts', { headers: h }).then(r => r.json()).catch(() => ({ alerts: [] })),
      fetch('/api/crm/instagram/phones', { headers: h }).then(r => r.json()).catch(() => ({ phones: [] })),
    ]).then(([stats, alerts, phones]) => {
      setAccounts(stats.accounts ?? [])
      const m = new Map<string, PhoneAlert>()
      for (const a of (alerts.alerts ?? [])) m.set(a.phoneRef, a as PhoneAlert)
      setPhoneAlerts(m)
      const p = new Map<string, PhoneInfo>()
      for (const info of (phones.phones ?? [])) p.set(info.phoneRef, info as PhoneInfo)
      setPhoneInfo(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Auto-scroll to phone from URL ?movil=REF
  useEffect(() => {
    if (loading || autoScrollHandled.current) return
    const movil = new URLSearchParams(window.location.search).get('movil')
    if (!movil) return
    autoScrollHandled.current = true
    setHighlightPhone(movil)
    setTimeout(() => {
      const el = phoneRefs.current.get(movil)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }, [loading])

  function openPhoneDetail(phoneRef: string) {
    setDetailPhoneRef(phoneRef)
    setShowGmailPwd(false)
    setShowApplePwd(false)
    setEditingPhone(false)
    const info = phoneInfo.get(phoneRef)
    setPhoneEditForm({
      gmailUser: info?.gmailUser ?? '',
      gmailPassword: info?.gmailPassword ?? '',
      appleId: info?.appleId ?? '',
      appleIdPassword: info?.appleIdPassword ?? '',
      appleIdPhone: info?.appleIdPhone ?? '',
      remoteLink: info?.remoteLink ?? '',
      notes: info?.notes ?? '',
    })
  }

  async function handleSavePhone() {
    if (!detailPhoneRef) return
    setSavingPhone(true)
    try {
      const token = useAuthStore.getState().accessToken
      const body = { phoneRef: detailPhoneRef, ...phoneEditForm }
      const r = await fetch('/api/crm/instagram/phones', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
      const updated = await r.json()
      setPhoneInfo(prev => {
        const next = new Map(prev)
        next.set(detailPhoneRef, updated as PhoneInfo)
        return next
      })
      setEditingPhone(false)
      toast('Guardado', 'success')
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setSavingPhone(false) }
  }

  async function resolvePhoneAlert(phoneRef: string) {
    const token = useAuthStore.getState().accessToken
    await fetch('/api/crm/instagram/phone-alerts', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneRef }),
    })
    setPhoneAlerts(prev => {
      const next = new Map(prev)
      const cur = next.get(phoneRef)
      if (cur) next.set(phoneRef, { ...cur, status: 'ok' })
      return next
    })
  }

  const modelos = useMemo(() => Array.from(new Set(accounts.map(a => a.model).filter(Boolean))).sort() as string[], [accounts])
  const empleados = useMemo(() => Array.from(new Set(accounts.map(a => a.employee).filter(Boolean))).sort() as string[], [accounts])
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

  const blockedPhoneCount = useMemo(() => {
    return new Set(accounts.filter(a => (a.phoneRef ?? '').includes('⛔')).map(a => a.phoneRef)).size
  }, [accounts])

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const matchM = !modeloFilter || (a.model ?? '') === modeloFilter
      const matchE = !empleadoFilter || (a.employee ?? '') === empleadoFilter
      const matchS = !search.trim() || (a.phoneRef ?? '').toLowerCase().includes(search.trim().toLowerCase())
      const isBlocked = (a.phoneRef ?? '').includes('⛔')
      const matchB = phoneFilterMode === 'blocked' ? isBlocked : !isBlocked
      return matchM && matchE && matchS && matchB
    })
  }, [accounts, modeloFilter, empleadoFilter, search, phoneFilterMode])

  const groups = useMemo<PhoneGroup[]>(() => {
    const map = new Map<string, Account[]>()
    for (const a of filteredAccounts) {
      const key = a.phoneRef ?? '(Sin móvil)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return Array.from(map.entries()).map(([ref, accs]) => {
      const active = accs.filter(a => a.status === 'active').length
      const suspended = accs.filter(a => a.status === 'suspended').length
      const shadow = accs.filter(a => a.status === 'shadow banned').length
      const totalFollowers = accs.reduce((s, a) => s + (a.latest?.seguidores ?? 0), 0)
      const ganadosList = accs.map(a => a.latest?.seguidoresGanados).filter((g): g is number => g !== null)
      const ganados = ganadosList.reduce((s, g) => s + g, 0)
      const hasGanados = ganadosList.length > 0
      const totalRepro = accs.reduce((s, a) => s + (a.latest?.reproduccionesTotal ?? 0), 0)
      const pct = accs.length > 0 ? (active / accs.length) * 100 : 0
      return { ref, accounts: accs, totalFollowers, ganados, hasGanados, totalRepro, active, suspended, shadow, pct }
    }).sort((a, b) => {
      const aProb = a.suspended + a.shadow
      const bProb = b.suspended + b.shadow
      if (bProb !== aProb) return bProb - aProb
      return b.totalFollowers - a.totalFollowers
    })
  }, [filteredAccounts])

  const totalFollowers = groups.reduce((s, g) => s + g.totalFollowers, 0)
  const totalAccounts = filteredAccounts.length
  const totalActive = filteredAccounts.filter(a => a.status === 'active').length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>
      Cargando…
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Móviles</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 13 }}>
          {groups.length} dispositivos · {totalAccounts} cuentas · {fmt(totalFollowers)} seguidores totales
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2.5"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar móvil…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 36px 9px 34px', borderRadius: 9,
            background: '#0a0d18', border: '1px solid #1c2240',
            color: '#e8ecf5', fontSize: 13, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {/* Phone filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Todos', value: 'normal' as const },
          { label: `⛔ Bloqueados (${blockedPhoneCount})`, value: 'blocked' as const },
        ].map(tab => {
          const active = phoneFilterMode === tab.value
          return (
            <button key={tab.value} onClick={() => setPhoneFilterMode(tab.value)} style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 500,
              background: active ? '#d4a843' : 'var(--surface)',
              color: active ? '#000' : 'var(--muted)',
              border: active ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
            }}>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
        {(modeloFilter || empleadoFilter || search) && (
          <button onClick={() => { setModeloFilter(''); setEmpleadoFilter(''); setSearch('') }}
            style={{ background: 'transparent', border: '1px solid #1c2240', borderRadius: 8, color: '#7280a0', padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}

        {/* View toggle: cards vs table */}
        <div style={{ display: 'flex', background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          <button onClick={() => setViewMode('cards')} title="Tarjetas"
            style={{ padding: '8px 12px', border: 'none', borderRight: '1px solid #1c2240', cursor: 'pointer', background: viewMode === 'cards' ? '#d4a843' : 'transparent', color: viewMode === 'cards' ? '#000' : '#7280a0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
            <LayoutGrid size={14} /> Tarjetas
          </button>
          <button onClick={() => setViewMode('table')} title="Tabla"
            style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', background: viewMode === 'table' ? '#d4a843' : 'transparent', color: viewMode === 'table' ? '#000' : '#7280a0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
            <List size={14} /> Tabla
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Dispositivos', v: String(groups.filter(g => g.ref !== '(Sin móvil)').length), color: '#fff' },
          { label: 'Cuentas total', v: String(totalAccounts), color: '#fff' },
          { label: 'Cuentas activas', v: String(totalActive), color: '#34c759' },
          { label: 'Total seguidores', v: fmt(totalFollowers), color: '#d4a843' },
          { label: 'Móviles a cambiar', v: String(Array.from(phoneAlerts.values()).filter(a => a.status === 'cambiar').length), color: '#d94848' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {viewMode === 'cards' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {groups.map((phone) => {
          const problems = phone.suspended + phone.shadow
          const signalLevel = phone.pct >= 75 ? 4 : phone.pct >= 50 ? 3 : phone.pct >= 25 ? 2 : phone.accounts.length > 0 ? 1 : 0
          const alert = phoneAlerts.get(phone.ref)
          const needsChange = alert?.status === 'cambiar'

          const hasCreds = phone.ref !== '(Sin móvil)' && phoneInfo.has(phone.ref)

          return (
            <div key={phone.ref} ref={el => { if (el) phoneRefs.current.set(phone.ref, el); else phoneRefs.current.delete(phone.ref) }}
              onClick={() => phone.ref !== '(Sin móvil)' && openPhoneDetail(phone.ref)}
              style={{
              background: 'var(--surface)',
              border: `1px solid ${highlightPhone === phone.ref ? '#d4a843' : needsChange ? '#d94848' : 'var(--border)'}`,
              boxShadow: highlightPhone === phone.ref ? '0 0 0 2px rgba(212,168,67,0.25)' : undefined,
              borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
              cursor: phone.ref !== '(Sin móvil)' ? 'pointer' : 'default',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {needsChange ? (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#d94848', background: '#d9484822', border: '1px solid #d9484866', borderRadius: 4, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ⚠ CAMBIAR MÓVIL
                      </span>
                    ) : problems === 0 && phone.accounts.length > 0 ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#34c759', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759', display: 'inline-block' }} /> ACTIVO
                      </span>
                    ) : problems > 0 ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f5a623', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f5a623', display: 'inline-block' }} /> REVISAR
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} /> VACÍO
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {phone.ref}
                    {hasCreds && <span title="Tiene credenciales guardadas" style={{ fontSize: 11 }}>🔑</span>}
                  </div>
                  {needsChange && alert?.reason && (
                    <div style={{ fontSize: 11, color: '#d94848', marginTop: 3 }}>{alert.reason}</div>
                  )}
                </div>
                <GaugeCircle pct={phone.pct} />
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <div style={{ background: 'rgba(212,168,67,0.07)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Seguidores</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: phone.totalFollowers > 0 ? '#d4a843' : 'var(--muted)' }}>
                    {phone.totalFollowers > 0 ? fmt(phone.totalFollowers) : '—'}
                  </div>
                </div>
                <div style={{ background: phone.hasGanados ? 'rgba(52,199,89,0.07)' : 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Ganados hoy</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: phone.hasGanados ? (phone.ganados >= 0 ? '#34c759' : '#e05252') : 'var(--muted)' }}>
                    {phone.hasGanados ? `${phone.ganados >= 0 ? '+' : ''}${fmt(phone.ganados)}` : '—'}
                  </div>
                </div>
                <div style={{ background: 'rgba(167,139,250,0.07)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Reproduc.</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: phone.totalRepro > 0 ? '#a78bfa' : 'var(--muted)' }}>
                    {phone.totalRepro > 0 ? fmt(phone.totalRepro) : '—'}
                  </div>
                </div>
              </div>

              {/* Account list */}
              {phone.accounts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {phone.accounts.slice(0, 4).map(acc => {
                    const s = STATUS_COLOR[acc.status] ?? 'var(--muted)'
                    const isProb = acc.status === 'suspended' || acc.status === 'shadow banned'
                    const f = acc.latest?.seguidores
                    const g = acc.latest?.seguidoresGanados
                    return (
                      <div key={acc.id} onClick={e => { e.stopPropagation(); setSelectedAccount(acc) }} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 9px', borderRadius: 8,
                        background: 'var(--surface2)',
                        border: `1px solid ${isProb ? 'rgba(224,82,82,0.2)' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: s, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: isProb ? '#e05252' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          @{acc.username}
                        </span>
                        {g != null && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: g >= 0 ? '#34c759' : '#e05252', flexShrink: 0 }}>
                            {g >= 0 ? '+' : ''}{fmt(g)}
                          </span>
                        )}
                        {f != null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                            {fmt(f)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {phone.accounts.length > 4 && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 4 }}>
                      +{phone.accounts.length - 4} más
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${needsChange ? '#d9484844' : 'var(--border)'}` }}>
                <SignalBars level={signalLevel} />
                <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                  <span style={{ color: '#34c759' }}>{phone.active} activas</span>
                  {problems > 0 && <span style={{ color: '#e05252' }}>{problems} problemas</span>}
                  {needsChange && (
                    <button onClick={e => { e.stopPropagation(); resolvePhoneAlert(phone.ref) }}
                      style={{ background: 'transparent', border: '1px solid #3a4464', borderRadius: 4, color: '#7280a0', fontSize: 10, fontWeight: 700, padding: '2px 8px', cursor: 'pointer' }}>
                      Resuelto
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Table */}
      {viewMode === 'table' && groups.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Móvil', 'Estado', 'Cuentas', 'Activas', 'Problemas', 'Seguidores', 'Ganados hoy', 'Reproducciones', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(phone => {
                const problems = phone.suspended + phone.shadow
                const alert = phoneAlerts.get(phone.ref)
                const needsChange = alert?.status === 'cambiar'
                const hasCreds = phone.ref !== '(Sin móvil)' && phoneInfo.has(phone.ref)
                const statusLabel = needsChange ? 'CAMBIAR MÓVIL' : problems === 0 && phone.accounts.length > 0 ? 'ACTIVO' : problems > 0 ? 'REVISAR' : 'VACÍO'
                const statusColor = needsChange ? '#d94848' : problems === 0 && phone.accounts.length > 0 ? '#34c759' : problems > 0 ? '#f5a623' : 'var(--muted)'
                return (
                  <tr key={phone.ref}
                    onClick={() => phone.ref !== '(Sin móvil)' && openPhoneDetail(phone.ref)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: phone.ref !== '(Sin móvil)' ? 'pointer' : 'default' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                      {phone.ref} {hasCreds && <span title="Tiene credenciales guardadas" style={{ fontSize: 11 }}>🔑</span>}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: `${statusColor}22`, color: statusColor }}>{statusLabel}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)' }}>{phone.accounts.length}</td>
                    <td style={{ padding: '10px 14px', color: '#34c759', fontWeight: 700 }}>{phone.active}</td>
                    <td style={{ padding: '10px 14px', color: problems > 0 ? '#e05252' : 'var(--muted)', fontWeight: problems > 0 ? 700 : 400 }}>{problems || '—'}</td>
                    <td style={{ padding: '10px 14px', color: phone.totalFollowers > 0 ? '#d4a843' : 'var(--muted)', fontWeight: 700 }}>{phone.totalFollowers > 0 ? fmt(phone.totalFollowers) : '—'}</td>
                    <td style={{ padding: '10px 14px', color: phone.hasGanados ? (phone.ganados >= 0 ? '#34c759' : '#e05252') : 'var(--muted)', fontWeight: 700 }}>
                      {phone.hasGanados ? `${phone.ganados >= 0 ? '+' : ''}${fmt(phone.ganados)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: phone.totalRepro > 0 ? '#a78bfa' : 'var(--muted)', fontWeight: 700 }}>{phone.totalRepro > 0 ? fmt(phone.totalRepro) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {needsChange && (
                        <button onClick={e => { e.stopPropagation(); resolvePhoneAlert(phone.ref) }}
                          style={{ background: 'transparent', border: '1px solid #3a4464', borderRadius: 4, color: '#7280a0', fontSize: 10, fontWeight: 700, padding: '2px 8px', cursor: 'pointer' }}>
                          Resuelto
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '80px 20px', fontSize: 15 }}>
          No hay datos de móviles. Añade el campo "Móvil" a las cuentas de Instagram.
        </div>
      )}

      {/* Phone detail side panel */}
      {detailPhoneRef && (() => {
        const group = groups.find(g => g.ref === detailPhoneRef)
        const info = phoneInfo.get(detailPhoneRef)
        const employee = group?.accounts.find(a => a.employee)?.employee ?? null
        const model = group?.accounts.find(a => a.model)?.model ?? null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }} onClick={() => setDetailPhoneRef(null)}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} />
            <div onClick={e => e.stopPropagation()} style={{
              width: 420, maxWidth: '100vw', height: '100%', background: '#0a0d1a',
              borderLeft: '1px solid #1c2240', display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
            }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1c2240' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: '#1c2240', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    📱
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{detailPhoneRef}</div>
                    <div style={{ fontSize: 12, color: '#7280a0', marginTop: 1 }}>
                      {[employee, model].filter(Boolean).join(' · ') || `${group?.accounts.length ?? 0} cuentas`}
                    </div>
                  </div>
                  <button onClick={() => setDetailPhoneRef(null)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              </div>

              {/* Credentials */}
              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Credenciales</div>
                  <button onClick={() => setEditingPhone(e => !e)}
                    style={{ fontSize: 11, fontWeight: 700, color: editingPhone ? '#e05252' : '#5b8dd9', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {editingPhone ? '✕ Cancelar' : '✏ Editar'}
                  </button>
                </div>

                {editingPhone ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { key: 'gmailUser', label: 'GMAIL', type: 'email' },
                      { key: 'gmailPassword', label: 'CONTRASEÑA GMAIL', type: 'text' },
                      { key: 'appleId', label: 'APPLE ID', type: 'email' },
                      { key: 'appleIdPassword', label: 'CONTRASEÑA APPLE ID', type: 'text' },
                      { key: 'appleIdPhone', label: 'TELÉFONO APPLE ID', type: 'text' },
                      { key: 'remoteLink', label: 'LINK ACCESO REMOTO', type: 'text' },
                    ].map(({ key, label, type }) => (
                      <div key={key}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <input
                          type={type}
                          value={phoneEditForm[key as keyof typeof phoneEditForm]}
                          onChange={e => setPhoneEditForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder="Vacío = sin cambios"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#060c1f', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 12, outline: 'none', fontFamily: key.toLowerCase().includes('password') ? 'monospace' : 'inherit' }}
                        />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>NOTAS</div>
                      <textarea
                        value={phoneEditForm.notes}
                        onChange={e => setPhoneEditForm(f => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        placeholder="Notas internas sobre este móvil…"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#060c1f', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                    <button onClick={handleSavePhone} disabled={savingPhone}
                      style={{ width: '100%', padding: '10px', borderRadius: 10, background: '#d4a843', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: savingPhone ? 'not-allowed' : 'pointer', opacity: savingPhone ? 0.7 : 1 }}>
                      {savingPhone ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <>
                    {info?.gmailUser && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>GMAIL</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', flex: 1, wordBreak: 'break-all' }}>{info.gmailUser}</span>
                          <button onClick={() => navigator.clipboard.writeText(info.gmailUser!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {info?.gmailPassword && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>CONTRASEÑA GMAIL</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
                            {showGmailPwd ? info.gmailPassword : '•'.repeat(Math.min(info.gmailPassword.length, 16))}
                          </span>
                          <button onClick={() => setShowGmailPwd(p => !p)} style={{ background: 'none', border: 'none', color: '#5b8dd9', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{showGmailPwd ? 'Ocultar' : 'Ver'}</button>
                          <button onClick={() => navigator.clipboard.writeText(info.gmailPassword!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {info?.appleId && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>APPLE ID</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', flex: 1, wordBreak: 'break-all' }}>{info.appleId}</span>
                          <button onClick={() => navigator.clipboard.writeText(info.appleId!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {info?.appleIdPassword && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>CONTRASEÑA APPLE ID</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
                            {showApplePwd ? info.appleIdPassword : '•'.repeat(Math.min(info.appleIdPassword.length, 16))}
                          </span>
                          <button onClick={() => setShowApplePwd(p => !p)} style={{ background: 'none', border: 'none', color: '#5b8dd9', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{showApplePwd ? 'Ocultar' : 'Ver'}</button>
                          <button onClick={() => navigator.clipboard.writeText(info.appleIdPassword!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {info?.appleIdPhone && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>TELÉFONO APPLE ID</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#e8ecf5', flex: 1 }}>{info.appleIdPhone}</span>
                          <button onClick={() => navigator.clipboard.writeText(info.appleIdPhone!)} style={{ background: 'none', border: 'none', color: '#7280a0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>📋</button>
                        </div>
                      </div>
                    )}
                    {info?.remoteLink && (
                      <a href={info.remoteLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 10, background: '#1c2240', color: '#e8ecf5', fontWeight: 600, fontSize: 13, textDecoration: 'none', marginBottom: 8 }}>
                        Acceso remoto ↗
                      </a>
                    )}
                    {info?.notes && (
                      <div style={{ background: '#060c1f', border: '1px solid #1c2240', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#7280a0', fontWeight: 700, marginBottom: 4 }}>NOTAS</div>
                        <div style={{ fontSize: 12, color: '#e8ecf5', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{info.notes}</div>
                      </div>
                    )}
                    {!info?.gmailUser && !info?.gmailPassword && !info?.appleId && !info?.appleIdPassword && !info?.remoteLink && !info?.notes && (
                      <div style={{ fontSize: 12, color: '#2a3450', fontStyle: 'italic' }}>Sin credenciales guardadas — pulsa Editar para añadir</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {selectedAccount && <AccountStatsModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />}
    </div>
  )
}
