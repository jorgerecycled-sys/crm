import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { verifyRefreshToken, signAccessToken } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  try {
    const { refreshToken } = await req.json()
    if (!refreshToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const payload = await verifyRefreshToken(refreshToken).catch(() => null)
    if (!payload) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { data: storedToken, error: tokenError } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token', refreshToken)
      .maybeSingle()

    if (tokenError) throw tokenError

    if (!storedToken || new Date(storedToken.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 401 })
    }

    const { data: user, error: userError } = await supabase
      .from('erp_users')
      .select('*, roles(*)')
      .eq('id', payload.sub)
      .eq('status', 'ACTIVE')
      .is('deletedAt', null)
      .single()

    if (userError) throw userError

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.roles.name,
    })

    return NextResponse.json({ accessToken })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
