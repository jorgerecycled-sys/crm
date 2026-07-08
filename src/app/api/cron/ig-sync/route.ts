import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/middleware'
import { startRun, finishRun, getRobotConfig } from '@/lib/robot/logger'

const JOB = 'ig-sync'

export const maxDuration = 290

async function checkCronAuth(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  // CRON_SECRET configured and matches → Vercel cron with secret
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  // Authenticated user → manual trigger from Robot page
  if (await getAuthUser(req) !== null) return true
  // No CRON_SECRET configured → allow Vercel's unauthenticated cron call (no auth header)
  if (!cronSecret && !authHeader) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!(await checkCronAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await getRobotConfig(JOB)
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })

  console.log('[ig-sync cron] triggered at', new Date().toISOString())
  const runId = await startRun(JOB, 'cron')
  const t0 = Date.now()
  try {
    // Use the canonical production URL — VERCEL_PROJECT_PRODUCTION_URL is always the production domain
    const host =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ??
      process.env.VERCEL_URL ??
      `localhost:${process.env.PORT ?? 3000}`
    const baseUrl = host.startsWith('http') ? host : `https://${host}`
    const cronSecret = process.env.CRON_SECRET ?? ''

    const res = await fetch(`${baseUrl}/api/crm/instagram/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ force: false }),
      signal: AbortSignal.timeout(270_000), // 4.5 min max (Vercel hobby limit is 5 min)
    })

    const text = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = { error: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` }
    }
    const result = {
      procesadas: data.procesadas ?? 0,
      errores: data.errores ?? 0,
      total: data.total ?? 0,
    }
    await finishRun(runId, res.ok ? 'ok' : 'error', result, Date.now() - t0,
      res.ok ? undefined : String(data.error ?? ''))
    return NextResponse.json({ ok: res.ok, ...result })
  } catch (e) {
    const msg = String(e)
    await finishRun(runId, 'error', {}, Date.now() - t0, msg)
    console.error('[ig-sync cron]', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
