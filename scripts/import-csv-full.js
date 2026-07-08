// Full CSV import — all fields
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs'), path = require('path'), { randomUUID } = require('crypto')
const supabase = createClient('https://lzhzuqmctlkgpxkhkqgt.supabase.co', 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3', { auth: { persistSession: false } })
const CSV_DIR = path.join(__dirname, '..', 'csv')

function parseCSV(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []; let row = [], field = '', inQ = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"' && src[i+1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field.trim()); field = '' }
      else if (c === '\n') {
        row.push(field.trim()); field = ''
        if (row.some(f => f !== '')) rows.push(row)
        row = []
      } else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field.trim()); if (row.some(f => f !== '')) rows.push(row) }
  return rows
}

function csvToObjects(text) {
  const rows = parseCSV(text)
  if (!rows.length) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim() })
    return obj
  }).filter(o => Object.values(o).some(v => v !== ''))
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('suspended'))          return 'suspended'
  if (s.includes('not work'))           return 'shadow banned'
  if (s.includes('requires attention')) return 'shadow banned'
  if (s.includes('new'))                return 'new'
  if (s.includes('active'))             return 'active'
  return 'active'
}

function parseDate(raw) {
  if (!raw) return null
  // formats: "27/9/2025 7:03pm", "8/2/2026 9:40pm", "13/6/2026 5:34am"
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
}

const IG_FILES = [
  'Instagram Accounts-MELISSA.csv',
  'Instagram Accounts-GRACE (3).csv',
  'Instagram Accounts-JESSICA.csv',
  'Instagram Accounts-DAISY ( IA ).csv',
  'Instagram Accounts-KIRA ( IA ) .csv',
]

function parseIgAccounts() {
  const accounts = []
  for (const file of IG_FILES) {
    const fp = path.join(CSV_DIR, file)
    if (!fs.existsSync(fp)) { console.warn('Not found:', file); continue }
    const rows = csvToObjects(fs.readFileSync(fp, 'utf8'))
    for (const r of rows) {
      const username = (r['User Name'] || '').toLowerCase().replace(/^@/, '').trim()
      if (!username) continue
      const employee = (r['Employees'] || r['Empleado'] || r['Name (from Empleado)'] || '').trim() || null
      const phoneRef  = (r['Empleados & Movil'] || '').trim() || null
      const igEmail   = (r['Email Details'] || '').split(':')[0].trim() || null
      const fa2       = (r['FA'] || '').trim() || null
      const createdOn = parseDate(r['CreatedOn'] || '')
      accounts.push({
        username,
        status:      mapStatus(r['Status'] || ''),
        model:       (r['Model'] || '').trim() || null,
        employee,
        phoneRef,
        igPassword:  (r['IG Password'] || '').trim() || null,
        igGroup:     (r['Group'] || '').trim() || null,
        niche:       (r['Niche'] || '').trim() || null,
        accountType: (r['Type'] || '').trim() || null,
        igEmail,
        fa2,
        createdOn,
      })
    }
    console.log(`  Parsed ${rows.length} rows from ${file}`)
  }
  return accounts
}

async function main() {
  console.log('Reading CSVs...')
  const igAccounts = parseIgAccounts()
  const byUsername = new Map()
  for (const a of igAccounts) byUsername.set(a.username, a)
  const deduped = [...byUsername.values()]
  console.log(`\nTotal: ${deduped.length} unique accounts`)

  const { data: existing } = await supabase.from('ig_accounts').select('id, username, createdAt').range(0, 1999)
  const existingMap = new Map((existing || []).map(a => [a.username.toLowerCase().trim(), { id: a.id, createdAt: a.createdAt }]))

  let inserted = 0, updated = 0, errors = 0
  const toInsert = [], toUpdate = []

  for (const acc of deduped) {
    const found = existingMap.get(acc.username)
    const { createdOn, ...fields } = acc
    if (found) {
      const update = { ...fields }
      // Only overwrite createdAt if it looks like a default/null and CSV has a date
      if (createdOn && (!found.createdAt || found.createdAt.startsWith('2024'))) {
        update.createdAt = createdOn
      }
      toUpdate.push({ id: found.id, ...update })
    } else {
      toInsert.push({ id: randomUUID(), ...fields, ...(createdOn ? { createdAt: createdOn } : {}) })
    }
  }

  console.log(`\nTo update: ${toUpdate.length}  |  To insert: ${toInsert.length}`)

  console.log('\nUpdating...')
  for (const acc of toUpdate) {
    const { id, ...update } = acc
    const { error } = await supabase.from('ig_accounts').update(update).eq('id', id)
    if (error) { console.error(`  ✗ @${acc.username}: ${error.message}`); errors++ }
    else { console.log(`  ✓ @${acc.username}  [${acc.status}]  pwd=${acc.igPassword ? '✓' : '—'}  niche=${acc.niche || '—'}`); updated++ }
  }

  console.log('\nInserting...')
  for (const acc of toInsert) {
    const { error } = await supabase.from('ig_accounts').insert(acc)
    if (error) { console.error(`  ✗ @${acc.username}: ${error.message}`); errors++ }
    else { console.log(`  + @${acc.username}  [${acc.status}]`); inserted++ }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Updated: ${updated}  |  Inserted: ${inserted}  |  Errors: ${errors}`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
