import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createSaleSchema = z.object({
  leadId: z.string().uuid(),
  channelId: z.string().uuid(),
  title: z.string().min(2),
  amount: z.number().optional(),
  stage: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'OFFER', 'CLOSED', 'LOST']).default('NEW'),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channelId')
    const channelSlug = searchParams.get('channelSlug')

    let query = supabase
      .from('sales')
      .select('*, leads(id, name, username), crm_channels(*)')
      .order('stage', { ascending: true })
      .order('sortOrder', { ascending: true })

    if (channelId) {
      query = query.eq('channelId', channelId)
    }

    if (channelSlug) {
      query = query.eq('crm_channels.slug', channelSlug)
    }

    const { data, error } = await query
    if (error) throw error

    return apiResponse(data)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createSaleSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({ id: uuidv4(), ...parsed.data })
      .select('*, leads(id, name, username), crm_channels(*)')
      .single()

    if (error) throw error

    await logActivity({ userId: user.sub, action: 'CREATE_SALE', resource: 'sales', resourceId: sale.id, req })
    return apiResponse(sale, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
