import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, requireChannelAccess, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createLeadSchema = z.object({
  name: z.string().min(2),
  username: z.string().optional(),
  channelId: z.string().uuid(),
  status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'CLOSED', 'LOST']).default('NEW'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedToId: z.string().uuid().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channelId')
    const channelSlug = searchParams.get('channelSlug')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')
    const search = searchParams.get('search')

    const skip = (page - 1) * pageSize

    let query = supabase
      .from('leads')
      .select('*, crm_channels(*), erp_users!assignedToId(id, firstName, lastName)', { count: 'exact' })
      .is('deletedAt', null)

    let countQuery = supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .is('deletedAt', null)

    if (channelSlug) {
      await requireChannelAccess(req, channelSlug)
      query = query.eq('crm_channels.slug', channelSlug)
      countQuery = countQuery.eq('crm_channels.slug', channelSlug)
    } else if (channelId) {
      query = query.eq('channelId', channelId)
      countQuery = countQuery.eq('channelId', channelId)
    }

    if (status) {
      query = query.eq('status', status)
      countQuery = countQuery.eq('status', status)
    }

    if (search) {
      const searchFilter = `name.ilike.%${search}%,username.ilike.%${search}%`
      query = query.or(searchFilter)
      countQuery = countQuery.or(searchFilter)
    }

    query = query.order('createdAt', { ascending: false }).range(skip, skip + pageSize - 1)

    const [{ data: leads, error: leadsError }, { count, error: countError }] = await Promise.all([
      query,
      countQuery,
    ])

    if (leadsError) throw leadsError
    if (countError) throw countError

    const total = count ?? 0

    return apiResponse({
      data: leads,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createLeadSchema.safeParse(body)
    if (!parsed.success) {
      return apiResponse({ error: 'Datos inválidos', details: parsed.error.errors }, 400)
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({ id: uuidv4(), ...parsed.data })
      .select('*, crm_channels(*), erp_users!assignedToId(id, firstName, lastName)')
      .single()

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'CREATE_LEAD',
      resource: 'leads',
      resourceId: lead.id,
      req,
    })

    return apiResponse(lead, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
