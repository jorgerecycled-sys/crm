import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  channelId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('TODO'),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channelId')
    const channelSlug = searchParams.get('channelSlug')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')

    const skip = (page - 1) * pageSize

    let query = supabase
      .from('tasks')
      .select('*, crm_channels(*), erp_users!assignedToId(id, firstName, lastName)', { count: 'exact' })
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    if (channelId) query = query.eq('channelId', channelId)
    if (channelSlug) query = query.eq('crm_channels.slug', channelSlug)
    if (status) query = query.eq('status', status)

    const { data: tasks, error, count } = await query
    if (error) throw error

    const total = count ?? 0

    return apiResponse({ data: tasks, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) return apiResponse({ error: 'Datos inválidos' }, 400)

    const insertData = {
      id: uuidv4(),
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : undefined,
      assignedToId: parsed.data.assignedToId ?? user.sub,
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(insertData)
      .select('*, crm_channels(*), erp_users!assignedToId(id, firstName, lastName)')
      .single()

    if (error) throw error

    await logActivity({ userId: user.sub, action: 'CREATE_TASK', resource: 'tasks', resourceId: task.id, req })
    return apiResponse(task, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
