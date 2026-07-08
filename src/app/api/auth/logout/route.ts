import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { getAuthUser } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const { refreshToken } = await req.json().catch(() => ({}))

    if (refreshToken) {
      const { error } = await supabase
        .from('refresh_tokens')
        .delete()
        .eq('token', refreshToken)
      if (error) throw error
    }

    if (user) {
      await logActivity({
        userId: user.sub,
        action: 'LOGOUT',
        resource: 'auth',
        req,
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
