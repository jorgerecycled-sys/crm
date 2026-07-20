import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { generateDailyTasks } from '@/lib/robot/jobs'

// Empleado can only ever touch accounts assigned to them — throws 403
// (as a plain Response, not a DB error) if the account belongs to someone else.
async function assertOwnsAccountIfEmployee(id: string, authUser: { roleName: string; sub: string }) {
  if (authUser.roleName !== 'Empleado') return null
  const { data: existing, error } = await supabase.from('ig_accounts').select('employeeId').eq('id', id).maybeSingle()
  if (error) throw error
  if (!existing) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  if (existing.employeeId !== authUser.sub) {
    return NextResponse.json({ error: 'No puedes modificar una cuenta que no es tuya' }, { status: 403 })
  }
  return null
}

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
    const authUser = await requireAuth(req)
    const { id } = await params
    const forbidden = await assertOwnsAccountIfEmployee(id, authUser)
    if (forbidden) return forbidden

    const body = await req.json()
    const parsed = patchSchema.parse(body)
    // Empleado can edit their own account's details but can't reassign it to
    // someone else — strip any employeeId change from their request.
    if (authUser.roleName === 'Empleado') delete parsed.employeeId

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
    const authUser = await requireAuth(req)
    const { id } = await params
    const forbidden = await assertOwnsAccountIfEmployee(id, authUser)
    if (forbidden) return forbidden

    const { error } = await supabase.from('ig_accounts').delete().eq('id', id)
    if (error) throw error
    return apiResponse({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
