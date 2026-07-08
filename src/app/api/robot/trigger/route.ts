import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'
import { startRun, finishRun } from '@/lib/robot/logger'
import { runDetectPerformance, runDetectDevices, promoteNewAccounts, runReelCompliance } from '@/lib/robot/jobs'

async function runIgSyncJob(force = false): Promise<Record<string, unknown>> {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    `localhost:${process.env.PORT ?? 3000}`
  const baseUrl = host.startsWith('http') ? host : `https://${host}`
  const cronSecret = process.env.CRON_SECRET ?? ''
  const res = await fetch(`${baseUrl}/api/crm/instagram/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cronSecret}` },
    body: JSON.stringify({ force }),
    signal: AbortSignal.timeout(270_000),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`))
  return { procesadas: data.procesadas ?? 0, errores: data.errores ?? 0, total: data.total ?? 0 }
}

const JOBS: Record<string, () => Promise<Record<string, unknown>>> = {
  'detect-performance':   runDetectPerformance,
  'detect-devices':       runDetectDevices,
  'ig-sync':              runIgSyncJob,
  'promote-new-accounts': promoteNewAccounts,
  'reel-compliance':      runReelCompliance,
}

export async function POST(req: NextRequest) {
  try { await requireAuth(req) } catch (e) { return handleApiError(e) }

  try {
    const { job, force } = await req.json() as { job: string; force?: boolean }
    const fn = job === 'ig-sync' ? () => runIgSyncJob(force === true) : JOBS[job]
    if (!fn) return NextResponse.json({ error: `Job desconocido: ${job}` }, { status: 400 })

    const runId = await startRun(job, 'manual')
    const t0 = Date.now()
    try {
      const result = await fn()
      await finishRun(runId, 'ok', result, Date.now() - t0)
      return NextResponse.json({ ok: true, runId, ...result })
    } catch (e) {
      const msg = String(e)
      await finishRun(runId, 'error', {}, Date.now() - t0, msg)
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
