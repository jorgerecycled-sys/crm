// Import phone credentials (Gmail / Apple ID) from CSV into Supabase
// Run with: node scripts/import-ig-phones.mjs "C:/path/to/Phones-Active.csv"
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

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

const csvPath = process.argv[2] || 'C:/Users/Marketing/Downloads/Phones-Active (1) (2).csv'
const rows = parseCSV(readFileSync(csvPath, 'utf8'))
console.log(`Parsed ${rows.length} rows from ${csvPath}`)

const records = []
for (const row of rows) {
  const phoneRef = (row['Phone'] || '').trim()
  if (!phoneRef) continue
  records.push({
    phoneRef,
    gmailUser: row['GMail User']?.trim() || null,
    gmailPassword: row['GMail Password']?.trim() || null,
    appleId: row['Apple ID']?.trim() || null,
    appleIdPassword: row['Apple ID Password']?.trim() || null,
    appleIdPhone: row['Apple ID Phone Used']?.trim() || null,
    remoteLink: row['Link->Phone']?.trim() || null,
    employee: row['Employee']?.trim() || null,
    model: row['Models']?.trim() || row['Name (from Models)']?.trim() || null,
    niche: row['Niche']?.trim() || null,
    grupo: row['Grupo']?.trim() || null,
    updatedAt: new Date().toISOString(),
  })
}

console.log(`Prepared ${records.length} phone records`)
console.log('Sample:', JSON.stringify(records[0], null, 2))

const BATCH = 50
let imported = 0, errors = 0
for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH)
  const { error } = await supabase.from('ig_phones').upsert(batch, { onConflict: 'phoneRef' })
  if (error) {
    console.error(`Batch ${i / BATCH} failed:`, error.message)
    errors += batch.length
  } else {
    imported += batch.length
  }
}

console.log(`Done. Imported/updated: ${imported}, errors: ${errors}`)
