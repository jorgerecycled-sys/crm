import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'
import { promoteNewAccounts, runReelCompliance, evaluatePoolAccounts } from '@/lib/robot/jobs'

export const maxDuration = 290

const RAPIDAPI_KEY = (process.env.RAPIDAPI_KEY ?? '').replace(/^﻿/, '').replace(/[^\x20-\x7E]/g, '').trim()
const RAPIDAPI_HOST = 'instagram-looter2.p.rapidapi.com'
const CONCURRENCY = 6

type Obj = Record<string, unknown>

function getApiError(o: unknown): string | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Obj
  if (r.status === false && typeof r.errorMessage === 'string') return r.errorMessage
  return null
}

function findUserNode(o: unknown, depth = 0): Obj | null {
  if (!o || typeof o !== 'object' || depth > 4) return null
  const r = o as Obj
  if (typeof r.follower_count === 'number' || typeof r.edge_followed_by === 'object') return r
  for (const key of ['user', 'data', 'graphql']) {
    if (r[key]) { const n = findUserNode(r[key], depth + 1); if (n) return n }
  }
  if (depth === 0) {
    for (const v of Object.values(r)) {
      if (v && typeof v === 'object') { const n = findUserNode(v, depth + 1); if (n) return n }
    }
  }
  return null
}

function num(o: Obj, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number' && v > 0) return v
    if (v && typeof v === 'object' && typeof (v as Obj).count === 'number') return (v as Obj).count as number
  }
  return null
}

function strId(o: Obj): string | null {
  for (const k of ['pk', 'id', 'user_id', 'pk_id']) {
    if (typeof o[k] === 'string' && o[k]) return o[k] as string
    if (typeof o[k] === 'number' && o[k]) return String(o[k])
  }
  return null
}

let _loggedFirst = false
async function fetchProfile(username: string) {
  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/profile?username=${encodeURIComponent(username)}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }, signal: AbortSignal.timeout(15000) }
    )
    const text = await res.text()
    if (!res.ok) {
      if (!_loggedFirst) { _loggedFirst = true; console.error('[ig-sync] HTTP', res.status, 'for', username, '→', text.slice(0, 200)) }
      return { followers: null, following: null, igId: null, errorMsg: `HTTP ${res.status}` }
    }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch {
      if (!_loggedFirst) { _loggedFirst = true; console.error('[ig-sync] bad JSON for', username, '→', text.slice(0, 200)) }
      return { followers: null, following: null, igId: null, errorMsg: 'bad JSON' }
    }
    const apiErr = getApiError(parsed)
    if (apiErr) {
      if (!_loggedFirst) { _loggedFirst = true; console.error('[ig-sync] API error for', username, '→', apiErr) }
      return { followers: null, following: null, igId: null, errorMsg: apiErr }
    }
    const node = findUserNode(parsed)
    if (!node) {
      if (!_loggedFirst) { _loggedFirst = true; console.error('[ig-sync] no user node for', username, '→', text.slice(0, 300)) }
      return { followers: null, following: null, igId: null, errorMsg: 'no user node' }
    }
    const followers = num(node, 'follower_count', 'edge_followed_by')
    const following = num(node, 'following_count', 'edge_follow')
    const igId = strId(node)
    if (followers === null) {
      if (!_loggedFirst) { _loggedFirst = true; console.error('[ig-sync] no followers for', username, '→ node keys:', Object.keys(node as object).join(',')) }
      return { followers: null, following: null, igId: null, errorMsg: 'no follower_count' }
    }
    return { followers, following, igId, errorMsg: undefined }
  } catch (e) {
    return { followers: null, following: null, igId: null, errorMsg: e instanceof Error ? e.message : 'timeout' }
  }
}

async function fetchFeedStats(igId: string, today: string) {
  const empty = { reproduccionesTotal: null, postsHoy: null, reelsHoy: null, likesDia: null, comentariosDia: null, items: [] as Obj[] }
  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/user-feeds?id=${encodeURIComponent(igId)}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }, signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return empty
    const data = await res.json() as Obj
    const items: Obj[] = (data?.items ?? (data?.data as Obj)?.items ?? (data?.feed as Obj)?.items ?? []) as Obj[]
    if (!items.length) return empty

    let totalPlays = 0, ph = 0, rh = 0, ld = 0, cd = 0
    for (const item of items) {
      const plays = (item.play_count ?? item.view_count ?? 0) as number
      totalPlays += plays
      const ts = (item.taken_at ?? item.taken_at_timestamp) as number | undefined
      const d = ts ? new Date(ts * 1000).toISOString().split('T')[0] : null
      if (d === today) {
        ph++
        if (item.media_type === 2) rh++
        ld += (item.like_count ?? 0) as number
        cd += (item.comment_count ?? 0) as number
      }
    }
    return {
      reproduccionesTotal: totalPlays || null,
      postsHoy: ph || null,
      reelsHoy: rh || null,
      likesDia: ph ? ld : null,
      comentariosDia: ph ? cd : null,
      items,
    }
  } catch { return empty }
}

