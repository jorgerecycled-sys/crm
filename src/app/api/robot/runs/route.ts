import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try { await requireAuth(req) } catch (e) { return handleApiError(e) }

  const { searchParams } = new URL(req.url)
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)
  const jobName = searchParams.get('job') ?? null
  const days    = parseInt(searchParams.get('days') ?? '14')
  const since   = new Date(Date.now() - days * 86400000).toISOString()

  let q = supabase
    .from('robot_runs')
    .select('*')
    .gte('startedAt', since)
    .neq('status', 'running')
    .order('startedAt', { ascending: false })
    .limit(limit)

  if (jobName) q = q.eq('jobName', jobName)

  const { data, error } = await q

  if (error?.code === '42P01') return NextResponse.json({ runs: [], missing: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
}
