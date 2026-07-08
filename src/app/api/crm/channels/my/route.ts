import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)

    const { data: access, error } = await supabase
      .from('user_channel_access')
      .select('*, crm_channels(*)')
      .eq('userId', user.sub)
      .eq('crm_channels.active', true)
      .order('sortOrder', { referencedTable: 'crm_channels', ascending: true })

    if (error) throw error

    const channelMap = new Map<string, any>()
    for (const a of access ?? []) {
      if (a.crm_channels) channelMap.set(a.crm_channels.id, a.crm_channels)
    }

    // For Empleado: also auto-include Instagram if they have assigned accounts
    if (user.roleName === 'Empleado') {
      const { data: igCheck } = await supabase
        .from('ig_accounts')
        .select('id')
        .eq('employeeId', user.sub)
        .limit(1)
      if (igCheck?.length) {
        const { data: igCh } = await supabase
          .from('crm_channels')
          .select('*')
          .eq('slug', 'instagram')
          .eq('active', true)
          .maybeSingle()
        if (igCh && !channelMap.has(igCh.id)) channelMap.set(igCh.id, igCh)
      }
    }

    return apiResponse([...channelMap.values()].sort((a, b) => a.sortOrder - b.sortOrder))
  } catch (error) {
    return handleApiError(error)
  }
}
