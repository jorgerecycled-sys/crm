import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().optional().default(''),
  roleId: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  channelIds: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'users:read')
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')
    const search = searchParams.get('search')
    const roleId = searchParams.get('roleId')
    const status = searchParams.get('status')

    const skip = (page - 1) * pageSize

    // Build base queries
    let query = supabase
      .from('erp_users')
      .select('*, roles(*), user_channel_access(*, crm_channels(*))')
      .is('deletedAt', null)

    let countQuery = supabase
      .from('erp_users')
      .select('*', { count: 'exact', head: true })
      .is('deletedAt', null)

    // Apply search filter across email, firstName, lastName (case-insensitive)
    if (search) {
      const searchFilter = `email.ilike.%${search}%,firstName.ilike.%${search}%,lastName.ilike.%${search}%`
      query = query.or(searchFilter)
      countQuery = countQuery.or(searchFilter)
    }

    if (roleId) {
      query = query.eq('roleId', roleId)
      countQuery = countQuery.eq('roleId', roleId)
    }

    if (status) {
      query = query.eq('status', status)
      countQuery = countQuery.eq('status', status)
    }

    query = query.order('createdAt', { ascending: false }).range(skip, skip + pageSize - 1)

    const [{ data: users, error: usersError }, { count, error: countError }] = await Promise.all([
      query,
      countQuery,
    ])

    if (usersError) throw usersError
    if (countError) throw countError

    const total = count ?? 0

    return apiResponse({
      data: (users ?? []).map((u) => ({ ...u, passwordHash: undefined })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requirePermission(req, 'users:write')
    const body = await req.json()
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return apiResponse({ error: 'Datos inválidos', details: parsed.error.errors }, 400)
    }

    // Check for existing user with same email
    const { data: existing, error: existingError } = await supabase
      .from('erp_users')
      .select('id')
      .eq('email', parsed.data.email)
      .maybeSingle()

    if (existingError) throw existingError
    if (existing) {
      return apiResponse({ error: 'El email ya está en uso' }, 409)
    }

    const { password, channelIds, ...userData } = parsed.data
    const passwordHash = await bcrypt.hash(password, 12)
    const newUserId = uuid()

    // Insert the new user
    const { data: user, error: createError } = await supabase
      .from('erp_users')
      .insert({ id: newUserId, ...userData, passwordHash })
      .select('*, roles(*), user_channel_access(*, crm_channels(*))')
      .single()

    if (createError) throw createError

    // Auto-link ig_accounts where employee text matches this user's name
    const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ')
    await supabase
      .from('ig_accounts')
      .update({ employeeId: newUserId })
      .eq('employee', fullName)
      .is('employeeId', null)

    // Insert channel access records if channelIds provided, then re-fetch
    if (channelIds && channelIds.length > 0) {
      const channelAccessRows = channelIds.map((channelId) => ({
        userId: newUserId,
        channelId,
      }))

      const { error: channelError } = await supabase
        .from('user_channel_access')
        .insert(channelAccessRows)

      if (channelError) throw channelError

      const { data: userWithChannels, error: refetchError } = await supabase
        .from('erp_users')
        .select('*, roles(*), user_channel_access(*, crm_channels(*))')
        .eq('id', newUserId)
        .single()

      if (refetchError) throw refetchError

      await logActivity({
        userId: authUser.sub,
        action: 'CREATE_USER',
        resource: 'users',
        resourceId: newUserId,
        req,
      })

      return apiResponse({ ...userWithChannels, passwordHash: undefined }, 201)
    }

    await logActivity({
      userId: authUser.sub,
      action: 'CREATE_USER',
      resource: 'users',
      resourceId: newUserId,
      req,
    })

    return apiResponse({ ...user, passwordHash: undefined }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
