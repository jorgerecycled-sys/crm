'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Lead, Sale } from '@/types'
import { StatCard } from '@/components/ui/stat-card'
import { Target, TrendingUp, MessageSquare, CheckSquare, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo', CONTACTED: 'Contactado', INTERESTED: 'Interesado',
  NEGOTIATING: 'Negociación', CLOSED: 'Cerrado', LOST: 'Perdido',
}
const COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#ec4899']

export default function ReportsPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [leads, setLeads] = useState<Lead[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchApi<{ data: Lead[] }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=500`),
      fetchApi<Sale[]>(`/crm/sales?channelSlug=${channelSlug}`),
    ])
      .then(([lRes, sRes]) => { setLeads(lRes.data); setSales(sRes) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const leadsByStatus = Object.entries(
    leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count }))

  const salesByStage = Object.entries(
    sales.reduce((acc, s) => { acc[s.stage] = (acc[s.stage] ?? 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([stage, count]) => ({ name: STATUS_LABELS[stage] ?? stage, count }))

  const conversionRate = leads.length > 0
    ? ((leads.filter((l) => l.status === 'CLOSED').length / leads.length) * 100).toFixed(1)
    : '0'

  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)

  const tooltipStyle = { background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px', color: 'hsl(210 40% 98%)' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reportes — {channelName}</h1>
        <p className="text-muted-foreground text-sm mt-1">KPIs y métricas del canal</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total leads" value={loading ? '—' : leads.length} icon={Target} iconColor="text-blue-400" iconBg="bg-blue-400/10" />
        <StatCard title="Conversión" value={loading ? '—' : `${conversionRate}%`} icon={TrendingUp} iconColor="text-green-400" iconBg="bg-green-400/10" />
        <StatCard title="Ventas cerradas" value={loading ? '—' : sales.filter((s) => s.stage === 'CLOSED').length} icon={CheckSquare} iconColor="text-purple-400" iconBg="bg-purple-400/10" />
        <StatCard title="En negociación" value={loading ? '—' : leads.filter((l) => l.status === 'NEGOTIATING').length} icon={Clock} iconColor="text-orange-400" iconBg="bg-orange-400/10" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Leads por estado</h3>
          {leadsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={leadsByStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {leadsByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline de ventas</h3>
          {salesByStage.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesByStage} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(215 20% 55%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(215 20% 55%)', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>}
        </div>
      </div>
    </div>
  )
}
