import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { logActivity } from '@/lib/auth/activity'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }

    const { email, password } = parsed.data

    const { data: user, error: userError } = await supabase
      .from('erp_users')
      .select('*, roles(*), user_channel_access(*, crm_channels(*))')
      .eq('email', email)
      .is('deletedAt', null)
      .maybeSingle()

    if (userError) throw userError

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roles.name,
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(tokenPayload),
      signRefreshToken(tokenPayload),
    ])

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const [{ error: insertError }, { error: updateError }] = await Promise.all([
      supabase.from('refresh_tokens').insert({
        id: uuidv4(),
        userId: user.id,
        token: refreshToken,
        expiresAt: expiresAt.toISOString(),
      }),
      supabase
        .from('erp_users')
        .update({ lastLoginAt: new Date().toISOString() })
        .eq('id', user.id),
    ])

    if (insertError) throw insertError
    if (updateError) throw updateError

    await logActivity({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      req,
    })

    // Build channel list from explicit grants
    const channelMap = new Map<string, any>()
    for (const a of user.user_channel_access as any[]) {
      if (a.crm_channels?.active) channelMap.set(a.crm_channels.id, a.crm_channels)
    }

    // For Empleado: also auto-include Instagram if they have assigned accounts
    if (user.roles.name === 'Empleado') {
      const { data: igCheck } = await supabase
        .from('ig_accounts')
        .select('id')
        .eq('employeeId', user.id)
        .limit(1)
      if (igCheck?.length) {
        const { data: igCh } = await supabase
          .from('crm_channels')
          .select('*')
          .eq('slug', 'instagram')
          .eq('active', true)
          .maybeSingle()
        if (igCh && !channelMap.has(igCh.id)) channelMap.set(igCh.id, igCh)
      }
    }

    const channels = [...channelMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)

    return NextResponse.json({
      accessToken,
      refreshToken,
      user: {
        sub: user.id,
        email: user.email,
        roleId: user.roleId,
        roleName: user.roles.name,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      channels,
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
