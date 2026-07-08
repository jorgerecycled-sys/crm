import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const patchSchema = z.object({
  status: z.enum(['pending', 'in_review', 'in_progress', 'done', 'rejected']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  adminNotes: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    if (user.roleName === 'Empleado') return apiResponse({ error: 'Sin permiso' }, 403)

    const body = await req.json()
    const parsed = patchSchema.parse(body)

    const { data, error } = await supabase
      .from('app_mejoras')
      .update({ ...parsed, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return apiResponse(data)
  } catch (e) { return handleApiError(e) }
}
