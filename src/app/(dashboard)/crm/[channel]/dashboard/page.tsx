'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { StatCard } from '@/components/ui/stat-card'
import { Target, TrendingUp, MessageSquare, Clock, CheckSquare, Users } from 'lucide-react'
import { Lead, Sale } from '@/types'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  NEW: '#3b82f6',
  CONTACTED: '#f59e0b',
  INTERESTED: '#a855f7',
  NEGOTIATING: '#ec4899',
  CLOSED: '#22c55e',
  LOST: '#ef4444',
}
const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo', CONTACTED: 'Contactado', INTERESTED: 'Interesado',
  NEGOTIATING: 'Negociación', CLOSED: 'Cerrado', LOST: 'Perdido',
}

const TOOLTIP_STYLE = {
  background: 'hsl(222 47% 9%)',
  border: '1px solid hsl(217 33% 17%)',
  borderRadius: '8px',
  color: 'hsl(210 40% 98%)',
  fontSize: '12px',
}

interface ChannelStats {
  leadsTotal: number
  leadsNew: number
  salesClosed: number
  salesInPipeline: number
  conversationsTotal: number
  followupsPending: number
  tasksTotal: number
  tasksDone: number
}

export default function ChannelDashboardPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [recentLeads, setRecentLeads] = useState<Lead[]>([])
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [stats, setStats] = useState<ChannelStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      try {
        const [leadsRecent, leadsAll, salesRes, convsRes, followupsRes, tasksRes] = await Promise.all([
          fetchApi<{ data: Lead[]; total: number }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=5`),
          fetchApi<{ data: Lead[]; total: number }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=500`),
          fetchApi<Sale[]>(`/crm/sales?channelSlug=${channelSlug}`),
          fetchApi<{ total: number }>(`/crm/conversations?channelSlug=${channelSlug}&pageSize=1`).catch(() => ({ total: 0 })),
          fetchApi<{ data: { status: string }[]; total: number }>(`/crm/followups?channelSlug=${channelSlug}&pageSize=500`).catch(() => ({ data: [], total: 0 })),
          fetchApi<{ data: { status: string }[]; total: number }>(`/crm/tasks?channelSlug=${channelSlug}&pageSize=500`).catch(() => ({ data: [], total: 0 })),
        ])

        setRecentLeads(leadsRecent.data)
        setAllLeads(leadsAll.data)
        setSales(salesRes)

        const followups = Array.isArray(followupsRes) ? [] : (followupsRes as { data: { status: string }[] }).data
        const tasks = Array.isArray(tasksRes) ? [] : (tasksRes as { data: { status: string }[] }).data

        setStats({
          leadsTotal: leadsAll.total,
          leadsNew: leadsAll.data.filter((l) => l.status === 'NEW').length,
          salesClosed: salesRes.filter((s) => s.stage === 'CLOSED').length,
          salesInPipeline: salesRes.length,
          conversationsTotal: (convsRes as { total: number }).total ?? 0,
          followupsPending: followups.filter((f) => f.status === 'PENDING').length,
          tasksTotal: tasks.length,
          tasksDone: tasks.filter((t) => t.status === 'DONE').length,
        })
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSlug])

  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)

  const leadsByStatus = Object.entries(
    allLeads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value, status }))

  const salesByStage = Object.entries(
    sales.reduce((acc, s) => { acc[s.stage] = (acc[s.stage] ?? 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([stage, count]) => ({ name: STATUS_LABELS[stage] ?? stage, count }))

  const conversionRate = stats && stats.leadsTotal > 0
    ? ((allLeads.filter((l) => l.status === 'CLOSED').length / stats.leadsTotal) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard — {channelName}</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen del canal</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total leads"
          value={loading ? '—' : (stats?.leadsTotal ?? 0)}
          icon={Target}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
          subtitle={`${stats?.leadsNew ?? 0} nuevos`}
        />
        <StatCard
          title="Ventas cerradas"
          value={loading ? '—' : (stats?.salesClosed ?? 0)}
          icon={TrendingUp}
          iconColor="text-green-400"
          iconBg="bg-green-400/10"
          subtitle={`${stats?.salesInPipeline ?? 0} en pipeline`}
        />
        <StatCard
          title="Conversaciones"
          value={loading ? '—' : (stats?.conversationsTotal ?? 0)}
          icon={MessageSquare}
          iconColor="text-purple-400"
          iconBg="bg-purple-400/10"
        />
        <StatCard
          title="Seguimientos"
          value={loading ? '—' : (stats?.followupsPending ?? 0)}
          icon={Clock}
          iconColor="text-orange-400"
          iconBg="bg-orange-400/10"
          subtitle="pendientes"
        />
        <StatCard
          title="Tareas"
          value={loading ? '—' : (stats?.tasksTotal ?? 0)}
          icon={CheckSquare}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-400/10"
          subtitle={`${stats?.tasksDone ?? 0} completadas`}
        />
        <StatCard
          title="Conversión"
          value={loading ? '—' : `${conversionRate}%`}
          icon={Users}
          iconColor="text-pink-400"
          iconBg="bg-pink-400/10"
          subtitle="leads cerrados"
        />
      </div>

      {/* Charts + recent leads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads by status pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Leads por estado</h3>
          {leadsByStatus.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={leadsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {leadsByStatus.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {leadsByStatus.map((item) => (
                  <div key={item.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[item.status] ?? '#6366f1' }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
          )}
        </div>

        {/* Sales pipeline bar */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline ventas</h3>
          {salesByStage.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesByStage} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215 20% 55%)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'hsl(215 20% 55%)', fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin ventas en pipeline</div>
          )}
        </div>

        {/* Recent leads */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Últimos leads</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              Sin leads en este canal
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-border">
              {recentLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    {lead.username && (
                      <p className="text-xs text-muted-foreground">{lead.username}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge value={lead.status} />
                    <span className="text-xs text-muted-foreground hidden lg:block">{formatDate(lead.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
