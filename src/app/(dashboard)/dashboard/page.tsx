'use client'

import { useEffect, useState, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import {
  TrendingUp, MessageSquare, AlertCircle, LogIn, LogOut, PlusCircle, RefreshCw,
  Users, Heart, Activity, RefreshCcw, ShieldAlert, TriangleAlert, Clock,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { cn } from '@/lib/utils'

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

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LOGIN: { label: 'Inicio de sesión', color: '#0ab39c', icon: <LogIn size={14} /> },
  LOGOUT: { label: 'Cierre de sesión', color: '#878a99', icon: <LogOut size={14} /> },
  CREATE_LEAD: { label: 'Lead creado', color: '#f7b84b', icon: <PlusCircle size={14} /> },
  UPDATE_LEAD: { label: 'Lead actualizado', color: '#299cdb', icon: <RefreshCw size={14} /> },
  CREATE_INCIDENT: { label: 'Incidencia', color: '#f06548', icon: <AlertCircle size={14} /> },
  CREATE_SALE: { label: 'Venta creada', color: '#0ab39c', icon: <TrendingUp size={14} /> },
  CREATE_CONVERSATION: { label: 'Conversación', color: '#405189', icon: <MessageSquare size={14} /> },
}

const TOOLTIP_STYLE = {
  background: '#fff', border: '1px solid #e9ebec', borderRadius: 6, color: '#495057',
  fontSize: 12, boxShadow: '0 5px 10px rgba(30,32,37,0.12)',
}

// ── Velzon building blocks ────────────────────────────────────────────────────

function Card({ title, icon, right, children, className, bodyClassName }: {
  title: string
  icon?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div className={cn('bg-card rounded-md shadow-[0_1px_2px_rgba(56,65,74,0.15)] flex flex-col min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 px-5 h-[60px] border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h4 className="text-[15px] font-semibold text-foreground truncate">{title}</h4>
        </div>
        {right}
      </div>
      <div className={cn('p-5 flex-1 min-h-0', bodyClassName)}>{children}</div>
    </div>
  )
}

function MetricCard({ label, value, hint, icon, tone, loading }: {
  label: string
  value: string | number
  hint?: string
  icon: React.ReactNode
  tone: 'primary' | 'success' | 'info' | 'warning'
  loading: boolean
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
    warning: 'bg-warning/15 text-warning',
  }[tone]
  return (
    <div className="bg-card rounded-md shadow-[0_1px_2px_rgba(56,65,74,0.15)] p-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground leading-none">{loading ? '…' : value}</h4>
        </div>
        <div className={cn('w-12 h-12 rounded-md flex items-center justify-center shrink-0', toneClass)}>{icon}</div>
      </div>
      {hint && <p className="mt-3 text-xs text-muted-foreground truncate">{hint}</p>}
    </div>
  )
}

function Pill({ tone, children }: { tone: 'success' | 'danger' | 'warning' | 'primary'; children: React.ReactNode }) {
  const toneClass = {
    success: 'bg-success/10 text-success',
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/15 text-warning',
    primary: 'bg-primary/10 text-primary',
  }[tone]
  return (
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold shrink-0', toneClass)}>
      {children}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 px-5 text-center text-sm text-muted-foreground">{children}</div>
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

  const igSuspended = useMemo(() => igAccounts.filter(a => a.status === 'suspended'), [igAccounts])
  const igShadow = useMemo(() => igAccounts.filter(a => a.status === 'shadow banned'), [igAccounts])
  const openIgIncidents = useMemo(() => igIncidents.filter(i => i.status !== 'resolved'), [igIncidents])
  const alertCount = igSuspended.length + igShadow.length

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
      active: '#0ab39c', suspended: '#f06548', 'shadow banned': '#f7b84b',
      new: '#405189', unused: '#878a99', retiring: '#299cdb',
    }
    const LABELS: Record<string, string> = {
      active: 'Activas', suspended: 'Baneadas', 'shadow banned': 'Warning',
      new: 'Nuevas', unused: 'Inactivas', retiring: 'A retirar',
    }
    return Object.entries(map)
      .map(([status, count]) => ({ name: LABELS[status] ?? status, value: count, color: COLORS[status] ?? '#878a99' }))
      .sort((a, b) => b.value - a.value)
  }, [igAccounts])

  return (
    <div className="flex flex-col gap-6">

      {/* Page title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold uppercase tracking-wide text-foreground">Resumen</h1>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-success bg-success/10 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Sistema online
          </span>
          <nav className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span>Dashboards</span><span>/</span><span className="text-foreground">Resumen</span>
          </nav>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-6 border-b border-border">
        {(['instagram', 'reddit'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              '-mb-px pb-3 text-sm font-medium border-b-2 transition-colors capitalize',
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'reddit' ? (
        <Card title="Reddit">
          <Empty>
            La integración con Reddit está pendiente de activación. Cuando esté lista verás aquí las métricas de subreddits, posts y comentarios.
          </Empty>
        </Card>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Cuentas activas" tone="success" loading={loading}
              value={igTotals?.activeAccounts ?? 0}
              hint={igTotals ? `de ${igTotals.totalAccounts} totales` : undefined}
              icon={<Users className="w-6 h-6" />}
            />
            <MetricCard
              label="Seguidores totales" tone="primary" loading={loading}
              value={fmt(igTotals?.totalFollowers ?? 0)}
              icon={<Heart className="w-6 h-6" />}
            />
            <MetricCard
              label="Engagement medio" tone="info" loading={loading}
              value={`${(igTotals?.avgEngagement ?? 0).toFixed(1)}%`}
              icon={<Activity className="w-6 h-6" />}
            />
            <MetricCard
              label="Última sync" tone="warning" loading={loading}
              value={igSyncLabel ?? '—'}
              icon={<RefreshCcw className="w-6 h-6" />}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 xl:grid-cols-12">
            <Card title="Seguidores por modelo" className="xl:col-span-8">
              {modelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(modelData.length * 38, 140)}>
                  <BarChart data={modelData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#e9ebec" strokeDasharray="4 4" />
                    <XAxis type="number" tickFormatter={v => fmt(v as number)} tick={{ fill: '#878a99', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#495057', fontSize: 12 }} width={90} axisLine={false} tickLine={false} />
                    <Tooltip formatter={v => [fmt(v as number), 'Seguidores']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(64,81,137,0.05)' }} />
                    <Bar dataKey="value" fill="#405189" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty>Sin datos de modelos</Empty>
              )}
            </Card>

            <Card title="Estado de cuentas" className="xl:col-span-4">
              {igStatusData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={igStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                        {igStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="mt-4 divide-y divide-border">
                    {igStatusData.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 py-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
                        <span className="flex-1 text-muted-foreground">{item.name}</span>
                        <span className="font-semibold text-foreground">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Empty>Sin datos</Empty>
              )}
            </Card>
          </div>

          {/* Lists */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card
              title="Incidencias Instagram"
              icon={<TriangleAlert className={cn('w-4 h-4', openIgIncidents.length > 0 ? 'text-primary' : 'text-muted-foreground')} />}
              right={<Pill tone={openIgIncidents.length > 0 ? 'primary' : 'success'}>{openIgIncidents.length > 0 ? `${openIgIncidents.length} abiertas` : 'OK'}</Pill>}
              bodyClassName="p-0"
            >
              <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
                {openIgIncidents.length === 0 ? (
                  <Empty>Sin incidencias abiertas</Empty>
                ) : openIgIncidents.map(inc => (
                  <div key={inc.id} className="flex items-start gap-3 px-5 py-3">
                    <Pill tone="primary">{inc.tipo}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{inc.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {inc.ig_accounts ? `@${inc.ig_accounts.username} · ` : ''}{relativeTime(inc.createdAt)}
                        {inc.reportedBy ? ` · ${inc.reportedBy}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Cuentas con alertas"
              icon={<ShieldAlert className={cn('w-4 h-4', alertCount > 0 ? 'text-destructive' : 'text-muted-foreground')} />}
              right={<Pill tone={alertCount > 0 ? 'danger' : 'success'}>{alertCount > 0 ? `${alertCount} alertas` : 'OK'}</Pill>}
              bodyClassName="p-0"
            >
              <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
                {alertCount === 0 ? (
                  <Empty>Todas las cuentas OK</Empty>
                ) : (
                  <>
                    {igSuspended.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 px-5 py-3">
                        <span className="text-sm font-medium text-foreground truncate">@{a.username}</span>
                        <Pill tone="danger">Baneada</Pill>
                      </div>
                    ))}
                    {igShadow.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 px-5 py-3">
                        <span className="text-sm font-medium text-foreground truncate">@{a.username}</span>
                        <Pill tone="warning">Warning</Pill>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Card>

            <Card
              title="Actividad reciente"
              icon={<Clock className="w-4 h-4 text-muted-foreground" />}
              bodyClassName="p-0"
            >
              <div className="max-h-[360px] overflow-y-auto">
                {loading ? (
                  <div className="p-5 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}
                  </div>
                ) : (data?.recentActivity ?? []).length === 0 ? (
                  <Empty>Sin actividad</Empty>
                ) : (
                  <ul className="divide-y divide-border">
                    {(data?.recentActivity ?? []).map(a => {
                      const cfg = ACTION_CONFIG[a.action]
                      const color = cfg?.color ?? '#878a99'
                      const userName = a.user ? `${a.user.firstName} ${a.user.lastName}` : null
                      return (
                        <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
                            {cfg?.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{cfg?.label ?? a.action}</p>
                            {userName && <p className="text-xs text-muted-foreground truncate">{userName}</p>}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{relativeTime(a.createdAt)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
