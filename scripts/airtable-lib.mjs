// Shared helpers for Airtable <-> Supabase sync
import { readFileSync } from 'fs'

export const AIRTABLE_BASE_ID = 'appKHrDqD3EeoW0u7'
export const AIRTABLE_TABLES = {
  phones: 'Phones',
  accounts: 'Instagram Accounts',
  employees: 'Employees',
  models: 'Models',
}

export function loadEnv() {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

export async function airtableFetchAll(baseId, tableName, apiKey, fields) {
  const records = []
  let offset
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
    url.searchParams.set('pageSize', '100')
    if (fields) for (const f of fields) url.searchParams.append('fields[]', f)
    if (offset) url.searchParams.set('offset', offset)
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!r.ok) throw new Error(`Airtable ${tableName} fetch failed: ${r.status} ${await r.text()}`)
    const d = await r.json()
    records.push(...(d.records ?? []))
    offset = d.offset
  } while (offset)
  return records
}

export async function airtableFetchOne(baseId, tableName, recordId, apiKey) {
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!r.ok) throw new Error(`Airtable ${tableName}/${recordId} fetch failed: ${r.status} ${await r.text()}`)
  return r.json()
}

function clean(s) {
  return typeof s === 'string' ? s.trim() : s
}

export function mapAccountStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('not work') || s === 'suspended') return 'suspended'
  if (s.includes('requires attention')) return 'shadow banned'
  if (s === 'active') return 'active'
  if (s === 'new') return 'new'
  if (s === 'unused') return 'unused'
  return 'active'
}

export function phoneRecordToRow(rec, { employeesMap }) {
  const f = rec.fields
  const phoneRef = (f['Phone'] || '').trim()
  if (!phoneRef) return null
  const employeeId = (f['Employee'] || [])[0]
  return {
    phoneRef,
    gmailUser: f['GMail User']?.trim() || null,
    gmailPassword: f['GMail Password']?.trim() || null,
    appleId: f['Apple ID']?.trim() || null,
    appleIdPassword: f['Apple ID Password']?.trim() || null,
    appleIdPhone: f['Apple ID Phone Used']?.trim() || null,
    remoteLink: f['Link->Phone']?.trim() || null,
    employee: employeeId ? clean(employeesMap.get(employeeId)) : null,
    model: clean((f['Name (from Models)'] || [])[0]) || null,
    niche: f['Niche']?.trim() || null,
    grupo: f['Grupo']?.trim() || null,
    updatedAt: new Date().toISOString(),
  }
}

export function accountRecordToRow(rec, { employeesMap, modelsMap, phonesMap, erpUsersByName }) {
  const f = rec.fields
  const username = (f['User Name'] || '').trim().replace(/^@/, '').toLowerCase()
  if (!username) return null
  const airtableEmployeeId = (f['Employees'] || [])[0]
  const modelId = (f['Model'] || [])[0]
  const phoneId = (f['Empleados & Movil'] || [])[0]
  const employee = airtableEmployeeId ? clean(employeesMap.get(airtableEmployeeId)) : null
  return {
    username,
    status: mapAccountStatus((f['Status'] || [])[0]),
    model: modelId ? clean(modelsMap.get(modelId)) : null,
    employee,
    employeeId: employee ? (erpUsersByName?.get(employee.toLowerCase()) ?? null) : null,
    phoneRef: phoneId ? clean(phonesMap.get(phoneId)) : null,
    niche: f['Niche']?.trim() || null,
    grupo: clean((f['Group'] || [])[0]) || null,
    igPassword: f['IG Password']?.trim() || null,
    igEmail: f['Email Details']?.trim() || null,
    fa2: f['FA']?.trim() || null,
  }
}
