import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      activeUsersResult,
      newLeadsResult,
      monthlySalesResult,
      conversationsResult,
      openIncidentsResult,
      recentActivityResult,
      leadsForGroupResult,
      salesForGroupResult,
    ] = await Promise.all([
      supabase.from('erp_users').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deletedAt', null),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'NEW').is('deletedAt', null),
      supabase.from('sales').select('*', { count: 'exact', head: true }).eq('stage', 'CLOSED').gte('createdAt', startOfMonth),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).gte('createdAt', startOfMonth),
      supabase.from('incidents').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'),
      supabase.from('activity_logs').select('*, erp_users(firstName, lastName)').order('createdAt', { ascending: false }).limit(10),
      supabase.from('leads').select('status').is('deletedAt', null),
      supabase.from('sales').select('stage'),
    ])

    if (activeUsersResult.error) throw activeUsersResult.error
    if (newLeadsResult.error) throw newLeadsResult.error
    if (monthlySalesResult.error) throw monthlySalesResult.error
    if (conversationsResult.error) throw conversationsResult.error
    if (openIncidentsResult.error) throw openIncidentsResult.error
    if (recentActivityResult.error) throw recentActivityResult.error
    if (leadsForGroupResult.error) throw leadsForGroupResult.error
    if (salesForGroupResult.error) throw salesForGroupResult.error

    const activeUsers = activeUsersResult.count ?? 0
    const newLeads = newLeadsResult.count ?? 0
    const monthlySales = monthlySalesResult.count ?? 0
    const conversations = conversationsResult.count ?? 0
    const openIncidents = openIncidentsResult.count ?? 0
    const recentActivity = recentActivityResult.data ?? []

    const leadsByStatus = (leadsForGroupResult.data ?? []).reduce<{ status: string; _count: { status: number } }[]>((acc, l) => {
      const entry = acc.find(x => x.status === l.status)
      if (entry) {
        entry._count.status++
      } else {
        acc.push({ status: l.status, _count: { status: 1 } })
      }
      return acc
    }, [])

    const salesByStage = (salesForGroupResult.data ?? []).reduce<{ stage: string; _count: { stage: number } }[]>((acc, s) => {
      const entry = acc.find(x => x.stage === s.stage)
      if (entry) {
        entry._count.stage++
      } else {
        acc.push({ stage: s.stage, _count: { stage: 1 } })
      }
      return acc
    }, [])

    return apiResponse({
      stats: {
        activeUsers,
        newLeads,
        monthlySales,
        conversations,
        openIncidents,
      },
      recentActivity,
      leadsByStatus,
      salesByStage,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
