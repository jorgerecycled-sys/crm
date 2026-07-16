'use client'

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'
import { Upload, ChevronDown, ChevronRight } from 'lucide-react'
import { AccountStatsModal, type ModalAccount } from '@/components/crm/AccountStatsModal'
import { fmt, type EstadoCodigo } from '@/lib/instagram/metrics'

interface PoolAccount extends ModalAccount {
  employeeId: string | null
  poolAssignedAt: string | null
  poolAssignedFollowers: number | null
  gain: number | null
  mejorReel: number | null
  nReels: number
  estadoCodigo: EstadoCodigo
  igPassword: string | null
  fa2: string | null
}

const POOL_LABELS: Record<string, string> = {
  jailbreak: 'JailBreak',
  pool: 'Pool Accounts',
}

const EXPIRE_DAYS = 3

const STATUS_LABEL: Record<string, string> = { pool_available: 'Disponible', pool_assigned: 'Asignada', pool_expired: 'Expirada' }
const STATUS_COLOR: Record<string, string> = { pool_available: '#5b8dd9', pool_assigned: '#34c759', pool_expired: '#e05252' }

function daysLeft(assignedAt: string | null): number | null {
  if (!assignedAt) return null
  const elapsed = (Date.now() - new Date(assignedAt).getTime()) / 86400000
  return Math.max(0, Math.ceil(EXPIRE_DAYS - elapsed))
}

function CollapsibleSection({ title, count, defaultOpen, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: open ? 10 : 0 }}
      >
        {open ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title} ({count})</span>
      </button>
      {open && children}
    </div>
  )
}

