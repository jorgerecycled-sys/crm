// Run with: node scripts/create-ig-phones-table.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
)

const sql = `
CREATE TABLE IF NOT EXISTS ig_phones (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "phoneRef" TEXT UNIQUE NOT NULL,
  "gmailUser" TEXT,
  "gmailPassword" TEXT,
  "appleId" TEXT,
  "appleIdPassword" TEXT,
  "appleIdPhone" TEXT,
  "remoteLink" TEXT,
  employee TEXT,
  model TEXT,
  niche TEXT,
  grupo TEXT,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
`

let error
try {
  ;({ error } = await supabase.rpc('exec_sql', { query: sql }))
} catch (e) {
  error = e
}
if (error) {
  console.log('RPC exec_sql not available. Run this SQL manually in Supabase SQL editor:\n')
  console.log(sql)
} else {
  console.log('Table ig_phones created successfully.')
}

// Sanity check
const { error: checkErr } = await supabase.from('ig_phones').select('id').limit(1)
console.log('Table reachable?', checkErr ? checkErr.message : 'yes')
