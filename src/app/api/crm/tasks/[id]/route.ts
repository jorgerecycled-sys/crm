import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateTaskSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().uuid().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = updateTaskSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos invalidos' }, 400)

    const updateData = {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : undefined,
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logActivity({ userId: user.sub, action: 'UPDATE_TASK', resource: 'tasks', resourceId: task.id, metadata: parsed.data, req })
    return apiResponse(task)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logActivity({ userId: user.sub, action: 'DELETE_TASK', resource: 'tasks', resourceId: id, req })
    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
