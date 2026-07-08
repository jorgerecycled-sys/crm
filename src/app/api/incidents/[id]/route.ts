import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateIncidentSchema = z.object({
  status: z.enum(['OPEN', 'REVIEWING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
})

const addCommentSchema = z.object({
  content: z.string().min(1),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAuth(req)

    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*, erp_users!reportedById(id, firstName, lastName, email), incident_comments(*, erp_users(id, firstName, lastName)), incident_history(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!incident) return apiResponse({ error: 'Incidencia no encontrada' }, 404)

    return apiResponse(incident)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    const body = await req.json()

    if (body.comment) {
      const parsed = addCommentSchema.safeParse({ content: body.comment })
      if (!parsed.success) return apiResponse({ error: 'Comentario inválido' }, 400)

      const { data: comment, error } = await supabase
        .from('incident_comments')
        .insert({ id: uuidv4(), incidentId: id, userId: user.sub, content: parsed.data.content })
        .select('*, erp_users(id, firstName, lastName)')
        .single()

      if (error) throw error

      return apiResponse(comment, 201)
    }

    const parsed = updateIncidentSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: current, error: fetchError } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!current) return apiResponse({ error: 'Incidencia no encontrada' }, 404)

    const { data: incident, error: updateError } = await supabase
      .from('incidents')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    if (parsed.data.status && parsed.data.status !== current.status) {
      const { error: historyError } = await supabase
        .from('incident_history')
        .insert({
          id: uuidv4(),
          incidentId: id,
          field: 'status',
          oldValue: current.status,
          newValue: parsed.data.status,
        })

      if (historyError) throw historyError
    }

    await logActivity({ userId: user.sub, action: 'UPDATE_INCIDENT', resource: 'incidents', resourceId: id, metadata: parsed.data, req })
    return apiResponse(incident)
  } catch (error) {
    return handleApiError(error)
  }
}