// Run with: node scripts/sync-missing-airtable.mjs
// One-time backfill: pull every record from Airtable's "Phones" and
// "Instagram Accounts" tables and insert whichever ones aren't in Supabase
// yet (by phoneRef / username). Existing rows are left untouched — the live
// webhook (src/lib/airtable/sync.ts) keeps those in sync going forward, and
// this script must not clobber status/assignments the CRM itself has since
// changed (promotions, deactivations, retiring, etc).
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
  phones: 'tblQOorPwhiiR0ElP',
  employees: 'tblvKGpC8cwpku1w5',
  models: 'tblvXdzTqFzM7xLPg',
  accounts: 'tbljVf7pisgGhvQVb',
}

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

function mapAccountStatus(raw) {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('not work') || s === 'suspended') return 'suspended'
  if (s.includes('requires attention')) return 'shadow banned'
  if (s === 'active') return 'active'
  if (s === 'new') return 'new'
  if (s === 'unused') return 'unused'
  return 'active'
}

console.log('Fetching lookup tables (Employees, Models, Phones names)...')
const [employeeRecs, modelRecs, phoneNameRecs] = await Promise.all([
  fetchAllRecords(TABLES.employees, ['Name']),
  fetchAllRecords(TABLES.models, ['Name']),
  fetchAllRecords(TABLES.phones, ['Phone']),
])
const employeeMap = new Map(employeeRecs.map(r => [r.id, (r.fields.Name ?? '').trim()]))
const modelMap = new Map(modelRecs.map(r => [r.id, (r.fields.Name ?? '').trim()]))
const phoneRefMap = new Map(phoneNameRecs.map(r => [r.id, (r.fields.Phone ?? '').trim()]))
console.log(`  ${employeeMap.size} employees, ${modelMap.size} models, ${phoneRefMap.size} phones`)

const { data: erpUsers, error: erpErr } = await supabase.from('erp_users').select('id, firstName, lastName').is('deletedAt', null)
if (erpErr) throw erpErr
const erpUserMap = new Map((erpUsers ?? []).map(u => [`${u.firstName} ${u.lastName}`.trim().toLowerCase(), u.id]))

// ── Phones ──────────────────────────────────────────────────────────────────
console.log('\nFetching Phones (full)...')
const PHONE_FIELDS = ['Phone', 'GMail User', 'GMail Password', 'Apple ID', 'Apple ID Password', 'Apple ID Phone Used', 'Link->Phone', 'Employee', 'Name (from Models)', 'Niche', 'Grupo']
const phoneRecords = await fetchAllRecords(TABLES.phones, PHONE_FIELDS)
console.log(`  ${phoneRecords.length} records in Airtable`)

const { data: existingPhonesData, error: existingPhonesErr } = await supabase.from('ig_phones').select('phoneRef')
if (existingPhonesErr) throw existingPhonesErr
const existingPhoneRefs = new Set((existingPhonesData ?? []).map(p => p.phoneRef))
console.log(`  ${existingPhoneRefs.size} already in Supabase`)

const newPhoneRows = []
let phoneNoRef = 0
for (const rec of phoneRecords) {
  const f = rec.fields
  const phoneRef = (f['Phone'] || '').trim()
  if (!phoneRef) { phoneNoRef++; continue }
  if (existingPhoneRefs.has(phoneRef)) continue
  const empId = (f['Employee'] || [])[0]
  const employee = empId ? (employeeMap.get(empId) || null) : null
  newPhoneRows.push({
    phoneRef,
    gmailUser: (f['GMail User'] || '').trim() || null,
    gmailPassword: (f['GMail Password'] || '').trim() || null,
    appleId: (f['Apple ID'] || '').trim() || null,
    appleIdPassword: (f['Apple ID Password'] || '').trim() || null,
    appleIdPhone: (f['Apple ID Phone Used'] || '').trim() || null,
    remoteLink: (f['Link->Phone'] || '').trim() || null,
    employee,
    model: ((f['Name (from Models)'] || [])[0] || '').trim() || null,
    niche: (f['Niche'] || '').trim() || null,
    grupo: (f['Grupo'] || '').trim() || null,
    updatedAt: new Date().toISOString(),
  })
}
console.log(`  → ${newPhoneRows.length} nuevos (${phoneNoRef} sin Phone, ${phoneRecords.length - phoneNoRef - newPhoneRows.length} ya existían)`)

let phonesInserted = 0
for (let i = 0; i < newPhoneRows.length; i += 200) {
  const chunk = newPhoneRows.slice(i, i + 200)
  const { error } = await supabase.from('ig_phones').insert(chunk)
  if (error) { console.error('  Error insertando phones chunk:', error.message); continue }
  phonesInserted += chunk.length
}
console.log(`  ✓ ${phonesInserted} phones insertados`)

// ── Instagram Accounts ───────────────────────────────────────────────────────
console.log('\nFetching Instagram Accounts (full)...')
const ACCOUNT_FIELDS = ['User Name', 'Employees', 'Model', 'Empleados & Movil', 'Status', 'Niche', 'Group', 'IG Password', 'Email Details', 'FA']
const accountRecords = await fetchAllRecords(TABLES.accounts, ACCOUNT_FIELDS)
console.log(`  ${accountRecords.length} records in Airtable`)

const existingUsernames = new Set()
{
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('ig_accounts').select('username').range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) existingUsernames.add(r.username)
    if (!data || data.length < 1000) break
    from += 1000
  }
}
console.log(`  ${existingUsernames.size} already in Supabase`)

const newAccountRows = []
let accNoUsername = 0
for (const rec of accountRecords) {
  const f = rec.fields
  const rawUsername = (f['User Name'] || '').trim()
  if (!rawUsername) { accNoUsername++; continue }
  const username = rawUsername.replace(/^@/, '').toLowerCase()
  if (existingUsernames.has(username)) continue
  existingUsernames.add(username)

  const empId = (f['Employees'] || [])[0]
  const employee = empId ? (employeeMap.get(empId) || null) : null
  const modelId = (f['Model'] || [])[0]
  const model = modelId ? (modelMap.get(modelId) || null) : null
  const phoneId = (f['Empleados & Movil'] || [])[0]
  const phoneRef = phoneId ? (phoneRefMap.get(phoneId) || null) : null
  const employeeId = employee ? (erpUserMap.get(employee.toLowerCase()) ?? null) : null

  newAccountRows.push({
    id: randomUUID(),
    username,
    status: mapAccountStatus((f['Status'] || [])[0]),
    model,
    employee,
    employeeId,
    phoneRef,
    niche: (f['Niche'] || '').trim() || null,
    grupo: ((f['Group'] || [])[0] || '').trim() || null,
    igPassword: (f['IG Password'] || '').trim() || null,
    igEmail: (f['Email Details'] || '').trim() || null,
    fa2: (f['FA'] || '').trim() || null,
  })
}
console.log(`  → ${newAccountRows.length} nuevas (${accNoUsername} sin User Name, ${accountRecords.length - accNoUsername - newAccountRows.length} ya existían)`)

let accountsInserted = 0
for (let i = 0; i < newAccountRows.length; i += 200) {
  const chunk = newAccountRows.slice(i, i + 200)
  const { error } = await supabase.from('ig_accounts').insert(chunk)
  if (error) { console.error('  Error insertando accounts chunk:', error.message); continue }
  accountsInserted += chunk.length
}
console.log(`  ✓ ${accountsInserted} accounts insertados`)

console.log('\n=== Resumen ===')
console.log({ phonesInserted, accountsInserted })
