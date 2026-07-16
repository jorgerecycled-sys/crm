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
