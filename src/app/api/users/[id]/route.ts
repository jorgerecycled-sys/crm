import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  channelIds: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requirePermission(req, 'users:read')

    const { data: user, error } = await supabase
      .from('erp_users')
      .select('*, roles(*), user_channel_access(*, crm_channels(*))')
      .eq('id', id)
      .is('deletedAt', null)
      .maybeSingle()

    if (error) throw error
    if (!user) return apiResponse({ error: 'Usuario no encontrado' }, 404)

    const { passwordHash: _, ...userWithoutPassword } = user
    return apiResponse(userWithoutPassword)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authUser = await requirePermission(req, 'users:write')
    const body = await req.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos invalidos' }, 400)

    const { password, channelIds, ...updateData } = parsed.data
    const data: Record<string, unknown> = { ...updateData }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12)
    }

    if (channelIds !== undefined) {
      const { error: deleteError } = await supabase
        .from('user_channel_access')
        .delete()
        .eq('userId', id)

      if (deleteError) throw deleteError

      if (channelIds.length > 0) {
        const { error: insertError } = await supabase
          .from('user_channel_access')
          .insert(channelIds.map((channelId) => ({ userId: id, channelId })))

        if (insertError) throw insertError
      }
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('erp_users')
      .update(data)
      .eq('id', id)
      .select('*, roles(*), user_channel_access(*, crm_channels(*))')
      .single()

    if (updateError) throw updateError

    await logActivity({
      userId: authUser.sub,
      action: 'UPDATE_USER',
      resource: 'users',
      resourceId: updatedUser.id,
      req,
    })

    const { passwordHash: _, ...userWithoutPassword } = updatedUser
    return apiResponse(userWithoutPassword)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authUser = await requirePermission(req, 'users:delete')

    const { error } = await supabase
      .from('erp_users')
      .update({ deletedAt: new Date().toISOString(), status: 'INACTIVE' })
      .eq('id', id)

    if (error) throw error

    await logActivity({
      userId: authUser.sub,
      action: 'DELETE_USER',
      resource: 'users',
      resourceId: id,
      req,
    })

    return apiResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}