export default function PoolAccountsPage() {
  const { pool } = useParams<{ pool: string }>()
  const label = POOL_LABELS[pool] ?? pool
  const isJailbreak = pool === 'jailbreak'
  const isAdmin = useAuthStore(s => s.user?.roleName === 'Admin' || s.user?.roleName === 'Super Admin')
  const myId = useAuthStore(s => s.user?.sub)

  const [accounts, setAccounts] = useState<PoolAccount[]>([])
  const [isManager, setIsManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [releasingId, setReleasingId] = useState<string | null>(null)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedAccount, setSelectedAccount] = useState<PoolAccount | null>(null)

  // JailBreak-only filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const token = useAuthStore.getState().accessToken
    fetch(`/api/crm/instagram/pool-accounts?pool=${pool}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts ?? []); setIsManager(!!d.isManager); setLoading(false) })
      .catch(() => setLoading(false))
  }, [pool])

  useEffect(() => { load() }, [load])

  function toggleReveal(id: string) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleClaim(acc: PoolAccount) {
    setClaimingId(acc.id)
    try {
      const token = useAuthStore.getState().accessToken
      const r = await fetch('/api/crm/instagram/pool-accounts/claim', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: acc.id }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error')
      toast(`@${acc.username} asignada`, 'success')
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setClaimingId(null)
    }
  }

  async function handleRelease(acc: PoolAccount) {
    setReleasingId(acc.id)
    try {
      const token = useAuthStore.getState().accessToken
      const r = await fetch('/api/crm/instagram/pool-accounts/release', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: acc.id }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error')
      toast(`@${acc.username} liberada`, 'success')
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setReleasingId(null)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const token = useAuthStore.getState().accessToken
      const form = new FormData()
      form.append('file', file)
      form.append('pool', pool)
      const r = await fetch('/api/crm/instagram/pool-accounts/bulk', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error')
      toast(`${data.inserted} cuentas añadidas${data.duplicates ? `, ${data.duplicates} ya existían` : ''}${data.invalidLines ? `, ${data.invalidLines} líneas inválidas` : ''}`, 'success')
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const models = useMemo(() => Array.from(new Set(accounts.map(a => a.model).filter(Boolean))).sort() as string[], [accounts])

  const filtered = useMemo(() => {
    let rows = accounts
    if (statusFilter) rows = rows.filter(a => a.status === statusFilter)
    if (modelFilter) rows = rows.filter(a => a.model === modelFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(a => a.username.toLowerCase().includes(q) || (a.model ?? '').toLowerCase().includes(q) || (a.employee ?? '').toLowerCase().includes(q))
    }
    if (sort) {
      const d = sort.dir === 'asc' ? 1 : -1
      rows = [...rows].sort((a, b) => {
        switch (sort.col) {
          case 'cuenta': return a.username.localeCompare(b.username) * d
          case 'modelo': return (a.model ?? '').localeCompare(b.model ?? '') * d
          case 'seguidores': return ((a.seguidores ?? -1) - (b.seguidores ?? -1)) * d
          case 'ganancia': return ((a.gain ?? -Infinity) - (b.gain ?? -Infinity)) * d
          case 'engagement': return ((a.engagement ?? -1) - (b.engagement ?? -1)) * d
          default: return 0
        }
      })
    }
    return rows
  }, [accounts, statusFilter, modelFilter, search, sort])

  function toggleSort(col: string) {
    setSort(prev => (prev?.col === col ? (prev.dir === 'desc' ? { col, dir: 'asc' } : null) : { col, dir: 'desc' }))
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

  const available = accounts.filter(a => a.status === 'pool_available')
  const mine = accounts.filter(a => a.status === 'pool_assigned' && a.employeeId === myId)
  const expired = accounts.filter(a => a.status === 'pool_expired')
  const auditRows = isManager ? accounts : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>{label}</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
            Cuentas desechables · {available.length} disponibles · {mine.length} tuyas
          </p>
        </div>
        {isAdmin && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10,
            background: '#d4a843', color: '#000', fontWeight: 700, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.7 : 1,
          }}>
            <Upload size={14} />
            {uploading ? 'Subiendo…' : 'Subir cuentas (.txt)'}
            <input ref={fileInputRef} type="file" accept=".txt" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
          </label>
        )}
      </div>

      {isJailbreak ? (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cuenta, modelo, empleado…"
              style={{ flex: '1 1 220px', background: '#0a0d18', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none' }}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
              <option value="">Todos los estados</option>
              <option value="pool_available">Disponibles</option>
              <option value="pool_assigned">Asignadas</option>
              <option value="pool_expired">Expiradas</option>
            </select>
            {models.length > 0 && (
              <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                <option value="">Todos los modelos</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {(search || statusFilter || modelFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); setModelFilter('') }}
                style={{ background: 'transparent', border: '1px solid #1c2240', borderRadius: 8, color: '#7280a0', padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
                ✕ Limpiar
              </button>
            )}
          </div>

          {/* Tabla de estadísticas */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    { col: 'cuenta', label: 'Cuenta' },
                    { col: 'modelo', label: 'Modelo' },
                    { col: null, label: 'Empleado' },
                    { col: 'seguidores', label: 'Seguidores' },
                    { col: 'ganancia', label: 'Ganancia' },
                    { col: 'engagement', label: 'Engagement' },
                    { col: null, label: 'Estado' },
                    { col: null, label: '' },
                  ].map(({ col, label: h }) => (
                    <th key={h} onClick={col ? () => toggleSort(col) : undefined} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none' }}>
                      {h}{col && sortArrow(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(acc => {
                  const canSeeCreds = !!(acc.igPassword || acc.fa2)
                  const revealed = revealedIds.has(acc.id)
                  return (
                    <Fragment key={acc.id}>
                      <tr onClick={() => setSelectedAccount(acc)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>@{acc.username}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.model ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.employee ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#fff' }}>{acc.seguidores != null ? fmt(acc.seguidores) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: acc.gain != null ? (acc.gain >= 0 ? '#34c759' : '#e05252') : 'var(--muted)' }}>
                          {acc.gain != null ? `${acc.gain >= 0 ? '+' : ''}${fmt(acc.gain)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: acc.engagement != null && acc.engagement > 3 ? '#34c759' : 'var(--muted)' }}>
                          {acc.engagement != null ? acc.engagement.toFixed(1) + '%' : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: `${STATUS_COLOR[acc.status] ?? '#6b7280'}22`, color: STATUS_COLOR[acc.status] ?? '#6b7280' }}>
                            {STATUS_LABEL[acc.status] ?? acc.status}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()} style={{ padding: '10px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                          {acc.status === 'pool_available' && (
                            <button onClick={() => handleClaim(acc)} disabled={claimingId === acc.id}
                              style={{ padding: '5px 10px', borderRadius: 6, background: '#d4a843', border: 'none', color: '#000', fontSize: 11, fontWeight: 700, cursor: claimingId === acc.id ? 'not-allowed' : 'pointer' }}>
                              {claimingId === acc.id ? '…' : 'Asignarme'}
                            </button>
                          )}
                          {acc.status === 'pool_assigned' && acc.employeeId === myId && (
                            <button onClick={() => handleRelease(acc)} disabled={releasingId === acc.id}
                              style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', color: '#e05252', fontSize: 11, fontWeight: 700, cursor: releasingId === acc.id ? 'not-allowed' : 'pointer' }}>
                              {releasingId === acc.id ? '…' : 'Liberar'}
                            </button>
                          )}
                          {canSeeCreds && (
                            <button onClick={() => toggleReveal(acc.id)} title="Ver credenciales"
                              style={{ padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#5b8dd9', fontSize: 11, cursor: 'pointer' }}>
                              🔑
                            </button>
                          )}
                        </td>
                      </tr>
                      {revealed && (
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={8} style={{ padding: '8px 14px', fontSize: 12, display: 'flex', gap: 20 }}>
                            <span><span style={{ color: 'var(--muted)' }}>Contraseña: </span><span style={{ fontFamily: 'monospace' }}>{acc.igPassword ?? '—'}</span></span>
                            <span><span style={{ color: 'var(--muted)' }}>2FA: </span><span style={{ fontFamily: 'monospace' }}>{acc.fa2 ?? '—'}</span></span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>Sin cuentas para estos filtros</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Disponibles — grande, siempre visible */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Disponibles ({available.length})
            </div>
            {available.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>No hay cuentas disponibles ahora mismo.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {available.map(acc => (
                  <div key={acc.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{acc.username}</div>
                      {acc.model && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{acc.model}</div>}
                    </div>
                    <button onClick={() => handleClaim(acc)} disabled={claimingId === acc.id} style={{ padding: '9px 18px', borderRadius: 10, background: '#d4a843', border: 'none', color: '#000', fontSize: 13, fontWeight: 700, cursor: claimingId === acc.id ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                      {claimingId === acc.id ? '…' : 'Asignarme'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CollapsibleSection title="Mis cuentas" count={mine.length}>
            {mine.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No tienes ninguna cuenta asignada.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {mine.map(acc => {
                  const dLeft = daysLeft(acc.poolAssignedAt)
                  const revealed = revealedIds.has(acc.id)
                  return (
                    <div key={acc.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>@{acc.username}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: dLeft !== null && dLeft <= 1 ? 'rgba(224,82,82,0.15)' : 'rgba(212,168,67,0.15)', color: dLeft !== null && dLeft <= 1 ? '#e05252' : '#d4a843' }}>
                          {dLeft !== null ? `${dLeft}d restantes` : '—'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {acc.seguidores !== null ? `${fmt(acc.seguidores)} seguidores` : 'Sin datos aún'}
                        {acc.gain !== null && <span style={{ color: acc.gain >= 0 ? '#34c759' : '#e05252', fontWeight: 700 }}> ({acc.gain >= 0 ? '+' : ''}{fmt(acc.gain)})</span>}
                      </div>
                      <div style={{ background: '#0a0d18', border: '1px solid #1c2240', borderRadius: 8, padding: '8px 10px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><span style={{ color: 'var(--muted)' }}>Contraseña: </span><span style={{ fontFamily: 'monospace' }}>{revealed ? (acc.igPassword ?? '—') : '••••••••'}</span></div>
                        <div><span style={{ color: 'var(--muted)' }}>2FA: </span><span style={{ fontFamily: 'monospace' }}>{revealed ? (acc.fa2 ?? '—') : '••••••'}</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => toggleReveal(acc.id)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#5b8dd9', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {revealed ? 'Ocultar' : 'Ver credenciales'}
                        </button>
                        <button onClick={() => handleRelease(acc)} disabled={releasingId === acc.id} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', color: '#e05252', fontSize: 12, fontWeight: 700, cursor: releasingId === acc.id ? 'not-allowed' : 'pointer' }}>
                          {releasingId === acc.id ? '…' : 'Liberar'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Expiradas" count={expired.length}>
            {expired.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Ninguna cuenta expirada todavía.</div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      {['Cuenta', 'Seguidores al expirar', 'Ganancia', 'Asignada'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expired.map(acc => (
                      <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>@{acc.username}</td>
                        <td style={{ padding: '10px 14px' }}>{acc.seguidores !== null ? fmt(acc.seguidores) : '—'}</td>
                        <td style={{ padding: '10px 14px', color: acc.gain !== null && acc.gain >= 0 ? '#34c759' : '#e05252' }}>{acc.gain !== null ? `${acc.gain >= 0 ? '+' : ''}${fmt(acc.gain)}` : '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.poolAssignedAt?.slice(0, 10) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {isManager && (
            <CollapsibleSection title="Auditoría — todas las cuentas" count={auditRows.length}>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      {['Cuenta', 'Estado', 'Empleado', 'Asignada', 'Seguidores', 'Ganancia'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map(acc => (
                      <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>@{acc.username}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{STATUS_LABEL[acc.status] ?? acc.status}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.employee ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.poolAssignedAt?.slice(0, 10) ?? '—'}</td>
                        <td style={{ padding: '10px 14px' }}>{acc.seguidores !== null ? fmt(acc.seguidores) : '—'}</td>
                        <td style={{ padding: '10px 14px', color: acc.gain !== null && acc.gain >= 0 ? '#34c759' : '#e05252' }}>{acc.gain !== null ? `${acc.gain >= 0 ? '+' : ''}${fmt(acc.gain)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}
        </>
      )}

      {selectedAccount && <AccountStatsModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />}
    </div>
  )
}
