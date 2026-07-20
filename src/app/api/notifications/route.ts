import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const POOL_EXPIRE_DAYS = parseInt(process.env.POOL_EXPIRE_DAYS ?? '3')

interface Notification {
  id: string
  type: 'suspended' | 'shadow_banned' | 'pool_expiring'
  message: string
  href: string
}

// Live-computed, not persisted — "unread" is just "still true right now".
// Scoped to the caller's own employeeId, so this works the same for anyone
// (Empleado sees their own accounts, Admin sees theirs if they have any).
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)

    const { data: accounts, error } = await supabase
      .from('ig_accounts')
      .select('id, username, status, pool, poolAssignedAt')
      .eq('employeeId', user.sub)
      .range(0, 999)
    if (error) throw error

    const notifications: Notification[] = []
    const now = Date.now()

    for (const acc of accounts ?? []) {
      if (acc.status === 'suspended') {
        notifications.push({
          id: `${acc.id}-suspended`,
          type: 'suspended',
          message: `@${acc.username} ha sido suspendida`,
          href: acc.pool ? `/pool-accounts/${acc.pool}` : '/crm/instagram/cuentas',
        })
      } else if (acc.status === 'shadow banned') {
        notifications.push({
          id: `${acc.id}-shadow`,
          type: 'shadow_banned',
          message: `@${acc.username} está en shadow ban`,
          href: '/crm/instagram/cuentas',
        })
      }

      if (acc.pool && acc.status === 'pool_assigned' && acc.poolAssignedAt) {
        const daysAssigned = (now - new Date(acc.poolAssignedAt).getTime()) / 86400000
        const daysLeft = Math.ceil(POOL_EXPIRE_DAYS - daysAssigned)
        if (daysLeft <= 1) {
          notifications.push({
            id: `${acc.id}-expiring`,
            type: 'pool_expiring',
            message: daysLeft <= 0
              ? `@${acc.username} (pool) expira hoy`
              : `@${acc.username} (pool) expira mañana`,
            href: `/pool-accounts/${acc.pool}`,
          })
        }
      }
    }

    return apiResponse({ notifications })
  } catch (e) {
    return handleApiError(e)
  }
}
