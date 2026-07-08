import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateLeadSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'CLOSED', 'LOST']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAuth(req)

    const { data: lead, error } = await supabase
      .from('leads')
      .select(`
        *,
        crm_channels(*),
        erp_users!assignedToId(id, firstName, lastName),
        conversations(
          *,
          erp_users!responsibleId(id, firstName, lastName)
        ),
        followups(
          *,
          erp_users!responsibleId(id, firstName, lastName)
        )
      `)
      .eq('id', id)
      .is('deletedAt', null)
      .maybeSingle()

    if (error) throw error
    if (!lead) return apiResponse({ error: 'Lead no encontrado' }, 404)

    if (lead.conversations) {
      lead.conversations.sort(
        (a: { createdAt: string }, b: { createdAt: string }) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }
    if (lead.followups) {
      lead.followups.sort(
        (a: { scheduledAt: string }, b: { scheduledAt: string }) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    }

    return apiResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = updateLeadSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos invalidos' }, 400)

    const { data: lead, error } = await supabase
      .from('leads')
      .update(parsed.data)
      .eq('id', id)
      .select(`
        *,
        crm_channels(*),
        erp_users!assignedToId(id, firstName, lastName)
      `)
      .single()

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'UPDATE_LEAD',
      resource: 'leads',
      resourceId: lead.id,
      metadata: parsed.data,
      req,
    })

    return apiResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)

    const { error } = await supabase
      .from('leads')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    await logActivity({
      userId: user.sub,
      action: 'DELETE_LEAD',
      resource: 'leads',
      resourceId: id,
      req,
    })

    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}