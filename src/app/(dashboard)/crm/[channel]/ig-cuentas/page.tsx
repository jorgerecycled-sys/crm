'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmt, ESTADO_LABELS, ESTADO_COLORS, type EstadoCodigo } from '@/lib/instagram/metrics'
import { Plus, Trash2, RefreshCw, Instagram, ExternalLink, Power, UserCheck } from 'lucide-react'

interface IgAccount {
  id: string
  username: string
  igId: string | null
  status: string
  notes: string | null
  employee: string | null
  employeeId: string | null
  phoneRef: string | null
  model: string | null
  createdAt: string
  updatedAt: string
  measurements: { seguidores: number | null; fecha: string }[]
  posts: { tipo: string | null }[]
  estadoCodigo?: EstadoCodigo
}

interface ErpUser {
  id: string
  firstName: string
  lastName: string
  email: string
  roleName?: string
}

const MODELS = ['Melissa', 'Grace', 'Jessica', 'Daisy IA', 'Kira IA']

export default function IgCuentasPage() {
  const { channel } = useParams<{ channel: string }>()
  const router = useRouter()
  const { fetchApi } = useApi()
  const isEmpleado = useAuthStore(s => s.user?.roleName) === 'Empleado'
  const [accounts, setAccounts] = useState<IgAccount[]>([])
  const [users, setUsers] = useState<ErpUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignValue, setAssignValue] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ username: '', model: '', employeeId: '', phoneRef: '', igPassword: '' })
  const [usernameError, setUsernameError] = useState('')

  const phones = [...new Set(accounts.map(a => a.phoneRef).filter(Boolean))].sort() as string[]
  const [phoneSearch, setPhoneSearch] = useState('')
  const [phoneOpen, setPhoneOpen] = useState(false)

  const filteredPhones = phoneSearch
    ? phones.filter(p => p.toLowerCase().includes(phoneSearch.toLowerCase()))
    : phones

  const resetForm = () => {
    setForm({ username: '', model: '', employeeId: '', phoneRef: '', igPassword: '' })
    setUsernameError('')
    setShowPassword(false)
    setPhoneSearch('')
    setPhoneOpen(false)
  }

  const load = useCallback(() => {
    setLoading(true)
    fetchApi<Record<string, unknown>[]>('/crm/instagram/accounts')
      .then(data => setAccounts(data.map(a => ({
        ...a,
        measurements: ((a.measurements ?? a.ig_measurements ?? []) as IgAccount['measurements']),
        posts: ((a.posts ?? a.ig_posts ?? []) as IgAccount['posts']),
      }) as unknown as IgAccount)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fetchApi])

  // Load users for employee selector
  useEffect(() => {
    fetchApi<{ data: ErpUser[] }>('/users?pageSize=100')
      .then(r => setUsers(r.data ?? []))
      .catch(() => {})
  }, [fetchApi])

  useEffect(() => { load() }, [load])

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const username = form.username.replace(/^@/, '').trim().toLowerCase()
    if (!username) { setUsernameError('Nombre de usuario requerido'); return }
    setUsernameError('')
    setSubmitting(true)
    try {
      await fetchApi('/crm/instagram/accounts', {
        method: 'POST',
        body: JSON.stringify({
          username,
          model: form.model || null,
          employeeId: form.employeeId || null,
          phoneRef: form.phoneRef || null,
          igPassword: form.igPassword || null,
        }),
      })
      toast(`Cuenta @${username} añadida`, 'success')
      setDialogOpen(false)
      resetForm()
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (acc: IgAccount) => {
    const newStatus = acc.status === 'active' ? 'suspended' : 'active'
    try {
      await fetchApi(`/crm/instagram/accounts/${acc.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      toast(`@${acc.username} ${newStatus === 'active' ? 'reactivada' : 'suspendida'}`, 'success')
      load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const deleteAccount = async (acc: IgAccount) => {
    if (!confirm(`¿Eliminar @${acc.username}? Se borrarán todos sus datos.`)) return
    try {
      await fetchApi(`/crm/instagram/accounts/${acc.id}`, { method: 'DELETE' })
      toast(`@${acc.username} eliminada`, 'success')
      load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const syncOne = async (acc: IgAccount) => {
    setSyncing(acc.id)
    try {
      const result = await fetchApi<{ ok: boolean; procesadas: number; errores: number; info?: string }>('/crm/instagram/sync', {
        method: 'POST',
        body: JSON.stringify({ accountId: acc.id, force: true }),
      })
      if (result.info) toast(result.info, 'info')
      else toast(`@${acc.username} sincronizada`, result.errores > 0 ? 'error' : 'success')
      load()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setSyncing(null) }
  }

  const saveAssign = async (accId: string) => {
    try {
      await fetchApi(`/crm/instagram/accounts/${accId}`, {
        method: 'PATCH',
        body: JSON.stringify({ employeeId: assignValue || null }),
      })
      toast('Empleado actualizado', 'success')
      setAssigningId(null)
      load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  if (channel !== 'instagram') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Cuentas IG</h1>
        <p className="text-muted-foreground">Solo disponible en el canal Instagram.</p>
      </div>
    )
  }

  const selectStyle: React.CSSProperties = {
    background: '#0d1124', border: '1px solid #1c2240', borderRadius: 6,
    color: '#e8ecf5', padding: '6px 10px', fontSize: 13, outline: 'none',
    width: '100%', cursor: 'pointer', colorScheme: 'dark',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Instagram className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cuentas Instagram</h1>
            <p className="text-sm text-muted-foreground">{accounts.length} cuentas registradas</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Añadir cuenta
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-16 text-center">
          <Instagram className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-1">Sin cuentas de Instagram</p>
          <p className="text-sm text-muted-foreground mb-4">Añade cuentas para empezar a monitorizar métricas.</p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Añadir primera cuenta
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: 800 }}>
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  {['Cuenta', 'Empleado', 'Estado', 'Seguidores', 'Última sync', 'Posts', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...accounts].sort((a, b) => {
                  const order: Record<string, number> = { suspended: 0, 'shadow banned': 1, new: 2, retiring: 3, active: 4, unused: 5 }
                  return (order[a.status] ?? 6) - (order[b.status] ?? 6)
                }).map((acc) => {
                  const latest = (acc.measurements ?? [])[0]
                  const reels = (acc.posts ?? []).filter((p) => p.tipo === 'Reel').length
                  const estadoCodigo = (acc.estadoCodigo ?? 'sin_datos') as EstadoCodigo
                  const estadoColor = ESTADO_COLORS[estadoCodigo]
                  const estadoLabel = ESTADO_LABELS[estadoCodigo]
                  const isAssigning = assigningId === acc.id

                  return (
                    <tr key={acc.id} className="border-t border-border/50 hover:bg-accent/20 transition-colors">
                      {/* Cuenta */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(acc.username)}`)} className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 cursor-pointer border-none">
                            <span className="text-white text-[10px] font-black">{acc.username.slice(0, 2).toUpperCase()}</span>
                          </button>
                          <div>
                            <button onClick={() => router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(acc.username)}`)} className="font-semibold text-foreground hover:text-primary cursor-pointer bg-transparent border-none p-0 text-left">@{acc.username}</button>
                            {acc.notes && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{acc.notes}</p>}
                          </div>
                          <a href={`https://instagram.com/${acc.username}`} target="_blank" rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      {/* Empleado */}
                      <td className="px-4 py-3" style={{ minWidth: 180 }}>
                        {isAssigning ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={assignValue}
                              onChange={e => setAssignValue(e.target.value)}
                              style={selectStyle}
                            >
                              <option value="">Sin asignar</option>
                              {users.map(u => (
                                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                              ))}
                            </select>
                            <button onClick={() => saveAssign(acc.id)}
                              style={{ background: '#1fad6e', border: 'none', borderRadius: 4, color: '#fff', padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ✓ Ok
                            </button>
                            <button onClick={() => setAssigningId(null)}
                              style={{ background: 'transparent', border: '1px solid #1c2240', borderRadius: 4, color: '#7280a0', padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAssigningId(acc.id); setAssignValue(acc.employeeId ?? '') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                            title="Cambiar empleado"
                          >
                            {acc.employee ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#6272e422', border: '1px solid #6272e444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#6272e4', flexShrink: 0 }}>
                                  {acc.employee.slice(0, 2).toUpperCase()}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf5' }}>{acc.employee}</span>
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#3a4464', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <UserCheck className="w-3.5 h-3.5" />
                                Sin asignar
                              </span>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full w-fit',
                            acc.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          )}>
                            {acc.status === 'active' ? 'Activa' : 'Suspendida'}
                          </span>
                          <span className="text-[10px] font-semibold" style={{ color: estadoColor }}>
                            {estadoLabel}
                          </span>
                        </div>
                      </td>

                      {/* Seguidores */}
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {latest?.seguidores !== undefined && latest.seguidores !== null ? fmt(latest.seguidores) : '—'}
                      </td>

                      {/* Última sync */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {latest?.fecha ?? '—'}
                      </td>

                      {/* Posts */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {acc.posts.length > 0 ? `${acc.posts.length} posts, ${reels} reels` : '—'}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {!isEmpleado && (
                            <button onClick={() => syncOne(acc)} disabled={syncing === acc.id}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                              title="Sincronizar">
                              <RefreshCw className={cn('w-3.5 h-3.5', syncing === acc.id && 'animate-spin')} />
                            </button>
                          )}
                          <button onClick={() => toggleStatus(acc)}
                            className={cn('p-1.5 rounded-md transition-colors', acc.status === 'active'
                              ? 'text-green-400 hover:bg-green-500/10'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                            title={acc.status === 'active' ? 'Suspender' : 'Activar'}>
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteAccount(acc)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Eliminar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); resetForm() }} title="Añadir cuenta de Instagram">
        <form onSubmit={onAdd} className="space-y-4">
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9aa4c0', marginBottom: 6 }}>Nombre de usuario *</label>
            <input
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="ej: melissacahoney (sin @)"
              style={selectStyle}
            />
            {usernameError && <p style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{usernameError}</p>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9aa4c0', marginBottom: 6 }}>Modelo</label>
            <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={selectStyle}>
              <option value="">— Sin modelo —</option>
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9aa4c0', marginBottom: 6 }}>Empleado</label>
            <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} style={selectStyle}>
              <option value="">— Sin asignar —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9aa4c0', marginBottom: 6 }}>Móvil</label>
            <div style={{ position: 'relative' }}>
              <input
                value={phoneSearch || form.phoneRef}
                onChange={e => { setPhoneSearch(e.target.value); setForm(f => ({ ...f, phoneRef: '' })); setPhoneOpen(true) }}
                onFocus={() => setPhoneOpen(true)}
                placeholder="Buscar móvil…"
                autoComplete="off"
                style={{ ...selectStyle, paddingRight: form.phoneRef ? 32 : 12 }}
              />
              {form.phoneRef && (
                <button type="button" onClick={() => { setForm(f => ({ ...f, phoneRef: '' })); setPhoneSearch(''); setPhoneOpen(false) }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#7280a0', cursor: 'pointer', fontSize: 16 }}>×</button>
              )}
            </div>
            {phoneOpen && filteredPhones.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8,
                maxHeight: 200, overflowY: 'auto', marginTop: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <div
                  style={{ padding: '8px 12px', fontSize: 12, color: '#7280a0', cursor: 'pointer' }}
                  onMouseDown={() => { setForm(f => ({ ...f, phoneRef: '' })); setPhoneSearch(''); setPhoneOpen(false) }}
                >
                  — Sin móvil —
                </div>
                {filteredPhones.map(p => (
                  <div
                    key={p}
                    onMouseDown={() => { setForm(f => ({ ...f, phoneRef: p })); setPhoneSearch(''); setPhoneOpen(false) }}
                    style={{
                      padding: '8px 12px', fontSize: 13, color: p === form.phoneRef ? '#fff' : '#e8ecf5',
                      background: p === form.phoneRef ? '#1c2a4a' : 'transparent',
                      cursor: 'pointer', borderTop: '1px solid #1c2240',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1c2240')}
                    onMouseLeave={e => (e.currentTarget.style.background = p === form.phoneRef ? '#1c2a4a' : 'transparent')}
                  >
                    {p}
                  </div>
                ))}
              </div>
            )}
            {phoneOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onMouseDown={() => setPhoneOpen(false)} />}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9aa4c0', marginBottom: 6 }}>Contraseña de la cuenta</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.igPassword}
                onChange={e => setForm(f => ({ ...f, igPassword: e.target.value }))}
                placeholder="Contraseña de Instagram"
                style={{ ...selectStyle, paddingRight: 36 }}
              />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#7280a0', cursor: 'pointer', fontSize: 13 }}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm() }} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={submitting} className="flex-1">Añadir cuenta</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
