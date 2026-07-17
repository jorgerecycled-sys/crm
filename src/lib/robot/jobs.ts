import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { inChunks } from '@/lib/supabase/chunked'

export async function generateDailyTasks(fecha?: string): Promise<Record<string, unknown>> {
  const today = fecha ?? new Date().toISOString().split('T')[0]

  const { data: allAccounts, error } = await supabase
    .from('ig_accounts')
    .select('id, username, employee, phoneRef, status')
    .not('phoneRef', 'is', null)
    .not('employee', 'is', null)
    .range(0, 1999)
  if (error) throw error

  // Skip accounts on a blocked (⛔) phone — no tasks should be generated for them
  const accounts = (allAccounts ?? []).filter(a => !(a.phoneRef ?? '').includes('⛔'))
  if (!accounts.length) return { generated: 0, fecha: today }

  // Group by phoneRef
  const phones = new Map<string, typeof accounts>()
  for (const acc of accounts) {
    if (!acc.phoneRef || !acc.employee) continue
    if (!phones.has(acc.phoneRef)) phones.set(acc.phoneRef, [])
    phones.get(acc.phoneRef)!.push(acc)
  }

  const tasks: Record<string, unknown>[] = []

  for (const [phoneRef, accs] of phones.entries()) {
    const activeAccs = accs.filter(a => ['active', 'shadow banned'].includes(a.status))

    // Primary employee = most common on this phone
    const empCount = new Map<string, number>()
    for (const a of accs) if (a.employee) empCount.set(a.employee, (empCount.get(a.employee) ?? 0) + 1)
    const primaryEmp = Array.from(empCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]

    // crear_cuenta task if < 3 active accounts
    if (activeAccs.length < 3 && primaryEmp) {
      const id = `${today}_${phoneRef.replace(/\s/g, '_')}_${primaryEmp.replace(/\s/g, '_')}_crear`
      tasks.push({ id, fecha: today, employeeId: primaryEmp, phoneRef, accountId: null, username: null, tipo: 'crear_cuenta', num: 1 })
    }

    // content tasks for each active account
    for (const acc of activeAccs) {
      if (!acc.employee) continue
      for (const tipo of ['reel', 'historia']) {
        for (const num of [1, 2]) {
          const id = `${today}_${acc.id}_${tipo}_${num}`
          tasks.push({ id, fecha: today, employeeId: acc.employee, phoneRef, accountId: acc.id, username: acc.username, tipo, num })
        }
      }
    }
  }

  if (tasks.length > 0) {
    // ignoreDuplicates: don't overwrite existing tasks (preserve done status)
    const { error: upErr } = await supabase
      .from('ig_daily_tasks')
      .upsert(tasks, { onConflict: 'id', ignoreDuplicates: true })
    if (upErr?.code === '42P01') throw new Error('Tabla ig_daily_tasks no existe. Ejecuta supabase/daily_tasks.sql')
    if (upErr) throw upErr
  }

  const employees = new Set(tasks.map(t => t.employeeId as string)).size
  return { generated: tasks.length, employees, phones: phones.size, fecha: today }
}

const FOLLOWER_THRESHOLD = parseInt(process.env.PERF_FOLLOWER_THRESHOLD ?? '200')
const WINDOW_DAYS        = parseInt(process.env.PERF_WINDOW_DAYS         ?? '10')
const VIEW_DROP_PCT      = parseFloat(process.env.PERF_VIEW_DROP_PCT     ?? '0.50')
const DEAD_THRESHOLD     = parseInt(process.env.DEAD_ACCOUNTS_THRESHOLD  ?? '2')
const DEAD_STATUSES      = ['suspended', 'retiring']

