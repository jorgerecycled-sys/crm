import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const BAD_STATUSES = ['suspended', 'shadow banned']

// GET: map of accountId -> dismissedStatus, used to hide already-seen problems
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  const { data, error } = await supabase.from('ig_account_alert_dismissals').select('accountId, dismissedStatus')
  if (error?.code === '42P01') {
    return NextResponse.json({ dismissals: [], missing: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dismissals: data ?? [] })
}

// POST: dismiss all accounts currently flagged as suspended/shadow banned
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  try {
    const { data: badAccounts, error: findError } = await supabase
      .from('ig_accounts')
      .select('id, status')
      .in('status', BAD_STATUSES)
    if (findError) throw findError

    if (!badAccounts || badAccounts.length === 0) {
      return apiResponse({ dismissed: 0 })
    }

    const rows = badAccounts.map(a => ({ accountId: a.id, dismissedStatus: a.status, dismissedAt: new Date().toISOString() }))
    const { error: upsertError } = await supabase.from('ig_account_alert_dismissals').upsert(rows, { onConflict: 'accountId' })
    if (upsertError) throw upsertError

    return apiResponse({ dismissed: rows.length })
  } catch (e) {
    return handleApiError(e)
  }
}
