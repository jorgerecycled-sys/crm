// Run with: node scripts/add-pool-accounts.mjs
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

const sql = readFileSync('supabase/ig_pool_accounts.sql', 'utf8')

let error
try {
  ;({ error } = await supabase.rpc('exec_sql', { query: sql }))
} catch (e) {
  error = e
}
if (error) {
  console.log('RPC exec_sql not available or failed:', error.message ?? error)
  console.log('\nRun this SQL manually in the Supabase SQL editor:\n')
  console.log(sql)
} else {
  console.log('ig_pool_accounts.sql applied successfully.')
}

// Sanity checks
const { data: cols, error: colErr } = await supabase.from('ig_accounts').select('pool, poolAssignedAt, poolAssignedFollowers').limit(1)
console.log('New columns reachable?', colErr ? colErr.message : 'yes')

const { data: perm, error: permErr } = await supabase.from('permissions').select('id, name').eq('name', 'pool-accounts:manage').maybeSingle()
console.log('Permission created?', permErr ? permErr.message : (perm ? 'yes' : 'no'))
