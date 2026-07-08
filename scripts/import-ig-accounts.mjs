// Import Instagram accounts from CSV files into Supabase
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const SUPABASE_URL = 'https://lzhzuqmctlkgpxkhkqgt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = parseLine(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseLine(l)
    const obj = {}
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim() })
    return obj
  })
}

function parseLine(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += c }
  }
  result.push(cur)
  return result
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('not work')) return 'suspended'
  if (s.includes('shadow')) return 'shadow banned'
  if (s.includes('active')) return 'active'
  if (s.includes('new')) return 'new'
  return 'active'
}

const accountsCSV = readFileSync('C:/Users/Marketing/Desktop/crm/Instagram Accounts-Active (1).csv', 'utf8')
const phonesCSV   = readFileSync('C:/Users/Marketing/Desktop/crm/Phones-Active.csv', 'utf8')

const accountRows = parseCSV(accountsCSV)
const phoneRows   = parseCSV(phonesCSV)

const phoneNiche = {}
const phoneGrupo = {}
for (const row of phoneRows) {
  const keys = Object.keys(row)
  const phone = (row['Phone'] || row['Phone Number'] || row[keys[0]] || '').trim()
  if (!phone) continue
  phoneNiche[phone] = (row['Niche'] || '').trim() || null
  phoneGrupo[phone] = (row['Grupo'] || '').trim() || null
}

console.log('Phone CSV headers:', Object.keys(phoneRows[0] || {}))
console.log('Phone niche sample:', Object.entries(phoneNiche).slice(0, 3))

const records = []
for (const row of accountRows) {
  const username = (row['User Name'] || '').trim()
  if (!username) continue
  const model    = (row['Model'] || '').trim() || null
  const igType   = (row['Type'] || '').trim() || null
  const status   = mapStatus(row['Status'] || '')
  const phoneRef = (row['Empleados & Movil'] || '').trim() || null
  const employee = (row['Employees'] || '').trim() || null
  const niche    = phoneRef ? (phoneNiche[phoneRef] ?? null) : null
  const grupo    = phoneRef ? (phoneGrupo[phoneRef] ?? null) : null
  records.push({ id: randomUUID(), username: username.toLowerCase(), status, model, employee, phoneRef, igType, niche, grupo })
}

console.log(`Preparing to import ${records.length} accounts`)
if (records.length > 0) console.log('Sample:', JSON.stringify(records[0], null, 2))

const BATCH = 50
let ok = 0, errors = 0

for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH)
  const { error } = await supabase
    .from('ig_accounts')
    .upsert(batch, { onConflict: 'username', ignoreDuplicates: false })
  if (error) {
    console.error(`Batch ${i}-${i+BATCH} ERROR:`, error.message)
    errors += batch.length
  } else {
    ok += batch.length
    console.log(`✓ ${Math.min(i+BATCH, records.length)}/${records.length}`)
  }
}

console.log(`\nDone: ${ok} imported OK, ${errors} errors`)
