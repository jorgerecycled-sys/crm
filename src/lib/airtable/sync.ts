import { supabase } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'

const AIRTABLE_BASE_ID = 'appKHrDqD3EeoW0u7'
const TABLES = {
  phones: 'Phones',
  accounts: 'Instagram Accounts',
  employees: 'Employees',
  models: 'Models',
}

function apiKey() {
  const key = process.env.AIRTABLE_API_KEY
  if (!key) throw new Error('AIRTABLE_API_KEY no configurada')
  return key
}

async function airtableGet(tableName: string, recordId: string) {
  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  })
  if (!r.ok) throw new Error(`Airtable GET ${tableName}/${recordId} failed: ${r.status}`)
  return r.json()
}

async function airtableListAll(tableName: string, fields: string[]) {
  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`)
    url.searchParams.set('pageSize', '100')
    for (const f of fields) url.searchParams.append('fields[]', f)
    if (offset) url.searchParams.set('offset', offset)
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } })
    if (!r.ok) throw new Error(`Airtable list ${tableName} failed: ${r.status}`)
    const d = await r.json()
    records.push(...(d.records ?? []))
    offset = d.offset
  } while (offset)
  return records
}

function mapAccountStatus(raw: string | undefined): string {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('not work') || s === 'suspended') return 'suspended'
  if (s.includes('requires attention')) return 'shadow banned'
  if (s === 'active') return 'active'
  if (s === 'new') return 'new'
  if (s === 'unused') return 'unused'
  return 'active'
}

async function resolveLinkName(table: string, recordId: string | undefined, nameField: string): Promise<string | null> {
  if (!recordId) return null
  const rec = await airtableGet(table, recordId)
  const value = rec.fields?.[nameField] as string | undefined
  return value ? value.trim() : null
}

export async function syncPhoneRecord(recordId: string) {
  const rec = await airtableGet(TABLES.phones, recordId)
  const f = rec.fields as Record<string, any>
  const phoneRef = (f['Phone'] || '').trim()
  if (!phoneRef) return { skipped: true }

  const employeeId = (f['Employee'] || [])[0]
  const employee = await resolveLinkName(TABLES.employees, employeeId, 'Name')

  const row = {
    phoneRef,
    gmailUser: f['GMail User']?.trim() || null,
    gmailPassword: f['GMail Password']?.trim() || null,
    appleId: f['Apple ID']?.trim() || null,
    appleIdPassword: f['Apple ID Password']?.trim() || null,
    appleIdPhone: f['Apple ID Phone Used']?.trim() || null,
    remoteLink: f['Link->Phone']?.trim() || null,
    employee,
    model: ((f['Name (from Models)'] || [])[0] as string | undefined)?.trim() || null,
    niche: f['Niche']?.trim() || null,
    grupo: f['Grupo']?.trim() || null,
    updatedAt: new Date().toISOString(),
  }
  const { error } = await supabase.from('ig_phones').upsert(row, { onConflict: 'phoneRef' })
  if (error) throw error
  return { phoneRef }
}

export async function syncAccountRecord(recordId: string) {
  const rec = await airtableGet(TABLES.accounts, recordId)
  const f = rec.fields as Record<string, any>
  const username = (f['User Name'] || '').trim().replace(/^@/, '').toLowerCase()
  if (!username) return { skipped: true }

  const airtableEmployeeId = (f['Employees'] || [])[0]
  const modelId = (f['Model'] || [])[0]
  const phoneId = (f['Empleados & Movil'] || [])[0]
  const [employee, model, phoneRef] = await Promise.all([
    resolveLinkName(TABLES.employees, airtableEmployeeId, 'Name'),
    resolveLinkName(TABLES.models, modelId, 'Name'),
    resolveLinkName(TABLES.phones, phoneId, 'Phone'),
  ])

  // Resolve to a real erp_users login account so employee-scoped views (Cuentas/Estadísticas/Móviles) work
  let employeeId: string | null = null
  if (employee) {
    const { data: erpUser } = await supabase
      .from('erp_users')
      .select('id, firstName, lastName')
      .is('deletedAt', null)
    const match = (erpUser ?? []).find(u => `${u.firstName} ${u.lastName}`.trim().toLowerCase() === employee.toLowerCase())
    employeeId = match?.id ?? null
  }

  const { data: existing } = await supabase.from('ig_accounts').select('id').eq('username', username).maybeSingle()

  const row = {
    id: existing?.id ?? uuidv4(),
    username,
    status: mapAccountStatus((f['Status'] || [])[0]),
    model,
    employee,
    employeeId,
    phoneRef,
    niche: f['Niche']?.trim() || null,
    grupo: ((f['Group'] || [])[0] as string | undefined)?.trim() || null,
    igPassword: f['IG Password']?.trim() || null,
    igEmail: f['Email Details']?.trim() || null,
    fa2: f['FA']?.trim() || null,
  }
  const { error } = await supabase.from('ig_accounts').upsert(row, { onConflict: 'username' })
  if (error) throw error

  // Account recovered — clear any dismissed-alert marker so a future problem alerts fresh
  if (row.status !== 'suspended' && row.status !== 'shadow banned') {
    await supabase.from('ig_account_alert_dismissals').delete().eq('accountId', row.id)
  }

  return { username }
}

export { airtableListAll, TABLES, AIRTABLE_BASE_ID }
