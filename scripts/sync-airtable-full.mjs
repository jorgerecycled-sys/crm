// Full sync: pulls Phones + Instagram Accounts from Airtable and upserts into Supabase
// Run with: node scripts/sync-airtable-full.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import {
  loadEnv, AIRTABLE_BASE_ID, AIRTABLE_TABLES,
  airtableFetchAll, phoneRecordToRow, accountRecordToRow,
} from './airtable-lib.mjs'

loadEnv()
const apiKey = process.env.AIRTABLE_API_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

async function main() {
  console.log('Fetching lookup tables (Employees, Models, Phones)...')
  const [employeeRecs, modelRecs, phoneRecs] = await Promise.all([
    airtableFetchAll(AIRTABLE_BASE_ID, AIRTABLE_TABLES.employees, apiKey, ['Name']),
    airtableFetchAll(AIRTABLE_BASE_ID, AIRTABLE_TABLES.models, apiKey, ['Name']),
    airtableFetchAll(AIRTABLE_BASE_ID, AIRTABLE_TABLES.phones, apiKey, ['Phone']),
  ])
  const employeesMap = new Map(employeeRecs.map(r => [r.id, r.fields['Name'] || null]))
  const modelsMap = new Map(modelRecs.map(r => [r.id, r.fields['Name'] || null]))
  const phonesMap = new Map(phoneRecs.map(r => [r.id, r.fields['Phone'] || null]))
  console.log(`Employees: ${employeesMap.size}, Models: ${modelsMap.size}, Phones: ${phonesMap.size}`)

  console.log('\nSyncing Phones...')
  const phoneFullRecs = await airtableFetchAll(AIRTABLE_BASE_ID, AIRTABLE_TABLES.phones, apiKey)
  const phoneRows = phoneFullRecs.map(r => phoneRecordToRow(r, { employeesMap })).filter(Boolean)
  let pOk = 0, pErr = 0
  for (let i = 0; i < phoneRows.length; i += 50) {
    const batch = phoneRows.slice(i, i + 50)
    const { error } = await supabase.from('ig_phones').upsert(batch, { onConflict: 'phoneRef' })
    if (error) { console.error('Phones batch error:', error.message); pErr += batch.length } else pOk += batch.length
  }
  console.log(`Phones: ${pOk} upserted, ${pErr} errors`)

  console.log('\nSyncing Instagram Accounts...')
  const { data: existing } = await supabase.from('ig_accounts').select('id, username')
  const existingIdByUsername = new Map((existing ?? []).map(a => [a.username, a.id]))

  const { data: erpUsers } = await supabase.from('erp_users').select('id, firstName, lastName').is('deletedAt', null)
  const erpUsersByName = new Map((erpUsers ?? []).map(u => [`${u.firstName} ${u.lastName}`.trim().toLowerCase(), u.id]))
  console.log(`ERP users (for employee linking): ${erpUsersByName.size}`)

  const accountFullRecs = await airtableFetchAll(AIRTABLE_BASE_ID, AIRTABLE_TABLES.accounts, apiKey)
  const accountRows = accountFullRecs.map(r => accountRecordToRow(r, { employeesMap, modelsMap, phonesMap, erpUsersByName })).filter(Boolean)
    .map(row => ({ id: existingIdByUsername.get(row.username) ?? randomUUID(), ...row }))
  let aOk = 0, aErr = 0
  for (let i = 0; i < accountRows.length; i += 50) {
    const batch = accountRows.slice(i, i + 50)
    const { error } = await supabase.from('ig_accounts').upsert(batch, { onConflict: 'username' })
    if (error) { console.error('Accounts batch error:', error.message); aErr += batch.length } else aOk += batch.length
  }
  console.log(`Accounts: ${aOk} upserted, ${aErr} errors`)

  const recoveredIds = accountRows.filter(r => r.status !== 'suspended' && r.status !== 'shadow banned').map(r => r.id)
  if (recoveredIds.length > 0) {
    const { error } = await supabase.from('ig_account_alert_dismissals').delete().in('accountId', recoveredIds)
    if (error && error.code !== '42P01') console.error('Dismissal cleanup error:', error.message)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
