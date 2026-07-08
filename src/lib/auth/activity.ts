import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase/client'
import { NextRequest } from 'next/server'

export async function logActivity({
  userId,
  action,
  resource,
  resourceId,
  metadata,
  req,
}: {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
  req?: NextRequest
}) {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      id: uuidv4(),
      userId,
      action,
      resource,
      resourceId,
      metadata: metadata as object | undefined,
      ip: req?.headers.get('x-forwarded-for') ?? req?.headers.get('x-real-ip'),
      userAgent: req?.headers.get('user-agent'),
    })
    if (error) throw error
  } catch (e) {
    console.error('Failed to log activity:', e)
  }
}