export async function runDetectPerformance(): Promise<Record<string, unknown>> {
  const today    = new Date()
  const cutoff   = new Date(today.getTime() - WINDOW_DAYS * 86400000).toISOString().split('T')[0]
  const cutoff30 = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0]
  const cutoff7  = new Date(today.getTime() -  7 * 86400000).toISOString().split('T')[0]

  const { data: accounts, error: acErr } = await supabase
    .from('ig_accounts').select('id, username, status').in('status', ['active', 'shadow banned']).range(0, 1999)
  if (acErr) throw acErr
  if (!accounts?.length) return { evaluated: 0, retiring: 0, accounts: [] }

  const ids = accounts.map(a => a.id)
  const meas = await inChunks(ids, (chunk) =>
    supabase
      .from('ig_measurements')
      .select('accountId, fecha, seguidores, reproduccionesTotal')
      .in('accountId', chunk).gte('fecha', cutoff30).order('fecha', { ascending: true })
      .range(0, 19999)
  )

  const byAccount = new Map<string, { fecha: string; seguidores: number | null; views: number | null }[]>()
  for (const m of meas) {
    if (!byAccount.has(m.accountId)) byAccount.set(m.accountId, [])
    byAccount.get(m.accountId)!.push({ fecha: m.fecha, seguidores: m.seguidores, views: m.reproduccionesTotal })
  }

  const toRetire: string[] = []
  const reasons: Record<string, string> = {}

  for (const acc of accounts) {
    const rows = byAccount.get(acc.id) ?? []
    const windowRows = rows.filter(r => r.fecha >= cutoff)
    let followerGain: number | null = null
    // Need at least 3 data points in the window to evaluate reliably
    if (windowRows.length >= 3) {
      const first = windowRows[0].seguidores, last = windowRows[windowRows.length - 1].seguidores
      if (first !== null && last !== null) followerGain = last - first
    }

    if (followerGain !== null && followerGain < FOLLOWER_THRESHOLD) {
      toRetire.push(acc.id)
      reasons[acc.id] = `+${followerGain} seg. en ${WINDOW_DAYS}d (mín ${FOLLOWER_THRESHOLD})`
      continue
    }
    const recent = rows.filter(r => r.fecha >= cutoff7 && r.views !== null)
    const older  = rows.filter(r => r.fecha >= cutoff30 && r.fecha < cutoff7 && r.views !== null)
    if (recent.length >= 3 && older.length >= 5) {
      const avgRecent = recent.reduce((s, r) => s + (r.views ?? 0), 0) / recent.length
      const avgOlder  = older.reduce((s, r) => s + (r.views ?? 0), 0)  / older.length
      if (avgOlder > 0 && avgRecent < avgOlder * VIEW_DROP_PCT) {
        toRetire.push(acc.id)
        reasons[acc.id] = `Vistas: ${Math.round(avgRecent)} vs ${Math.round(avgOlder)} (-${Math.round((1 - avgRecent / avgOlder) * 100)}%)`
      }
    }
  }

  if (toRetire.length > 0) {
    const { error } = await supabase.from('ig_accounts').update({ status: 'retiring' }).in('id', toRetire)
    if (error) throw error
  }

  return {
    evaluated: accounts.length,
    retiring:  toRetire.length,
    accounts:  toRetire.map(id => ({ id, username: accounts.find(a => a.id === id)?.username, reason: reasons[id] })),
    thresholds: { followerMin: FOLLOWER_THRESHOLD, windowDays: WINDOW_DAYS, viewDropPct: VIEW_DROP_PCT },
  }
}

export async function runDetectDevices(): Promise<Record<string, unknown>> {
  const { data: accounts, error: acErr } = await supabase
    .from('ig_accounts').select('id, username, status, phoneRef').not('phoneRef', 'is', null).range(0, 1999)
  if (acErr) throw acErr
  if (!accounts?.length) return { evaluated: 0, toChange: 0, alerts: [] }

  const phones = new Map<string, { total: number; dead: number; usernames: string[] }>()
  for (const acc of accounts) {
    const ref = acc.phoneRef as string
    if (!ref) continue
    if (!phones.has(ref)) phones.set(ref, { total: 0, dead: 0, usernames: [] })
    const g = phones.get(ref)!
    g.total++
    g.usernames.push(acc.username)
    if (DEAD_STATUSES.includes(acc.status)) g.dead++
  }

  const upserts = Array.from(phones.entries()).map(([phoneRef, stats]) => {
    const needsChange = stats.dead >= DEAD_THRESHOLD
    return {
      phoneRef,
      status:     needsChange ? 'cambiar' : 'ok',
      deadCount:  stats.dead,
      reason:     needsChange ? `${stats.dead} cuenta(s) muerta(s) de ${stats.total}` : null,
      detectedAt: new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    }
  })

  const { error: upErr } = await supabase
    .from('ig_phone_alerts')
    .upsert(upserts, { onConflict: 'phoneRef', ignoreDuplicates: false })
  if (upErr?.code === '42P01') throw new Error('Tabla ig_phone_alerts no existe. Ejecuta supabase/phone_alerts_financial.sql')
  if (upErr) throw upErr

  const toChange = upserts.filter(u => u.status === 'cambiar')
  return { evaluated: phones.size, toChange: toChange.length, alerts: toChange, threshold: DEAD_THRESHOLD }
}

