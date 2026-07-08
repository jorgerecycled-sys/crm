import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, JWTPayload } from './jwt'
import { supabase } from '@/lib/supabase/client'

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    return payload
  } catch {
    return null
  }
}

export async function requireAuth(req: NextRequest): Promise<JWTPayload> {
  const user = await getAuthUser(req)
  if (!user) {
    throw new AuthError('Unauthorized', 401)
  }
  return user
}

export async function requirePermission(
  req: NextRequest,
  permission: string
): Promise<JWTPayload> {
  const user = await requireAuth(req)

  const { data: hasPermission, error } = await supabase
    .from('role_permissions')
    .select('*, permissions!inner(name)')
    .eq('roleId', user.roleId)
    .eq('permissions.name', permission)
    .maybeSingle()

  if (error) throw error

  if (!hasPermission) {
    throw new AuthError('Forbidden', 403)
  }

  return user
}

export async function requireChannelAccess(
  req: NextRequest,
  channelSlug: string
): Promise<JWTPayload> {
  const user = await requireAuth(req)

  const { data: channel, error: channelError } = await supabase
    .from('crm_channels')
    .select('id')
    .eq('slug', channelSlug)
    .eq('active', true)
    .maybeSingle()

  if (channelError) throw channelError

  if (!channel) {
    throw new AuthError('No access to this channel', 403)
  }

  const { data: access, error: accessError } = await supabase
    .from('user_channel_access')
    .select('*')
    .eq('userId', user.sub)
    .eq('channelId', channel.id)
    .maybeSingle()

  if (accessError) throw accessError

  if (!access) {
    throw new AuthError('No access to this channel', 403)
  }

  return user
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode })
  }
  console.error('API Error:', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export function apiResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}
