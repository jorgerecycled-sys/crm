import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'users:read')

    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(*, permissions(*)), erp_users(id)')
      .order('name', { ascending: true })

    if (error) throw error

    const roles = (data ?? []).map(({ erp_users, ...role }) => ({
      ...role,
      _count: { users: erp_users?.length ?? 0 },
    }))

    return apiResponse(roles)
  } catch (error) {
    return handleApiError(error)
  }
}
