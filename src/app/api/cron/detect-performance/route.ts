import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/middleware'
import { getRobotConfig, startRun, finishRun } from '@/lib/robot/logger'
import { runDetectPerformance } from '@/lib/robot/jobs'

const JOB = 'detect-performance'

async function checkCronAuth(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${cronSecret}`) return true
  }
  return (await getAuthUser(req)) !== null
}

export async function GET(req: NextRequest) {
  if (!(await checkCronAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const triggeredBy = req.nextUrl.searchParams.get('trigger') === 'manual' ? 'manual' : 'cron'
  const config = await getRobotConfig(JOB)
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })

  const runId = await startRun(JOB, triggeredBy as 'cron' | 'manual')
  const t0 = Date.now()
  try {
    const result = await runDetectPerformance()
    await finishRun(runId, 'ok', result, Date.now() - t0)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e)
    await finishRun(runId, 'error', {}, Date.now() - t0, msg)
    console.error('[detect-performance]', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
