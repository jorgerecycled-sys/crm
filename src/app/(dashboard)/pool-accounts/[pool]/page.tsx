'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'
import { Upload, Users } from 'lucide-react'

interface PoolAccount {
  id: string
  username: string
  status: string
  employeeId: string | null
  employee: string | null
  poolAssignedAt: string | null
  poolAssignedFollowers: number | null
  seguidores: number | null
  gain: number | null
  igPassword: string | null
  fa2: string | null
}

const POOL_LABELS: Record<string, string> = {
  jailbreak: 'JailBreak',
  pool: 'Pool Accounts',
}

const EXPIRE_DAYS = 3

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

function daysLeft(assignedAt: string | null): number | null {
  if (!assignedAt) return null
  const elapsed = (Date.now() - new Date(assignedAt).getTime()) / 86400000
  return Math.max(0, Math.ceil(EXPIRE_DAYS - elapsed))
}

export default function PoolAccountsPage() {
  const { pool } = useParams<{ pool: string }>()
  const label = POOL_LABELS[pool] ?? pool
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

      {/* Mis cuentas */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Mis cuentas ({mine.length})
        </div>
        {mine.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>No tienes ninguna cuenta asignada.</div>
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
      </div>

      {/* Disponibles */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Disponibles ({available.length})
        </div>
        {available.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>No hay cuentas disponibles ahora mismo.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {available.map(acc => (
              <div key={acc.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{acc.username}</span>
                <button onClick={() => handleClaim(acc)} disabled={claimingId === acc.id} style={{ padding: '6px 12px', borderRadius: 8, background: '#d4a843', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: claimingId === acc.id ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                  {claimingId === acc.id ? '…' : 'Asignarme'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expiradas */}
      {expired.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Expiradas ({expired.length})
          </div>
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
        </div>
      )}

      {/* Auditoría — solo admin */}
      {isManager && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={12} /> Auditoría — todas las cuentas ({auditRows.length})
          </div>
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
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.status}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.employee ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{acc.poolAssignedAt?.slice(0, 10) ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{acc.seguidores !== null ? fmt(acc.seguidores) : '—'}</td>
                    <td style={{ padding: '10px 14px', color: acc.gain !== null && acc.gain >= 0 ? '#34c759' : '#e05252' }}>{acc.gain !== null ? `${acc.gain >= 0 ? '+' : ''}${fmt(acc.gain)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
