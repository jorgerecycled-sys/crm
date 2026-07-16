// Run with: node scripts/create-missing-employees.mjs
// One-time: create CRM login accounts for the Airtable "Employees" who never
// got one, so their ig_accounts/ig_phones rows can resolve a real employeeId.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

const NEW_EMPLOYEES = [
  { first: 'Sayam', last: '' },
  { first: 'Eduardo', last: '' },
  { first: 'Abdel', last: '' },
  { first: 'Anthony', last: '' },
  { first: 'Genesis', last: '' },
  { first: 'Kevin', last: 'Miranda' },
  { first: 'Andres', last: '' },
]

const { data: role, error: roleErr } = await supabase.from('roles').select('id').eq('name', 'Empleado').maybeSingle()
if (roleErr) throw roleErr
if (!role) throw new Error('Rol Empleado no encontrado')

const results = []

for (const emp of NEW_EMPLOYEES) {
  const fullName = [emp.first, emp.last].filter(Boolean).join(' ')
  const email = `${emp.first.toLowerCase()}@erp.local`
  const password = `miamiagency${emp.first}`

  const { data: existing } = await supabase.from('erp_users').select('id').eq('email', email).maybeSingle()
  if (existing) {
    console.log(`  ${fullName} (${email}) ya existía, se omite creación`)
    results.push({ fullName, email, password: null, id: existing.id, created: false })
    continue
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const id = randomUUID()
  const now = new Date().toISOString()
  const { error: insErr } = await supabase.from('erp_users').insert({
    id, email, passwordHash, firstName: emp.first, lastName: emp.last,
    roleId: role.id, status: 'ACTIVE', createdAt: now, updatedAt: now,
  })
  if (insErr) { console.error(`  Error creando ${fullName}:`, insErr.message); continue }
  console.log(`  ✓ Creado ${fullName} — ${email} / ${password}`)
  results.push({ fullName, email, password, id, created: true })
}

// Retro-link: any ig_accounts/ig_phones row whose free-text `employee` name
// matches one of these (case-insensitive) but has no employeeId yet.
console.log('\nEnlazando employeeId en cuentas y móviles existentes...')
let accountsLinked = 0, phonesLinked = 0
for (const emp of results) {
  const { data: accs, error: accErr } = await supabase
    .from('ig_accounts')
    .select('id')
    .ilike('employee', emp.fullName)
    .is('employeeId', null)
  if (accErr) { console.error('  Error buscando cuentas de', emp.fullName, accErr.message); continue }
  if (accs?.length) {
    const { error } = await supabase.from('ig_accounts').update({ employeeId: emp.id }).ilike('employee', emp.fullName).is('employeeId', null)
    if (error) console.error('  Error actualizando cuentas de', emp.fullName, error.message)
    else accountsLinked += accs.length
  }

  const { data: phones, error: phoneErr } = await supabase
    .from('ig_phones')
    .select('id')
    .ilike('employee', emp.fullName)
  if (phoneErr) { console.error('  Error buscando móviles de', emp.fullName, phoneErr.message); continue }
  phonesLinked += phones?.length ?? 0
}

console.log(`\n=== Resumen ===`)
console.log(`Cuentas de Instagram enlazadas: ${accountsLinked}`)
console.log(`Móviles con ese empleado (ig_phones no tiene employeeId, solo texto): ${phonesLinked}`)
console.log('\nCredenciales generadas (guárdalas, no se volverán a mostrar):')
for (const r of results.filter(r => r.created)) console.log(`  ${r.fullName}: ${r.email} / ${r.password}`)
