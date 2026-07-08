import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await requireAuth(req)
    const body = await req.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const { firstName, lastName, currentPassword, newPassword } = parsed.data
    const data: Record<string, unknown> = {}

    if (firstName) data.firstName = firstName
    if (lastName) data.lastName = lastName

    if (newPassword) {
      if (!currentPassword) return apiResponse({ error: 'Debes introducir tu contraseña actual' }, 400)
      const { data: user, error: userError } = await supabase
        .from('erp_users')
        .select('*')
        .eq('id', authUser.sub)
        .single()
      if (userError) throw userError
      if (!user) return apiResponse({ error: 'Usuario no encontrado' }, 404)
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return apiResponse({ error: 'Contraseña actual incorrecta' }, 400)
      data.passwordHash = await bcrypt.hash(newPassword, 12)
    }

    const { data: updated, error: updateError } = await supabase
      .from('erp_users')
      .update(data)
      .eq('id', authUser.sub)
      .select('id, email, firstName, lastName, status')
      .single()
    if (updateError) throw updateError

    return apiResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req)

    const { data: user, error } = await supabase
      .from('erp_users')
      .select('*, roles(*, role_permissions(*, permissions(*))), user_channel_access(*, crm_channels(*))')
      .eq('id', authUser.sub)
      .is('deletedAt', null)
      .single()
    if (error) throw error

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const activeChannelAccess = (user.user_channel_access ?? []).filter(
      (a: any) => a.crm_channels?.active === true
    )

    return NextResponse.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      role: user.roles,
      permissions: (user.roles?.role_permissions ?? []).map(
        (rp: any) => rp.permissions?.name
      ).filter(Boolean),
      channels: activeChannelAccess
        .map((a: any) => a.crm_channels)
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
