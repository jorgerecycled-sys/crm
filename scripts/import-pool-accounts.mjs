// Run with: node scripts/import-pool-accounts.mjs
// One-time migration: pull every record from Airtable's "JailBreak IG Accs" and
// "Pool Accounts" tables into ig_accounts (pool='jailbreak' / pool='pool').
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY
const BASE = 'appKHrDqD3EeoW0u7'
const TABLES = {
  jailbreak: { id: 'tblWlDxKNsvnkFexk', pool: 'jailbreak', label: 'JailBreak IG Accs' },
  pool:      { id: 'tblVTUd1qeZMzmMkw', pool: 'pool',      label: 'Pool Accounts' },
}
const EMPLOYEES_TABLE = 'tblvKGpC8cwpku1w5'
const MODELS_TABLE = 'tblvXdzTqFzM7xLPg'
const PHONES_TABLE = 'tblQOorPwhiiR0ElP'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

async function fetchAllRecords(tableId, fields) {
  const records = []
  let offset
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${tableId}`)
    url.searchParams.set('pageSize', '100')
    for (const f of fields) url.searchParams.append('fields[]', f)
    if (offset) url.searchParams.set('offset', offset)
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` } })
    if (!r.ok) throw new Error(`Airtable fetch ${tableId} failed: ${r.status} ${await r.text()}`)
    const d = await r.json()
    records.push(...(d.records ?? []))
    offset = d.offset
  } while (offset)
  return records
}

console.log('Fetching lookup tables (Employees, Models, Phones)...')
const [employeeRecs, modelRecs, phoneRecs] = await Promise.all([
  fetchAllRecords(EMPLOYEES_TABLE, ['Name']),
  fetchAllRecords(MODELS_TABLE, ['Name']),
  fetchAllRecords(PHONES_TABLE, ['Phone']),
])
const employeeMap = new Map(employeeRecs.map(r => [r.id, (r.fields.Name ?? '').trim()]))
const modelMap = new Map(modelRecs.map(r => [r.id, (r.fields.Name ?? '').trim()]))
const phoneMap = new Map(phoneRecs.map(r => [r.id, (r.fields.Phone ?? '').trim()]))
console.log(`  ${employeeMap.size} employees, ${modelMap.size} models, ${phoneMap.size} phones`)

console.log('Fetching erp_users (to match employee names to real accounts)...')
const { data: erpUsers, error: erpErr } = await supabase.from('erp_users').select('id, firstName, lastName').is('deletedAt', null)
if (erpErr) throw erpErr
const erpUserMap = new Map((erpUsers ?? []).map(u => [`${u.firstName} ${u.lastName}`.trim().toLowerCase(), u.id]))
console.log(`  ${erpUserMap.size} erp_users`)

console.log('Fetching existing ig_accounts usernames (dedupe)...')
const existingUsernames = new Set()
{
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase.from('ig_accounts').select('username').range(from, from + pageSize - 1)
    if (error) throw error
    for (const r of data ?? []) existingUsernames.add(r.username)
    if (!data || data.length < pageSize) break
    from += pageSize
  }
}
console.log(`  ${existingUsernames.size} existing usernames`)

const BASE_FIELDS = ['User Name', 'IG Password', 'FA', 'Model', 'Empleados & Movil', 'Employees', 'Status', 'Notes']
const EXTRA_FIELDS = { jailbreak: [], pool: ['Used '] }

const summary = {}

for (const [key, table] of Object.entries(TABLES)) {
  console.log(`\nFetching ${table.label}...`)
  const records = await fetchAllRecords(table.id, [...BASE_FIELDS, ...EXTRA_FIELDS[key]])
  console.log(`  ${records.length} records total`)

  const rows = []
  let noUsername = 0, duplicate = 0
  const statusCounts = { pool_available: 0, pool_assigned: 0, pool_expired: 0 }

  for (const rec of records) {
    const f = rec.fields
    const rawUsername = (f['User Name'] ?? '').trim()
    if (!rawUsername) { noUsername++; continue }
    const username = rawUsername.replace(/^@/, '').toLowerCase()
    if (existingUsernames.has(username)) { duplicate++; continue }
    existingUsernames.add(username) // guard against dupes between the two pool tables too

    const modelId = (f['Model'] ?? [])[0]
    const model = modelId ? (modelMap.get(modelId) || null) : null
    const phoneId = (f['Empleados & Movil'] ?? [])[0]
    const phoneRef = phoneId ? (phoneMap.get(phoneId) || null) : null
    const empId = (f['Employees'] ?? [])[0]
    const employeeName = empId ? (employeeMap.get(empId) || null) : null
    const employeeId = employeeName ? (erpUserMap.get(employeeName.toLowerCase()) ?? null) : null

    const statusArr = f['Status'] ?? []
    const isSuspended = statusArr.includes('Suspended')
    const used = f['Used '] === true

    let status
    if (isSuspended) status = 'pool_expired'
    else if (employeeName || phoneRef || used) status = 'pool_assigned'
    else status = 'pool_available'
    statusCounts[status]++

    rows.push({
      id: randomUUID(),
      username,
      igPassword: f['IG Password'] || null,
      fa2: f['FA'] || null,
      model,
      employee: employeeName,
      employeeId,
      phoneRef,
      notes: f['Notes'] || null,
      status,
      pool: table.pool,
      poolAssignedAt: status !== 'pool_available' ? rec.createdTime : null,
      poolAssignedFollowers: status !== 'pool_available' ? 0 : null,
      createdAt: rec.createdTime,
    })
  }

  console.log(`  → ${rows.length} to insert (${noUsername} sin username, ${duplicate} ya existían)`)
  console.log(`  estados: disponibles=${statusCounts.pool_available} asignadas=${statusCounts.pool_assigned} expiradas=${statusCounts.pool_expired}`)

  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('ig_accounts').insert(chunk)
    if (error) { console.error(`  Error inserting chunk ${i}-${i + chunk.length}:`, error.message); continue }
    inserted += chunk.length
  }
  console.log(`  ✓ ${inserted} insertadas en Supabase`)

  summary[key] = { fetched: records.length, noUsername, duplicate, inserted, statusCounts }
}

console.log('\n=== Resumen ===')
console.log(JSON.stringify(summary, null, 2))
