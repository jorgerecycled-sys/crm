import { NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

const createSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  category: z.enum(['funcionalidad', 'ui', 'rendimiento', 'otro']).default('funcionalidad'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    let query = supabase
      .from('app_mejoras')
      .select('*, erp_users!submittedById(id, firstName, lastName)')
      .order('createdAt', { ascending: false })

    if (user.roleName === 'Empleado') {
      query = query.eq('submittedById', user.sub)
    }

    const { data, error } = await query
    if (error) throw error
    return apiResponse(data ?? [])
  } catch (e) { return handleApiError(e) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const body = await req.json()
    const parsed = createSchema.parse(body)

    const { data, error } = await supabase
      .from('app_mejoras')
      .insert({ id: uuidv4(), ...parsed, status: 'pending', submittedById: user.sub })
      .select('*, erp_users!submittedById(id, firstName, lastName)')
      .single()

    if (error) throw error
    return apiResponse(data, 201)
  } catch (e) { return handleApiError(e) }
}