const NEW_ACCOUNT_DAYS      = parseInt(process.env.NEW_ACCOUNT_DAYS      ?? '10')
const NEW_ENGAGE_THRESHOLD  = parseFloat(process.env.NEW_ENGAGE_THRESHOLD ?? '1.0')

export async function promoteNewAccounts(): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - NEW_ACCOUNT_DAYS * 86400000).toISOString()

  // Accounts in 'new' status older than NEW_ACCOUNT_DAYS days
  const { data: accounts, error: acErr } = await supabase
    .from('ig_accounts')
    .select('id, username, createdAt')
    .eq('status', 'new')
    .lt('createdAt', cutoff)
    .range(0, 999)
  if (acErr) throw acErr
  if (!accounts?.length) return { evaluated: 0, promoted: 0, alerted: 0 }

  // Admin user to attribute system-generated incidents
  const { data: adminUser } = await supabase
    .from('erp_users')
    .select('id')
    .or('email.eq.desarrollo@ywen.es,email.eq.admin@admin.com')
    .limit(1)
    .maybeSingle()
  const reportedById = adminUser?.id

  // Measurements in the window for engagement calculation
  const measCutoff = new Date(Date.now() - NEW_ACCOUNT_DAYS * 86400000).toISOString().split('T')[0]
  const ids = accounts.map(a => a.id)
  const meas = await inChunks(ids, (chunk) =>
    supabase
      .from('ig_measurements')
      .select('accountId, seguidores, likesDia, comentariosDia')
      .in('accountId', chunk)
      .gte('fecha', measCutoff)
      .range(0, 9999)
  )

  const byAccount = new Map<string, { seguidores: number | null; likesDia: number | null; comentariosDia: number | null }[]>()
  for (const m of meas) {
    if (!byAccount.has(m.accountId)) byAccount.set(m.accountId, [])
    byAccount.get(m.accountId)!.push({ seguidores: m.seguidores, likesDia: m.likesDia, comentariosDia: m.comentariosDia })
  }

  let promoted = 0, alerted = 0
  const details: { username: string; action: string; engagement: string }[] = []

  for (const acc of accounts) {
    const rows = byAccount.get(acc.id) ?? []
    let badEngagement = false
    let engStr = 'sin datos'

    if (rows.length > 0) {
      const latest = rows[rows.length - 1]
      const followers = latest.seguidores ?? 0
      if (followers > 0) {
        const avgLikes    = rows.reduce((s, r) => s + (r.likesDia    ?? 0), 0) / rows.length
        const avgComments = rows.reduce((s, r) => s + (r.comentariosDia ?? 0), 0) / rows.length
        const eng = ((avgLikes + avgComments) / followers) * 100
        engStr = `${eng.toFixed(2)}%`
        badEngagement = eng < NEW_ENGAGE_THRESHOLD
      }
    }

    if (badEngagement && reportedById) {
      await supabase.from('incidents').insert({
        id: uuidv4(),
        title: `Engagement bajo: @${acc.username}`,
        description: `La cuenta @${acc.username} lleva ${NEW_ACCOUNT_DAYS}+ días en estado "nueva" con engagement de ${engStr} (mínimo recomendado: ${NEW_ENGAGE_THRESHOLD}%). La cuenta ha sido activada automáticamente. Revisar si debe continuar activa o retirarse.`,
        category: 'TECHNICAL',
        priority: 'HIGH',
        reportedById,
      })
      alerted++
    }

    // Always promote after NEW_ACCOUNT_DAYS — admin notified above if bad
    await supabase.from('ig_accounts').update({ status: 'active' }).eq('id', acc.id)
    promoted++
    details.push({ username: acc.username, action: badEngagement ? 'promoted+alert' : 'promoted', engagement: engStr })
  }

  return { evaluated: accounts.length, promoted, alerted, accounts: details, threshold: NEW_ENGAGE_THRESHOLD, days: NEW_ACCOUNT_DAYS }
}

const POOL_EXPIRE_DAYS   = parseInt(process.env.POOL_EXPIRE_DAYS   ?? '3')
const POOL_PROMOTE_GAIN  = parseInt(process.env.POOL_PROMOTE_GAIN  ?? '100')

