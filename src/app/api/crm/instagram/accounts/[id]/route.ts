import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { generateDailyTasks } from '@/lib/robot/jobs'

const patchSchema = z.object({
  username: z.string().min(1).optional(),
  status: z.enum(['active', 'suspended', 'new', 'unused', 'retiring', 'shadow banned']).optional(),
  notes: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  phoneRef: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  igPassword: z.string().nullable().optional(),
  igEmail: z.string().nullable().optional(),
  fa2: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const parsed = patchSchema.parse(body)

    // Derive employee display name when employeeId changes
    const update: Record<string, unknown> = { ...parsed }
    if ('employeeId' in parsed) {
      if (parsed.employeeId) {
        const { data: u } = await supabase.from('erp_users').select('firstName, lastName').eq('id', parsed.employeeId).maybeSingle()
        update.employee = u ? `${u.firstName} ${u.lastName}` : null
      } else {
        update.employee = null
      }
    }

    const { data: account, error } = await supabase.from('ig_accounts').update(update).eq('id', id).select().single()
    if (error) throw error

    // Auto-generate today's tasks when phoneRef or employeeId is set
    if ('phoneRef' in parsed || 'employeeId' in parsed) {
      generateDailyTasks().catch(() => {}) // fire-and-forget, don't block response
    }

    return apiResponse(account)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req)
    const { id } = await params
    const { error } = await supabase.from('ig_accounts').delete().eq('id', id)
    if (error) throw error
    return apiResponse({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
