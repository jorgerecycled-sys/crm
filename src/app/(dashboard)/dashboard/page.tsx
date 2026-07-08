'use client'

import { useEffect, useState, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { TrendingUp, MessageSquare, AlertCircle, LogIn, LogOut, PlusCircle, RefreshCw } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  stats: { activeUsers: number; newLeads: number; monthlySales: number; conversations: number; openIncidents: number }
  recentActivity: { id: string; action: string; resource: string; createdAt: string; metadata?: Record<string, string>; user?: { firstName: string; lastName: string } }[]
  leadsByStatus: { status: string; _count: { status: number } }[]
  salesByStage: { stage: string; _count: { stage: number } }[]
}
interface IgAccount { id: string; username: string; status: string; model: string | null; phoneRef: string | null; seguidores: number | null }
interface IgTotals { totalAccounts: number; activeAccounts: number; totalFollowers: number; avgEngagement: number }
interface IgIncident { id: string; accountId: string | null; description: string; tipo: string; status: string; reportedBy: string | null; createdAt: string; ig_accounts?: { username: string } | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `hace ${d}d`
  if (h > 0) return `hace ${h}h`
  if (m > 0) return `hace ${m}m`
  return 'ahora'
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo', CONTACTED: 'Contactado', INTERESTED: 'Interesado',
  NEGOTIATING: 'Negociación', CLOSED: 'Cerrado', LOST: 'Perdido',
}
const PIE_COLORS = ['#3b82f6','#f59e0b','#a855f7','#ec4899','#22c55e','#ef4444']

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LOGIN: { label: 'Inicio de sesión', color: '#34c759', icon: <LogIn size={12} /> },
  LOGOUT: { label: 'Cierre de sesión', color: '#6b7280', icon: <LogOut size={12} /> },
  CREATE_LEAD: { label: 'Lead creado', color: '#f5a623', icon: <PlusCircle size={12} /> },
  UPDATE_LEAD: { label: 'Lead actualizado', color: '#5b8dd9', icon: <RefreshCw size={12} /> },
  CREATE_INCIDENT: { label: 'Incidencia', color: '#e05252', icon: <AlertCircle size={12} /> },
  CREATE_SALE: { label: 'Venta creada', color: '#34c759', icon: <TrendingUp size={12} /> },
  CREATE_CONVERSATION: { label: 'Conversación', color: '#a78bfa', icon: <MessageSquare size={12} /> },
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { fetchApi } = useApi()
  const [data, setData] = useState<DashboardData | null>(null)
  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([])
  const [igTotals, setIgTotals] = useState<IgTotals | null>(null)
  const [igIncidents, setIgIncidents] = useState<IgIncident[]>([])
  const [igLastSync, setIgLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'instagram' | 'reddit'>('instagram')

  useEffect(() => {
    fetchApi<DashboardData>('/dashboard')
      .then(setData).catch(console.error).finally(() => setLoading(false))

    const token = useAuthStore.getState().accessToken
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

    fetch('/api/crm/instagram/stats', { headers: h })
      .then(r => r.json())
      .then(d => {
        setIgAccounts(d.accounts ?? [])
        setIgTotals(d.totals ?? null)
        setIgLastSync(d.lastSyncAt ?? null)
      }).catch(() => {})

    fetch('/api/crm/instagram/incidents', { headers: h })
      .then(r => r.json())
      .then(d => setIgIncidents(d.incidents ?? [])).catch(() => {})
  }, [fetchApi])

  const pieData = useMemo(() =>
    (data?.leadsByStatus ?? []).map(s => ({
      name: LEAD_STATUS_LABELS[s.status] ?? s.status,
      value: s._count.status,
    })), [data])

  const igSuspended = useMemo(() => igAccounts.filter(a => a.status === 'suspended'), [igAccounts])
  const igShadow = useMemo(() => igAccounts.filter(a => a.status === 'shadow banned'), [igAccounts])
  const openIgIncidents = useMemo(() => igIncidents.filter(i => i.status !== 'resolved'), [igIncidents])

  const igSyncLabel = useMemo(() => igLastSync ? relativeTime(igLastSync) : null, [igLastSync])

  const modelData = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of igAccounts) {
      if (!a.model) continue
      map.set(a.model, (map.get(a.model) ?? 0) + (a.seguidores ?? 0))
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [igAccounts])

  const igStatusData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of igAccounts) { map[a.status] = (map[a.status] ?? 0) + 1 }
    const COLORS: Record<string, string> = {
      active: '#34c759', suspended: '#e05252', 'shadow banned': '#f5a623',
      new: '#d4a843', unused: '#6b7280', retiring: '#b45309',
    }
    const LABELS: Record<string, string> = {
      active: 'Activas', suspended: 'Baneadas', 'shadow banned': 'Warning',
      new: 'Nuevas', unused: 'Inactivas', retiring: 'A retirar',
    }
    return Object.entries(map)
      .map(([status, count]) => ({ name: LABELS[status] ?? status, value: count, color: COLORS[status] ?? '#6b7280' }))
      .sort((a, b) => b.value - a.value)
  }, [igAccounts])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.4px' }}>Resumen</h1>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '3px 0 0' }}>
            Vista general del ERP
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#34c759', background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.18)', borderRadius: 999, padding: '5px 12px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759', display: 'inline-block' }} />
          Sistema online
        </div>
      </div>


      {/* Main two-column */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Left: channel tabs */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
            {(['instagram', 'reddit'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '6px 18px', borderRadius: 7, fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer',
                background: activeTab === tab ? (tab === 'instagram' ? '#d4a843' : '#ff4500') : 'transparent',
                color: activeTab === tab ? '#000' : 'var(--muted)', border: 'none', textTransform: 'capitalize',
                transition: 'all 0.12s',
              }}>
                {tab === 'instagram' ? '📸 Instagram' : '🤖 Reddit'}
              </button>
            ))}
          </div>

          {/* Instagram tab */}
          {activeTab === 'instagram' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* IG summary strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Cuentas activas', value: igTotals?.activeAccounts ?? 0, total: igTotals?.totalAccounts ?? 0, color: '#34c759' },
                  { label: 'Seguidores totales', value: igTotals?.totalFollowers ?? 0, color: '#d4a843', isFmt: true },
                  { label: 'Engagement medio', value: igTotals?.avgEngagement ?? 0, color: '#a78bfa', isFloat: true, suffix: '%' },
                  { label: 'Última sync', value: igSyncLabel ? igSyncLabel : '—', color: '#5b8dd9', isStr: true },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>
                      {loading ? '…' : s.isStr ? s.value : s.isFmt ? fmt(s.value as number) : s.isFloat ? (s.value as number).toFixed(1) + (s.suffix ?? '') : s.value}
                    </div>
                    {'total' in s && s.total ? <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>de {s.total} totales</div> : null}
                  </div>
                ))}
              </div>

              {/* Panels row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* Incidencias IG */}
                <div style={{ background: 'var(--surface)', border: `1px solid ${openIgIncidents.length > 0 ? '#a78bfa44' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={openIgIncidents.length > 0 ? '#a78bfa' : 'var(--muted)'} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Incidencias Instagram</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: openIgIncidents.length > 0 ? 'rgba(167,139,250,0.12)' : 'rgba(52,199,89,0.1)', color: openIgIncidents.length > 0 ? '#a78bfa' : '#34c759' }}>
                      {openIgIncidents.length > 0 ? `${openIgIncidents.length} abiertas` : 'OK'}
                    </span>
                  </div>
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {openIgIncidents.length === 0 ? (
                      <div style={{ padding: '16px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Sin incidencias abiertas</div>
                    ) : openIgIncidents.map(inc => (
                      <div key={inc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(167,139,250,0.05)', borderRadius: 8, padding: '7px 10px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', flexShrink: 0, marginTop: 1 }}>{inc.tipo}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.description}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                            {inc.ig_accounts ? `@${inc.ig_accounts.username} · ` : ''}{relativeTime(inc.createdAt)}
                            {inc.reportedBy ? ` · ${inc.reportedBy}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cuentas con alertas */}
                <div style={{ background: 'var(--surface)', border: `1px solid ${(igSuspended.length + igShadow.length) > 0 ? '#e0525244' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={(igSuspended.length + igShadow.length) > 0 ? '#e05252' : 'var(--muted)'} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Cuentas con alertas</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: (igSuspended.length + igShadow.length) > 0 ? 'rgba(224,82,82,0.12)' : 'rgba(52,199,89,0.1)', color: (igSuspended.length + igShadow.length) > 0 ? '#e05252' : '#34c759' }}>
                      {igSuspended.length + igShadow.length > 0 ? `${igSuspended.length + igShadow.length} alertas` : 'OK'}
                    </span>
                  </div>
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {igSuspended.length + igShadow.length === 0 ? (
                      <div style={{ padding: '16px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Todas las cuentas OK</div>
                    ) : (
                      <>
                        {igSuspended.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(224,82,82,0.05)', borderRadius: 8, padding: '6px 10px' }}>
                            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>@{a.username}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#e05252', background: 'rgba(224,82,82,0.12)', padding: '2px 7px', borderRadius: 999 }}>Baneada</span>
                          </div>
                        ))}
                        {igShadow.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(245,166,35,0.05)', borderRadius: 8, padding: '6px 10px' }}>
                            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>@{a.username}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f5a623', background: 'rgba(245,166,35,0.12)', padding: '2px 7px', borderRadius: 999 }}>Warning</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reddit tab */}
          {activeTab === 'reddit' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Reddit en configuración</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 320, margin: '0 auto' }}>
                La integración con Reddit está pendiente de activación. Cuando esté lista, verás las métricas de subreddits, posts y comentarios aquí.
              </div>
            </div>
          )}

          {/* Charts row: seguidores por modelo + estado de cuentas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: 12 }}>

            {/* Seguidores por modelo */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Seguidores por modelo</div>
              {modelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(modelData.length * 30, 80)}>
                  <BarChart data={modelData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#7280a0', fontSize: 11 }} width={72} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" fill="#d4a843" radius={[0, 4, 4, 0]} />
                    <Tooltip formatter={v => [fmt(v as number), 'Seguidores']} contentStyle={{ background: '#0d1124', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 11 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>Sin datos de modelos</div>
              )}
            </div>

            {/* Estado de cuentas */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Estado cuentas</div>
              {igStatusData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={88}>
                    <PieChart>
                      <Pie data={igStatusData} cx="50%" cy="50%" innerRadius={26} outerRadius={42} paddingAngle={2} dataKey="value">
                        {igStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                    {igStatusData.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{item.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>Sin datos</div>
              )}
            </div>

          </div>
        </div>

        {/* Right: Actividad reciente (compact) */}
        <div style={{ width: 280, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Actividad reciente</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {loading ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 40, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} />
                ))}
              </div>
            ) : (data?.recentActivity ?? []).length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>Sin actividad</div>
            ) : (
              <div>
                {(data?.recentActivity ?? []).map(a => {
                  const cfg = ACTION_CONFIG[a.action]
                  const isLogin = a.action === 'LOGIN'
                  const isLogout = a.action === 'LOGOUT'
                  const userName = a.user ? `${a.user.firstName} ${a.user.lastName}` : null
                  return (
                    <div key={a.id} style={{
                      padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isLogin ? 'rgba(52,199,89,0.04)' : isLogout ? 'rgba(107,114,128,0.04)' : 'transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isLogin ? 3 : 0 }}>
                        <span style={{ color: cfg?.color ?? '#6b7280', display: 'flex', flexShrink: 0 }}>{cfg?.icon}</span>
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: isLogin ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cfg?.label ?? a.action}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{relativeTime(a.createdAt)}</span>
                      </div>
                      {userName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 18 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: isLogin ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: isLogin ? '#34c759' : 'var(--muted)', flexShrink: 0 }}>
                            {a.user!.firstName[0]}{a.user!.lastName[0]}
                          </div>
                          <span style={{ fontSize: 11, color: isLogin ? '#34c759' : 'var(--muted)', fontWeight: isLogin ? 600 : 400 }}>{userName}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
