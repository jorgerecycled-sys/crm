import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/middleware'
import { getRobotConfig, startRun, finishRun } from '@/lib/robot/logger'
import { generateDailyTasks } from '@/lib/robot/jobs'

const JOB = 'generate-tasks'

async function checkCronAuth(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  // CRON_SECRET configured and matches → Vercel cron with secret
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  // Authenticated user → manual trigger
  if (await getAuthUser(req) !== null) return true
  // No CRON_SECRET configured → allow Vercel's unauthenticated cron call (no auth header)
  if (!cronSecret && !authHeader) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!(await checkCronAuth(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authUser = await getAuthUser(req)
  if (authUser?.roleName === 'Empleado') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const triggeredBy = req.nextUrl.searchParams.get('trigger') === 'manual' ? 'manual' : 'cron'
  const fecha = req.nextUrl.searchParams.get('fecha') ?? undefined

  const config = await getRobotConfig(JOB)
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })

  const runId = await startRun(JOB, triggeredBy as 'cron' | 'manual')
  const t0 = Date.now()
  try {
    const result = await generateDailyTasks(fecha)
    await finishRun(runId, 'ok', result, Date.now() - t0)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e)
    await finishRun(runId, 'error', {}, Date.now() - t0, msg)
    console.error('[generate-tasks]', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
