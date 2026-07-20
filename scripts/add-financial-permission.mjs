// Run with: node scripts/add-financial-permission.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

let { data: perm } = await supabase.from('permissions').select('id').eq('name', 'financial:manage').maybeSingle()
if (!perm) {
  const { data: inserted, error } = await supabase
    .from('permissions')
    .insert({ id: randomUUID(), name: 'financial:manage', resource: 'financial', action: 'manage' })
    .select('id')
    .single()
  if (error) throw error
  perm = inserted
  console.log('Created permission financial:manage')
} else {
  console.log('Permission financial:manage already exists')
}

const { data: roles } = await supabase.from('roles').select('id, name').in('name', ['Super Admin', 'Admin', 'Manager'])
for (const role of roles) {
  const { data: existing } = await supabase
    .from('role_permissions')
    .select('roleId')
    .eq('roleId', role.id)
    .eq('permissionId', perm.id)
    .maybeSingle()
  if (existing) { console.log(`  ${role.name} already has it`); continue }
  const { error } = await supabase.from('role_permissions').insert({ roleId: role.id, permissionId: perm.id })
  if (error) throw error
  console.log(`  Granted to ${role.name}`)
}
