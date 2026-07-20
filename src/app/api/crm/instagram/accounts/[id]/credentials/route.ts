import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { assertOwnsAccountIfEmployee } from '@/lib/instagram/ownership'
import { logActivity } from '@/lib/auth/activity'

// Instagram credentials (password/email/2FA) are deliberately kept out of the
// bulk /accounts and /stats responses — they're fetched one account at a time
// here, and every fetch is audit-logged, so there's a record of who viewed
// which account's plaintext credentials and when.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireAuth(req)
    const { id } = await params
    const forbidden = await assertOwnsAccountIfEmployee(id, authUser)
    if (forbidden) return forbidden

    const { data: account, error } = await supabase
      .from('ig_accounts')
      .select('username, igPassword, igEmail, fa2')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!account) return apiResponse({ error: 'Cuenta no encontrada' }, 404)

    await logActivity({
      userId: authUser.sub,
      action: 'VIEW_IG_CREDENTIALS',
      resource: 'ig_accounts',
      resourceId: id,
      metadata: { username: account.username },
      req,
    })

    return apiResponse({
      igPassword: account.igPassword ?? null,
      igEmail: account.igEmail ?? null,
      fa2: account.fa2 ?? null,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
