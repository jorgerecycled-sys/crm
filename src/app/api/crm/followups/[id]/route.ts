import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const updateFollowupSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAuth(req)
    const body = await req.json()
    const parsed = updateFollowupSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const updateData: Record<string, unknown> = { ...parsed.data }
    if (parsed.data.scheduledAt) {
      updateData.scheduledAt = new Date(parsed.data.scheduledAt).toISOString()
    }

    const { data, error } = await supabase
      .from('followups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return apiResponse(data)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAuth(req)
    const { error } = await supabase
      .from('followups')
      .delete()
      .eq('id', id)
    if (error) throw error
    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
