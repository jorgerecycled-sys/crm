import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateSaleSchema = z.object({
  title: z.string().min(2).optional(),
  amount: z.number().optional(),
  stage: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'OFFER', 'CLOSED', 'LOST']).optional(),
  notes: z.string().optional(),
  sortOrder: z.number().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = updateSaleSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { data: sale, error } = await supabase
      .from('sales')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    await logActivity({ userId: user.sub, action: 'UPDATE_SALE', resource: 'sales', resourceId: sale.id, metadata: parsed.data, req })
    return apiResponse(sale)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAuth(req)

    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)
    if (error) throw error

    await logActivity({ userId: user.sub, action: 'DELETE_SALE', resource: 'sales', resourceId: id, req })
    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
