import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError } from '@/lib/auth/middleware'
import { generateDailyTasks } from '@/lib/robot/jobs'

// GET: list tasks for a date (defaults to today)
// ?fecha=YYYY-MM-DD  &employeeId=xxx (ignored for role Empleado — always scoped to themselves)
export async function GET(req: NextRequest) {
  let authUser
  try { authUser = await requireAuth(req) } catch (e) { return handleApiError(e) }

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]
  let employeeId = searchParams.get('employeeId') ?? null

  if (authUser.roleName === 'Empleado') {
    const { data: me } = await supabase.from('erp_users').select('firstName, lastName').eq('id', authUser.sub).maybeSingle()
    employeeId = me ? `${me.firstName} ${me.lastName}`.trim() : '__none__'
  }

  let q = supabase.from('ig_daily_tasks').select('*').eq('fecha', fecha).order('employeeId').order('phoneRef').order('accountId')
  if (employeeId) q = q.eq('employeeId', employeeId)

  const { data, error } = await q
  if (error?.code === '42P01') return NextResponse.json({ tasks: [], missing: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tasks = data ?? []
  const total = tasks.length
  const done  = tasks.filter(t => t.status === 'hecha').length
  const byEmployee: Record<string, { total: number; done: number }> = {}
  for (const t of tasks) {
    const e = t.employeeId as string
    if (!byEmployee[e]) byEmployee[e] = { total: 0, done: 0 }
    byEmployee[e].total++
    if (t.status === 'hecha') byEmployee[e].done++
  }

  return NextResponse.json({ tasks, summary: { total, done, byEmployee } })
}

// DELETE: borrar todas las tareas de una fecha (para regenerar)
// ?fecha=YYYY-MM-DD  — si no se pasa, borra las de hoy
export async function DELETE(req: NextRequest) {
  let authUser
  try { authUser = await requireAuth(req) } catch (e) { return handleApiError(e) }
  if (authUser.roleName === 'Empleado') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]
    const regenerar = searchParams.get('regenerar') === 'true'

    const { error } = await supabase.from('ig_daily_tasks').delete().eq('fecha', fecha)
    if (error?.code === '42P01') return NextResponse.json({ ok: true, deleted: 0 })
    if (error) throw error

    if (regenerar) {
      const result = await generateDailyTasks(fecha)
      return NextResponse.json({ ok: true, regenerated: true, ...result })
    }

    return NextResponse.json({ ok: true, fecha })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH: toggle task status
// body: { id, status: 'hecha' | 'pendiente' }
export async function PATCH(req: NextRequest) {
  let authUser
  try { authUser = await requireAuth(req) } catch (e) { return handleApiError(e) }

  try {
    const { id, status } = await req.json() as { id: string; status: 'hecha' | 'pendiente' }
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    if (authUser.roleName === 'Empleado') {
      const { data: me } = await supabase.from('erp_users').select('firstName, lastName').eq('id', authUser.sub).maybeSingle()
      const myName = me ? `${me.firstName} ${me.lastName}`.trim() : null
      const { data: task } = await supabase.from('ig_daily_tasks').select('employeeId').eq('id', id).maybeSingle()
      if (!task || task.employeeId !== myName) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const update: Record<string, unknown> = { status }
    if (status === 'hecha')     update.doneAt = new Date().toISOString()
    if (status === 'pendiente') update.doneAt = null

    const { error } = await supabase.from('ig_daily_tasks').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