export async function evaluatePoolAccounts(): Promise<Record<string, unknown>> {
  const { data: accounts, error: acErr } = await supabase
    .from('ig_accounts')
    .select('id, username, pool, status, poolAssignedAt, poolAssignedFollowers')
    .not('pool', 'is', null)
    .eq('status', 'pool_assigned')
    .range(0, 999)
  if (acErr?.code === '42703') return { evaluated: 0, promoted: 0, expired: 0, info: 'Columnas de pool no creadas aún. Ejecuta supabase/ig_pool_accounts.sql' }
  if (acErr) throw acErr
  if (!accounts?.length) return { evaluated: 0, promoted: 0, expired: 0, accounts: [] }

  const ids = accounts.map(a => a.id)
  const latestMeas = await inChunks(ids, (chunk) =>
    supabase
      .from('ig_measurements')
      .select('accountId, fecha, seguidores')
      .in('accountId', chunk)
      .order('fecha', { ascending: false })
      .range(0, 9999)
  )

  const latestByAccount = new Map<string, number | null>()
  for (const m of latestMeas) {
    if (!latestByAccount.has(m.accountId)) latestByAccount.set(m.accountId, m.seguidores)
  }

  let promoted = 0, expired = 0
  const details: { username: string; action: string; gain: number | null }[] = []
  const now = Date.now()

  for (const acc of accounts) {
    const latest = latestByAccount.get(acc.id) ?? null
    const base = acc.poolAssignedFollowers
    const gain = latest !== null && base !== null ? latest - base : null

    if (gain !== null && gain >= POOL_PROMOTE_GAIN) {
      await supabase.from('ig_accounts').update({ pool: null, status: 'active' }).eq('id', acc.id)
      promoted++
      details.push({ username: acc.username, action: 'promoted', gain })
      continue
    }

    const assignedAt = acc.poolAssignedAt ? new Date(acc.poolAssignedAt).getTime() : null
    const daysAssigned = assignedAt ? (now - assignedAt) / 86400000 : 0
    if (assignedAt && daysAssigned > POOL_EXPIRE_DAYS) {
      await supabase.from('ig_accounts').update({ status: 'pool_expired' }).eq('id', acc.id)
      expired++
      details.push({ username: acc.username, action: 'expired', gain })
    }
  }

  return { evaluated: accounts.length, promoted, expired, accounts: details, promoteGain: POOL_PROMOTE_GAIN, expireDays: POOL_EXPIRE_DAYS }
}

const REELS_REQUIRED = parseInt(process.env.REELS_REQUIRED ?? '2')

export async function runReelCompliance(fecha?: string): Promise<Record<string, unknown>> {
  const day = fecha ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const { data: accounts, error: acErr } = await supabase
    .from('ig_accounts')
    .select('id, username, employee, phoneRef, model')
    .in('status', ['active', 'shadow banned'])
    .range(0, 1999)
  if (acErr) throw acErr
  if (!accounts?.length) return { fecha: day, evaluated: 0, compliant: 0, missing: 0, details: [] }

  const ids = accounts.map(a => a.id)
  const posts = await inChunks(ids, (chunk) =>
    supabase
      .from('ig_posts')
      .select('accountId')
      .eq('tipo', 'Reel')
      .eq('fechaPub', day)
      .in('accountId', chunk)
      .range(0, 9999)
  )

  const reelCounts = new Map<string, number>()
  for (const p of posts) reelCounts.set(p.accountId, (reelCounts.get(p.accountId) ?? 0) + 1)

  const details = accounts.map(acc => ({
    username:  acc.username,
    employee:  acc.employee ?? null,
    phoneRef:  acc.phoneRef ?? null,
    model:     acc.model    ?? null,
    reels:     reelCounts.get(acc.id) ?? 0,
  }))

  const missing = details.filter(d => d.reels < REELS_REQUIRED)

  if (missing.length > 0) {
    const { data: adminUser } = await supabase
      .from('erp_users').select('id')
      .or('email.eq.desarrollo@ywen.es,email.eq.admin@admin.com')
      .limit(1).maybeSingle()

    if (adminUser?.id) {
      const lines = missing.map(m =>
        `• @${m.username} — ${m.reels}/${REELS_REQUIRED} reels${m.employee ? ` (${m.employee})` : ''}${m.phoneRef ? ` [${m.phoneRef}]` : ''}`
      )
      await supabase.from('incidents').insert({
        id: uuidv4(),
        title: `Reels pendientes: ${missing.length} cuenta(s) — ${day}`,
        description: `📊 Informe de reels del ${day}:\n\n${lines.join('\n')}\n\n${details.length - missing.length} cuenta(s) subieron los ${REELS_REQUIRED} reels correctamente.`,
        category: 'TECHNICAL',
        priority: missing.length > 5 ? 'HIGH' : 'MEDIUM',
        reportedById: adminUser.id,
      })
    }
  }

  return { fecha: day, evaluated: details.length, compliant: details.length - missing.length, missing: missing.length, details, required: REELS_REQUIRED }
}
