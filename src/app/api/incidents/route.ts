import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { logActivity } from '@/lib/auth/activity'

const createIncidentSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  category: z.enum(['TECHNICAL', 'COMMERCIAL', 'CLIENT', 'ADMINISTRATION', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
})

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    const skip = (page - 1) * pageSize

    // Build the data query
    let query = supabase
      .from('incidents')
      .select('*, erp_users!reportedById(id, firstName, lastName, email), incident_comments(id)')
      .order('createdAt', { ascending: false })
      .range(skip, skip + pageSize - 1)

    // Build the count query
    let countQuery = supabase
      .from('incidents')
      .select('*', { count: 'exact', head: true })

    // Employees only see their own incidents
    if (user.roleName === 'Empleado') {
      query = query.eq('reportedById', user.sub)
      countQuery = countQuery.eq('reportedById', user.sub)
    }

    if (status) {
      query = query.eq('status', status)
      countQuery = countQuery.eq('status', status)
    }
    if (priority) {
      query = query.eq('priority', priority)
      countQuery = countQuery.eq('priority', priority)
    }
    if (category) {
      query = query.eq('category', category)
      countQuery = countQuery.eq('category', category)
    }
    if (search) {
      const searchFilter = `title.ilike.%${search}%,description.ilike.%${search}%`
      query = query.or(searchFilter)
      countQuery = countQuery.or(searchFilter)
    }

    const [{ data: incidents, error: incidentsError }, { count, error: countError }] = await Promise.all([
      query,
      countQuery,
    ])

    if (incidentsError) throw incidentsError
    if (countError) throw countError

    const total = count ?? 0

    const mapped = (incidents ?? []).map((item: Record<string, unknown>) => {
      const { incident_comments, ...rest } = item as { incident_comments: unknown[]; [key: string]: unknown }
      return {
        ...rest,
        _count: { comments: incident_comments?.length ?? 0 },
      }
    })

    return apiResponse({ data: mapped, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createIncidentSchema.safeParse(body)
    if (!parsed.success) {
      return apiResponse({ error: 'Datos inválidos', details: parsed.error.errors }, 400)
    }

    const { data: incident, error } = await supabase
      .from('incidents')
      .insert({ id: uuidv4(), ...parsed.data, reportedById: user.sub })
      .select('*, erp_users!reportedById(id, firstName, lastName, email)')
      .single()

    if (error) throw error

    await logActivity({ userId: user.sub, action: 'CREATE_INCIDENT', resource: 'incidents', resourceId: incident.id, req })
    return apiResponse(incident, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
