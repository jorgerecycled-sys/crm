import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { requirePermission, handleApiError, apiResponse } from '@/lib/auth/middleware'
import { inChunks } from '@/lib/supabase/chunked'

const POOLS = ['jailbreak', 'pool'] as const

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, 'pool-accounts:manage')

    const form = await req.formData()
    const file = form.get('file')
    const pool = form.get('pool')
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    if (typeof pool !== 'string' || !(POOLS as readonly string[]).includes(pool)) {
      return NextResponse.json({ error: 'pool inválido' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

    const rows: { id: string; username: string; igPassword: string; fa2: string | null; pool: string; status: string }[] = []
    let invalidLines = 0
    for (const line of lines) {
      const [username, password, authCode] = line.split(',').map(p => p.trim())
      if (!username || !password) { invalidLines++; continue }
      rows.push({
        id: uuidv4(),
        username: username.replace(/^@/, '').toLowerCase(),
        igPassword: password,
        fa2: authCode || null,
        pool,
        status: 'pool_available',
      })
    }

    if (!rows.length) return NextResponse.json({ error: 'No se encontraron líneas válidas en el archivo' }, { status: 400 })

    const usernames = rows.map(r => r.username)
    const existing = await inChunks(usernames, (chunk) =>
      supabase.from('ig_accounts').select('username').in('username', chunk)
    )
    const existingSet = new Set(existing.map(e => e.username))
    const toInsert = rows.filter(r => !existingSet.has(r.username))
    const duplicates = rows.length - toInsert.length

    if (toInsert.length) {
      const { error: insertError } = await supabase.from('ig_accounts').insert(toInsert)
      if (insertError) throw insertError
    }

    return apiResponse({ inserted: toInsert.length, duplicates, invalidLines })
  } catch (e) {
    return handleApiError(e)
  }
}
