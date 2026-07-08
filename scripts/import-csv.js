// One-time CSV import script
// Run: node scripts/import-csv.js
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const SUPABASE_URL = 'https://lzhzuqmctlkgpxkhkqgt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const CSV_DIR = path.join(__dirname, '..', 'csv')

// ── CSV parser (handles quoted fields with commas/newlines inside) ──────────
function parseCSV(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
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

// ── Status mapping: CSV → DB enum ──────────────────────────────────────────
// DB enum: active | suspended | new | unused | retiring | shadow banned
function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('suspended'))         return 'suspended'
  if (s.includes('not work'))          return 'shadow banned'
  if (s.includes('requires attention')) return 'shadow banned'
  if (s.includes('new'))               return 'new'
  if (s.includes('active'))            return 'active'
  return 'active'
}

// ── Parse all Instagram Account CSVs ──────────────────────────────────────
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
    const filePath = path.join(CSV_DIR, file)
    if (!fs.existsSync(filePath)) { console.warn(`⚠ Not found: ${file}`); continue }
    const rows = csvToObjects(fs.readFileSync(filePath, 'utf8'))
    for (const row of rows) {
      const username = (row['User Name'] || '').toLowerCase().replace(/^@/, '').trim()
      if (!username) continue

      // Employee: try multiple column names used across different CSVs
      const employee = (
        row['Employees'] ||
        row['Empleado'] ||
        row['Name (from Empleado)'] ||
        row['Employee'] ||
        ''
      ).trim() || null

      // Phone: "Empleados & Movil" column
      const phoneRef = (row['Empleados & Movil'] || '').trim() || null

      accounts.push({
        username,
        status: mapStatus(row['Status'] || ''),
        model:  (row['Model'] || '').trim() || null,
        employee,
        phoneRef,
      })
    }
    console.log(`  Parsed ${rows.length} rows from ${file}`)
  }
  return accounts
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading CSVs...')
  const igAccounts = parseIgAccounts()
  console.log(`\nTotal IG accounts in CSVs: ${igAccounts.length}`)

  // Deduplicate by username (keep last occurrence, in case same user appears in multiple files)
  const byUsername = new Map()
  for (const a of igAccounts) byUsername.set(a.username, a)
  const deduped = [...byUsername.values()]
  console.log(`After dedup: ${deduped.length} unique usernames`)

  // Fetch existing accounts from DB
  console.log('\nFetching existing accounts from DB...')
  const { data: existing, error: fetchErr } = await supabase
    .from('ig_accounts')
    .select('id, username')
    .range(0, 1999)
  if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }

  const existingMap = new Map((existing || []).map(a => [a.username.toLowerCase().trim(), a.id]))
  console.log(`Existing in DB: ${existingMap.size}`)

  let inserted = 0, updated = 0, errors = 0
  const toInsert = [], toUpdate = []

  for (const acc of deduped) {
    const id = existingMap.get(acc.username)
    if (id) {
      toUpdate.push({ id, ...acc })
    } else {
      toInsert.push({ id: randomUUID(), ...acc })
    }
  }

  console.log(`\nTo insert: ${toInsert.length}  |  To update: ${toUpdate.length}`)

  // ── Updates (batched 50 at a time, individual updates) ──────────────
  console.log('\nUpdating existing accounts...')
  for (const acc of toUpdate) {
    const { error } = await supabase.from('ig_accounts').update({
      status:   acc.status,
      phoneRef: acc.phoneRef,
      employee: acc.employee,
      model:    acc.model,
    }).eq('id', acc.id)
    if (error) {
      console.error(`  ✗ Update @${acc.username}: ${error.message}`)
      errors++
    } else {
      console.log(`  ✓ Updated @${acc.username}  [${acc.status}] phone=${acc.phoneRef ?? '—'}`)
      updated++
    }
  }

  // ── Inserts (batched 50 at a time) ──────────────────────────────────
  console.log('\nInserting new accounts...')
  const BATCH = 50
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('ig_accounts').insert(batch)
    if (error) {
      console.error(`  ✗ Insert batch ${i}-${i + batch.length}: ${error.message}`)
      // Fall back to one-by-one to identify the bad row
      for (const acc of batch) {
        const { error: e2 } = await supabase.from('ig_accounts').insert(acc)
        if (e2) { console.error(`    ✗ @${acc.username}: ${e2.message}`); errors++ }
        else    { console.log(`    + @${acc.username}  [${acc.status}]`); inserted++ }
      }
    } else {
      batch.forEach(a => console.log(`  + Inserted @${a.username}  [${a.status}]`))
      inserted += batch.length
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Inserted: ${inserted}  |  Updated: ${updated}  |  Errors: ${errors}`)
  console.log(`Total processed: ${inserted + updated + errors} / ${deduped.length}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
