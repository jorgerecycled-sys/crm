import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)

    // 1. Get distinct employee names from ig_accounts
    const { data: igAccounts } = await supabase
      .from('ig_accounts')
      .select('employee, employeeId')

    const namesInIG = [...new Set(
      (igAccounts ?? []).map(a => a.employee).filter(Boolean) as string[]
    )].sort()

    // 2. Get erp_users with Empleado role
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'Empleado')
      .maybeSingle()

    const { data: erpUsers } = role
      ? await supabase
          .from('erp_users')
          .select('id, firstName, lastName, email')
          .eq('roleId', role.id)
          .is('deletedAt', null)
          .order('firstName')
      : { data: [] }

    // 3. Count ig_accounts per employeeId
    const countMap = new Map<string, number>()
    for (const a of (igAccounts ?? [])) {
      if (a.employeeId) countMap.set(a.employeeId, (countMap.get(a.employeeId) ?? 0) + 1)
    }

    // 4. Employees WITH erp_users account
    const withAccount = (erpUsers ?? []).map(u => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      linkedAccounts: countMap.get(u.id) ?? 0,
      hasLogin: true,
    }))

    // 5. Employee names in ig_accounts that have NO matching erp_user (compare by full name)
    const erpNames = new Set(withAccount.map(u => u.name.toLowerCase().trim()))
    const withoutAccount = namesInIG
      .filter(name => !erpNames.has(name.toLowerCase().trim()))
      .map(name => {
        const parts = name.trim().split(' ')
        return {
          id: null as null,
          name,
          firstName: parts[0] ?? name,
          lastName: parts.slice(1).join(' ') ?? '',
          email: '',
          linkedAccounts: 0,
          hasLogin: false,
        }
      })

    return NextResponse.json({ withAccount, withoutAccount, igNames: namesInIG })
  } catch (e) {
    return handleApiError(e)
  }
}

// POST: retroactively link ig_accounts by employee name to an erp_user
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const { userId, name } = await req.json()
    if (!userId || !name) return NextResponse.json({ error: 'userId y name requeridos' }, { status: 400 })

    // Update all accounts with this employee name (overwrite any previous link)
    const { data, error } = await supabase
      .from('ig_accounts')
      .update({ employeeId: userId, employee: name })
      .eq('employee', name)
      .select('id')

    if (error) {
      // Column may not exist yet — return helpful error
      if (error.code === '42703' || error.code === '42P01') {
        return NextResponse.json({ error: 'Ejecuta el SQL de migración en Supabase primero (supabase/account_employee_link.sql)', code: 'MISSING_COLUMN' }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ ok: true, linked: data?.length ?? 0, name })
  } catch (e) {
    return handleApiError(e)
  }
}