async function parallel<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < tasks.length; i += n) {
    const batch = await Promise.all(tasks.slice(i, i + n).map((t) => t()))
    results.push(...batch)
  }
  return results
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const today = new Date().toISOString().split('T')[0]

    // Count accounts by status
    const { data: allAccounts } = await supabase
      .from('ig_accounts').select('id, username, status').range(0, 1999)

    const byStatus: Record<string, number> = {}
    for (const a of allAccounts ?? []) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
    }

    const syncable = (allAccounts ?? []).filter(a => ['active', 'new', 'shadow banned', 'pool_assigned'].includes(a.status))

    // Check which already have data today
    const { data: todayMeas } = syncable.length > 0
      ? await supabase.from('ig_measurements').select('accountId').eq('fecha', today).in('accountId', syncable.map(a => a.id))
      : { data: [] }

    const doneToday = new Set((todayMeas ?? []).map(m => m.accountId))
    const pending = syncable.filter(a => !doneToday.has(a.id))

    return NextResponse.json({
      ok: true,
      rapidApiKey: RAPIDAPI_KEY ? `configurada (${RAPIDAPI_KEY.slice(0, 6)}...)` : 'NO CONFIGURADA ⚠️',
      today,
      totalAccounts: allAccounts?.length ?? 0,
      byStatus,
      syncableStatuses: ['active', 'new', 'shadow banned'],
      syncable: syncable.length,
      alreadySyncedToday: doneToday.size,
      pendingSync: pending.length,
      pendingList: pending.slice(0, 20).map(a => ({ username: a.username, status: a.status })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Allow cron/robot trigger calls authenticated with CRON_SECRET (or empty if not configured)
  const cronSecret = process.env.CRON_SECRET ?? ''
  const authHeader = req.headers.get('authorization') ?? ''
  const isCron = authHeader.trim() === `Bearer ${cronSecret}`.trim()
  if (!isCron) {
    try {
      await requireAuth(req)
    } catch (e) {
      return handleApiError(e)
    }
  }

  try {
    if (!RAPIDAPI_KEY) {
      return NextResponse.json({ ok: false, error: 'RAPIDAPI_KEY no configurada' }, { status: 500 })
    }

    let force = false
    let accountId: string | undefined
    try {
      const body = (await req.json()) as Obj
      force = body?.force === true
      accountId = body?.accountId as string | undefined
    } catch { /* empty body */ }

    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    let accountsQuery = supabase
      .from('ig_accounts')
      .select('*')
      .in('status', ['active', 'new', 'shadow banned', 'pool_assigned'])
      .range(0, 1999)
    if (accountId) {
      accountsQuery = supabase.from('ig_accounts').select('*').eq('id', accountId)
    }
    const { data: allAccounts, error: accountsError } = await accountsQuery
    if (accountsError) throw accountsError

    let pending = allAccounts ?? []

    if (!force) {
      const { data: todayMeas, error: todayMeasError } = await supabase
        .from('ig_measurements')
        .select('accountId')
        .eq('fecha', today)
        .in('accountId', (allAccounts ?? []).map((a) => a.id))
      if (todayMeasError) throw todayMeasError
      const done = new Set((todayMeas ?? []).map((m) => m.accountId))
      pending = pending.filter((a) => !done.has(a.id))
    }

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, procesadas: 0, errores: 0, info: 'Todas las cuentas ya tienen datos de hoy.' })
    }

    const { data: yMeasData, error: yMeasError } = await supabase
      .from('ig_measurements')
      .select('accountId, seguidores')
      .eq('fecha', yesterday)
      .in('accountId', pending.map((a) => a.id))
    if (yMeasError) throw yMeasError
    const yMap = new Map<string, number>()
    for (const m of yMeasData ?? []) if (m.seguidores !== null) yMap.set(m.accountId, m.seguidores)

    let procesadas = 0, errores = 0
    const log: { username: string; status: string; followers?: number; error?: string }[] = []

    async function processOne(account: { id: string; username: string }) {
      let { followers, following, igId, errorMsg } = await fetchProfile(account.username)

      // Transient timeouts against RapidAPI are common under load — retry once before giving up
      if (followers === null && errorMsg && /timeout|aborted/i.test(errorMsg)) {
        ;({ followers, following, igId, errorMsg } = await fetchProfile(account.username))
      }

      if (followers === null) {
        const detail = errorMsg ?? 'sin datos'
        const isGone = errorMsg && (errorMsg.includes('does not exist') || errorMsg.includes('not exist'))
        const isRestricted = errorMsg && errorMsg.toLowerCase().includes('restricted')
        if (isGone || isRestricted) {
          await supabase.from('ig_accounts').update({ status: 'suspended' }).eq('id', account.id)
          log.push({ username: account.username, status: 'suspended', error: detail })
        } else {
          errores++
          log.push({ username: account.username, status: 'error', error: detail })
          console.error('[ig-sync] error:', `@${account.username}: ${detail}`)
        }
        return
      }

      if (igId) {
        const { error: igIdError } = await supabase
          .from('ig_accounts')
          .update({ igId })
          .eq('id', account.id)
        if (igIdError) throw igIdError
      }

      const prev = yMap.get(account.id)
      const seguidoresGanados = prev !== undefined ? followers - prev : null

      const feed = igId ? await fetchFeedStats(igId, today) : { reproduccionesTotal: null, postsHoy: null, reelsHoy: null, likesDia: null, comentariosDia: null, items: [] as Obj[] }

      const { error: upsertMeasError } = await supabase
        .from('ig_measurements')
        .upsert(
          {
            id: `${account.id}_${today}`,
            accountId: account.id, fecha: today,
            seguidores: followers, siguiendo: following, seguidoresGanados,
            reproduccionesTotal: feed.reproduccionesTotal,
            postsHoy: feed.postsHoy, reelsHoy: feed.reelsHoy,
            likesDia: feed.likesDia, comentariosDia: feed.comentariosDia,
          },
          { onConflict: 'accountId,fecha', ignoreDuplicates: false }
        )
      if (upsertMeasError) throw upsertMeasError

      for (const item of feed.items) {
        const shortcode = (item.shortcode ?? item.code ?? item.pk ?? String(item.id ?? '')) as string
        if (!shortcode) continue
        const tipo = item.media_type === 2 ? 'Reel' : item.media_type === 1 ? 'Imagen' : 'Carrusel'
        const ts = (item.taken_at ?? item.taken_at_timestamp) as number | undefined
        const fechaPub = ts ? new Date(ts * 1000).toISOString().split('T')[0] : null
        const postData = {
          id: `${account.id}_${shortcode}`,
          accountId: account.id, shortcode, tipo, fechaPub,
          visitas: (item.play_count ?? item.view_count ?? null) as number | null,
          likes: (item.like_count ?? null) as number | null,
          comentarios: (item.comment_count ?? null) as number | null,
        }
        const { error: upsertPostError } = await supabase
          .from('ig_posts')
          .upsert(
            postData,
            { onConflict: 'accountId,shortcode', ignoreDuplicates: false }
          )
        if (upsertPostError) throw upsertPostError
      }

      log.push({ username: account.username, status: 'ok', followers: followers ?? undefined })
      procesadas++
    }

    await parallel(pending.map((a) => () => processOne(a)), CONCURRENCY)

    // Auto-promote 'new' accounts older than threshold days
    let promotions: Record<string, unknown> = {}
    try { promotions = await promoteNewAccounts() }
    catch (e) { console.error('[ig-sync] promoteNewAccounts error:', e) }

    // Evaluate pool accounts: promote if they gained enough followers, expire if the deadline passed
    let poolEvaluation: Record<string, unknown> = {}
    try { poolEvaluation = await evaluatePoolAccounts() }
    catch (e) { console.error('[ig-sync] evaluatePoolAccounts error:', e) }

    // Reel compliance report for yesterday (only when sync ran as cron, not single-account)
    let reelCompliance: Record<string, unknown> = {}
    if (!accountId) {
      try { reelCompliance = await runReelCompliance() }
      catch (e) { console.error('[ig-sync] reelCompliance error:', e) }
    }

    return NextResponse.json({
      ok: true, procesadas, errores, total: pending.length,
      log: log.slice(0, 100),
      errorDetails: log.filter(l => l.status === 'error').map(l => `@${l.username}: ${l.error}`).slice(0, 20),
      promotions, reelCompliance, poolEvaluation,
    })
  } catch (e) {
    console.error('[ig-sync]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
