// Run with: node scripts/remove-financial-permission.mjs
// Financiero was removed entirely — clean up the permission we added for it.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

const { data: perm } = await supabase.from('permissions').select('id').eq('name', 'financial:manage').maybeSingle()
if (!perm) {
  console.log('financial:manage permission not found, nothing to do')
} else {
  const { error: rpError } = await supabase.from('role_permissions').delete().eq('permissionId', perm.id)
  if (rpError) throw rpError
  console.log('Removed role_permissions grants')
  const { error: pError } = await supabase.from('permissions').delete().eq('id', perm.id)
  if (pError) throw pError
  console.log('Removed financial:manage permission')
}
