import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { requireAuth, handleApiError, apiResponse } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  const { data, error } = await supabase.from('ig_phones').select('*')
  if (error?.code === '42P01') {
    return NextResponse.json({ phones: [], missing: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ phones: data ?? [] })
}

const patchSchema = z.object({
  phoneRef: z.string().min(1),
  gmailUser: z.string().nullable().optional(),
  gmailPassword: z.string().nullable().optional(),
  appleId: z.string().nullable().optional(),
  appleIdPassword: z.string().nullable().optional(),
  appleIdPhone: z.string().nullable().optional(),
  remoteLink: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth(req)
  } catch (e) {
    return handleApiError(e)
  }

  try {
    const body = await req.json()
    const { phoneRef, ...update } = patchSchema.parse(body)
    const { data, error } = await supabase
      .from('ig_phones')
      .upsert({ phoneRef, ...update, updatedAt: new Date().toISOString() }, { onConflict: 'phoneRef' })
      .select()
      .single()
    if (error) throw error
    return apiResponse(data)
  } catch (e) {
    return handleApiError(e)
  }
}
