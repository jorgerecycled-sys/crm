import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { syncPhoneRecord, syncAccountRecord } from '@/lib/airtable/sync'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.AIRTABLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const table = req.nextUrl.searchParams.get('table')
  let recordId: string | undefined
  try {
    const body = await req.json()
    recordId = body.recordId
  } catch {
    recordId = undefined
  }
  if (!recordId) {
    return NextResponse.json({ error: 'recordId requerido en el body' }, { status: 400 })
  }
  if (table !== 'Phones' && table !== 'Instagram Accounts') {
    return NextResponse.json({ error: `Tabla desconocida: ${table}` }, { status: 400 })
  }

  // Respond immediately so the Airtable automation doesn't time out waiting on us —
  // the actual Airtable + Supabase round trips run in the background after the response.
  after(async () => {
    try {
      if (table === 'Phones') await syncPhoneRecord(recordId!)
      else await syncAccountRecord(recordId!)
    } catch (e) {
      console.error(`Airtable webhook sync error (${table}/${recordId}):`, e)
    }
  })

  return NextResponse.json({ ok: true, queued: true })
}
