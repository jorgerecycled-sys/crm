import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createChannelSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  icon: z.string(),
  color: z.string().default('#6366f1'),
  active: z.boolean().default(true),
  sortOrder: z.number().default(0),
})

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'admin:read')

    const { data, error } = await supabase
      .from('crm_channels')
      .select('*, leads(id), user_channel_access(userId)')
      .order('sortOrder', { ascending: true })

    if (error) throw error

    const channels = (data ?? []).map((item: any) => {
      const { leads, user_channel_access, ...rest } = item
      return {
        ...rest,
        _count: {
          leads: leads?.length ?? 0,
          userAccess: user_channel_access?.length ?? 0,
        },
      }
    })

    return apiResponse(channels)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, 'channels:manage')
    const body = await req.json()
    const parsed = createChannelSchema.safeParse(body)
    if (!parsed.success) {
      return apiResponse({ error: 'Datos inválidos', details: parsed.error.errors }, 400)
    }

    const { data: channel, error } = await supabase
      .from('crm_channels')
      .insert({ id: uuidv4(), ...parsed.data })
      .select()
      .single()

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'CREATE_CHANNEL',
      resource: 'crm_channels',
      resourceId: channel.id,
      req,
    })

    return apiResponse(channel, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
