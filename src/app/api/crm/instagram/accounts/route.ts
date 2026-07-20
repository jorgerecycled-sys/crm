import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { generateDailyTasks } from '@/lib/robot/jobs'

const createSchema = z.object({
  username: z.string().min(1, 'Username requerido').transform((s) => s.replace(/^@/, '').trim().toLowerCase()),
  notes: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  phoneRef: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  igPassword: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req)
    const isEmployee = authUser.roleName === 'Empleado'
    let query = supabase
      .from('ig_accounts')
      .select(
        '*, ig_measurements(fecha, seguidores, siguiendo, seguidoresGanados, reproduccionesTotal, postsHoy, reelsHoy, likesDia, comentariosDia), ig_posts(id, shortcode, tipo, fechaPub, visitas, likes, comentarios)'
      )
      .order('createdAt', { ascending: false })
    if (isEmployee) query = query.eq('employeeId', authUser.sub)
    const { data: accounts, error } = await query
    if (error) throw error
    return apiResponse(accounts)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req)
    const isEmployee = authUser.roleName === 'Empleado'
    const body = await req.json()

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map(e => e.message).join(', ')
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { username, notes, phoneRef, model, igPassword } = parsed.data
    // Empleado can only ever create accounts assigned to themselves — ignore
    // whatever employeeId they submitted and force their own.
    const employeeId = isEmployee ? authUser.sub : (parsed.data.employeeId ?? null)

    const { data: existing, error: findError } = await supabase
      .from('ig_accounts')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (findError) throw findError
    if (existing) {
      return NextResponse.json({ error: `La cuenta @${username} ya existe` }, { status: 409 })
    }

    // Derive employee display name if employeeId provided
    let employeeName: string | null = null
    if (employeeId) {
      const { data: u } = await supabase.from('erp_users').select('firstName, lastName').eq('id', employeeId).maybeSingle()
      if (u) employeeName = `${u.firstName} ${u.lastName}`
    }

    const row: Record<string, unknown> = {
      id: uuidv4(),
      username,
      notes: notes ?? null,
      employeeId,
      employee: employeeName,
      phoneRef: phoneRef ?? null,
      model: model ?? null,
      status: 'new',
    }
    if (igPassword) row.igPassword = igPassword

    const { data: account, error: insertError } = await supabase
      .from('ig_accounts')
      .insert(row)
      .select()
      .single()

    if (insertError) {
      // Unknown column — retry without igPassword
      if (insertError.code === '42703' && igPassword) {
        delete row.igPassword
        const { data: a2, error: e2 } = await supabase.from('ig_accounts').insert(row).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return apiResponse(a2, 201)
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    if (phoneRef || employeeId) generateDailyTasks().catch(() => {})

    return apiResponse(account, 201)
  } catch (e) {
    return handleApiError(e)
  }
}
