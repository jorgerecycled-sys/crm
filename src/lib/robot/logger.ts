import { supabase } from '@/lib/supabase/client'

export interface RobotConfig {
  preferredHour: number
  enabled: boolean
  label: string
}

export async function getRobotConfig(jobName: string): Promise<RobotConfig> {
  try {
    const { data } = await supabase
      .from('robot_config')
      .select('preferredHour, enabled, label')
      .eq('jobName', jobName)
      .maybeSingle()
    return {
      preferredHour: data?.preferredHour ?? 6,
      enabled:       data?.enabled       ?? true,
      label:         data?.label         ?? jobName,
    }
  } catch {
    return { preferredHour: 6, enabled: true, label: jobName }
  }
}

export async function startRun(jobName: string, triggeredBy: 'cron' | 'manual' = 'cron'): Promise<string> {
  try {
    const { data } = await supabase
      .from('robot_runs')
      .insert({ jobName, startedAt: new Date().toISOString(), status: 'running', triggeredBy })
      .select('id')
      .single()
    return data?.id ?? ''
  } catch { return '' }
}

export async function finishRun(
  id: string,
  status: 'ok' | 'error' | 'skipped',
  result: object,
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  if (!id) return
  try {
    await supabase
      .from('robot_runs')
      .update({
        finishedAt:    new Date().toISOString(),
        status,
        result,
        duration:      durationMs,
        errorMessage:  errorMessage ?? null,
      })
      .eq('id', id)
  } catch { /* non-fatal */ }
}
