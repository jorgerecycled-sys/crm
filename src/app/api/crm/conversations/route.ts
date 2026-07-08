import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createConversationSchema = z.object({
  leadId: z.string().uuid(),
  channelId: z.string().uuid(),
  message: z.string().min(1),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('leadId')
    const channelId = searchParams.get('channelId')
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')
    const channelSlug = searchParams.get('channelSlug')

    const skip = (page - 1) * pageSize

    let query = supabase
      .from('conversations')
      .select('*, leads(id, name, username), crm_channels(*), erp_users!responsibleId(id, firstName, lastName)', { count: 'exact' })
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    if (leadId) query = query.eq('leadId', leadId)
    if (channelId) query = query.eq('channelId', channelId)
    if (channelSlug) query = query.eq('crm_channels.slug', channelSlug)

    const { data: conversations, error, count } = await query
    if (error) throw error

    const total = count ?? 0

    return apiResponse({ data: conversations, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createConversationSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({ id: uuidv4(), ...parsed.data, responsibleId: user.sub })
      .select('*, leads(id, name, username), crm_channels(*), erp_users!responsibleId(id, firstName, lastName)')
      .single()
    if (error) throw error

    await logActivity({ userId: user.sub, action: 'CREATE_CONVERSATION', resource: 'conversations', resourceId: conversation.id, req })
    return apiResponse(conversation, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
