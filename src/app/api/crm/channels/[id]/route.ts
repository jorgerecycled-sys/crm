import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateChannelSchema = z.object({
  name: z.string().min(2).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requirePermission(req, 'admin:read')

    const { data: channel, error } = await supabase
      .from('crm_channels')
      .select('*, leads(*), user_channel_access(*)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!channel) return apiResponse({ error: 'Canal no encontrado' }, 404)

    const result = {
      ...channel,
      _count: {
        leads: channel.leads?.length ?? 0,
        userAccess: channel.user_channel_access?.length ?? 0,
      },
      leads: undefined,
      user_channel_access: undefined,
    }

    return apiResponse(result)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requirePermission(req, 'channels:manage')
    const body = await req.json()
    const parsed = updateChannelSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: channel, error } = await supabase
      .from('crm_channels')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'UPDATE_CHANNEL',
      resource: 'crm_channels',
      resourceId: channel.id,
      req,
    })

    return apiResponse(channel)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requirePermission(req, 'channels:manage')

    const { error } = await supabase
      .from('crm_channels')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'DELETE_CHANNEL',
      resource: 'crm_channels',
      resourceId: id,
      req,
    })

    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
