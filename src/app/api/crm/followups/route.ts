import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createFollowupSchema = z.object({
  leadId: z.string().uuid(),
  channelId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  responsibleId: z.string().uuid().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channelId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')

    const skip = (page - 1) * pageSize

    let query = supabase
      .from('followups')
      .select('*, leads(*), crm_channels(*), erp_users!responsibleId(*)', { count: 'exact' })
      .order('scheduledAt', { ascending: true })
      .range(skip, skip + pageSize - 1)

    if (channelId) query = query.eq('channelId', channelId)
    if (status) query = query.eq('status', status)

    const { data: followups, error, count } = await query
    if (error) throw error

    const total = count ?? 0

    return apiResponse({ data: followups, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createFollowupSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: inserted, error: insertError } = await supabase
      .from('followups')
      .insert({
        id: uuidv4(),
        ...parsed.data,
        scheduledAt: new Date(parsed.data.scheduledAt).toISOString(),
        responsibleId: parsed.data.responsibleId ?? user.sub,
      })
      .select()
      .single()

    if (insertError) throw insertError

    const { data: followup, error: selectError } = await supabase
      .from('followups')
      .select('*, leads(*), crm_channels(*), erp_users!responsibleId(*)')
      .eq('id', inserted.id)
      .single()

    if (selectError) throw selectError

    await logActivity({ userId: user.sub, action: 'CREATE_FOLLOWUP', resource: 'followups', resourceId: followup.id, req })
    return apiResponse(followup, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
