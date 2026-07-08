'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/store/auth'

// ── types ──────────────────────────────────────────────────────────────────
interface RobotConfig {
  jobName: string; label: string; preferredHour: number; enabled: boolean; updatedAt: string
}
interface RobotRun {
  id: string; jobName: string; startedAt: string; finishedAt: string | null
  status: 'ok' | 'error' | 'skipped' | 'running'; result: Record<string, unknown> | null
  errorMessage: string | null; duration: number | null; triggeredBy: string
}
interface JobState { config: RobotConfig; lastRun: RobotRun | null; running: boolean; flash: string }

// ── helpers ────────────────────────────────────────────────────────────────
const JOBS = [
  { name: 'detect-performance',   label: 'Detección de Rendimiento', icon: '📈', color: '#6272e4' },
  { name: 'detect-devices',       label: 'Detección de Móviles',     icon: '📱', color: '#00c896' },
  { name: 'ig-sync',              label: 'Sync Instagram',           icon: '🔄', color: '#d4a843' },
  { name: 'promote-new-accounts', label: 'Activar Cuentas Nuevas',   icon: '🚀', color: '#34c759' },
  { name: 'reel-compliance',      label: 'Cumplimiento de Reels',    icon: '🎬', color: '#e05252' },
]

function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'hace un momento'
  if (d < 3600) return `hace ${Math.round(d / 60)}m`
  if (d < 86400) return `hace ${Math.round(d / 3600)}h`
  return `hace ${Math.round(d / 86400)}d`
}

function utcTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date(); const yesterday = new Date(Date.now() - 86400000)
  const ds = d.toISOString().split('T')[0]
  if (ds === today.toISOString().split('T')[0]) return `hoy ${utcTime(iso)}`
  if (ds === yesterday.toISOString().split('T')[0]) return `ayer ${utcTime(iso)}`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + utcTime(iso)
}

function dur(ms: number | null) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function resultSummary(run: RobotRun) {
  if (!run.result) return '—'
  const r = run.result
  if (run.jobName === 'detect-performance')   return `${r.evaluated ?? 0} eval. · ${r.retiring ?? 0} retirar`
  if (run.jobName === 'detect-devices')       return `${r.evaluated ?? 0} móviles · ${r.toChange ?? 0} cambiar`
  if (run.jobName === 'ig-sync')              return `${r.procesadas ?? 0} sync · ${r.errores ?? 0} errores`
  if (run.jobName === 'promote-new-accounts') return `${r.promoted ?? 0} activadas · ${r.alerted ?? 0} alertas`
  if (run.jobName === 'reel-compliance')      return `${r.compliant ?? 0}/${r.evaluated ?? 0} OK · ${r.missing ?? 0} pendientes`
  return '—'
}

// Next execution: given preferredHour (UTC), when is the next occurrence?
function nextRun(hour: number): string {
  const now = new Date()
  const next = new Date()
  next.setUTCHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  const diff = next.getTime() - now.getTime()
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
  if (h === 0) return `en ${m}m`
  return `en ${h}h ${m}m`
}

// ── heatmap ────────────────────────────────────────────────────────────────
function buildHeatmap(runs: RobotRun[], days = 14) {
  const map: Record<string, Record<string, 'ok' | 'error' | 'none'>> = {}
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
    dates.push(d)
    map[d] = {}
  }
  for (const run of runs) {
    if (run.status === 'skipped' || run.status === 'running') continue
    const d = run.startedAt.split('T')[0]
    if (!map[d]) continue
    const prev = map[d][run.jobName]
    if (!prev || (prev === 'ok' && run.status === 'error')) map[d][run.jobName] = run.status as 'ok' | 'error'
  }
  return { map, dates }
}

// ── STATUS CHIP ────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    ok:      { bg: '#1fad6e18', color: '#1fad6e', label: '✓ OK'     },
    error:   { bg: '#d9484818', color: '#d94848', label: '✗ Error'  },
    skipped: { bg: '#2a305088', color: '#5a6480', label: '– Omitida' },
    running: { bg: '#e9a82d18', color: '#e9a82d', label: '● Corriendo' },
  }
  const c = cfg[status] ?? cfg.skipped
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

// ── MAIN ───────────────────────────────────────────────────────────────────
export default function RobotPage() {
  const [states, setStates] = useState<Record<string, JobState>>({})
  const [runs, setRuns] = useState<RobotRun[]>([])
  const [loading, setLoading] = useState(true)
  const [missingSQL, setMissingSQL] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const headers = (extra?: Record<string, string>) => {
    const token = useAuthStore.getState().accessToken
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
  }

  const loadAll = useCallback(async () => {
    const h = headers()
    const [cfgRes, runsRes] = await Promise.all([
      fetch('/api/robot/config', { headers: h }).then(r => r.json()),
      fetch('/api/robot/runs?days=14&limit=200', { headers: h }).then(r => r.json()),
    ])

    if (cfgRes.missing || runsRes.missing) setMissingSQL(true)

    const configs: RobotConfig[] = cfgRes.configs ?? []
    const allRuns: RobotRun[] = runsRes.runs ?? []
    setRuns(allRuns)

    const next: Record<string, JobState> = {}
    for (const job of JOBS) {
      const cfg = configs.find(c => c.jobName === job.name) ?? {
        jobName: job.name, label: job.label, preferredHour: 6, enabled: true, updatedAt: '',
      }
      const lastRun = allRuns.find(r => r.jobName === job.name) ?? null
      next[job.name] = { config: cfg, lastRun, running: false, flash: '' }
    }
    setStates(next)
    setLoading(false)
  }, []) // eslint-disable-line

  useEffect(() => { loadAll() }, [loadAll])

  async function updateConfig(jobName: string, patch: Partial<RobotConfig>) {
    const h = headers()
    await fetch('/api/robot/config', {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ jobName, ...patch }),
    })
    setStates(prev => ({
      ...prev,
      [jobName]: { ...prev[jobName], config: { ...prev[jobName].config, ...patch } },
    }))
  }

  async function trigger(jobName: string) {
    setStates(prev => ({ ...prev, [jobName]: { ...prev[jobName], running: true, flash: '' } }))
    const h = headers()
    const res = await fetch('/api/robot/trigger', {
      method: 'POST', headers: h, body: JSON.stringify({ job: jobName, force: jobName === 'ig-sync' }),
    })
    const data = await res.json() as Record<string, unknown>
    const msg = data.ok
      ? jobName === 'detect-performance'
        ? `✓ ${data.evaluated ?? 0} evaluadas · ${data.retiring ?? 0} marcadas "retirar"`
        : jobName === 'detect-devices'
        ? `✓ ${data.evaluated ?? 0} móviles · ${data.toChange ?? 0} con alerta`
        : jobName === 'promote-new-accounts'
        ? `✓ ${data.promoted ?? 0} activadas · ${data.alerted ?? 0} alertas creadas`
        : jobName === 'reel-compliance'
        ? `✓ ${data.compliant ?? 0}/${data.evaluated ?? 0} cuentas OK · ${data.missing ?? 0} con reels pendientes`
        : `✓ Completado`
      : `✗ ${data.error ?? 'Error'}`

    setStates(prev => ({ ...prev, [jobName]: { ...prev[jobName], running: false, flash: msg } }))
    if (flashTimers.current[jobName]) clearTimeout(flashTimers.current[jobName])
    flashTimers.current[jobName] = setTimeout(() => {
      setStates(prev => ({ ...prev, [jobName]: { ...prev[jobName], flash: '' } }))
    }, 8000)
    await loadAll()
  }

  const { map: heatmap, dates } = buildHeatmap(runs)

  const S = (x: React.CSSProperties) => x

  if (loading) return (
    <div style={S({ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#3a4464', fontSize: 14 })}>
      Cargando Robot…
    </div>
  )

  return (
    <div style={S({ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' })}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={S({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 })}>
        <div>
          <div style={S({ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 })}>
            <span style={S({ fontSize: 26 })}>🤖</span>
            <h1 style={S({ fontSize: 24, fontWeight: 900, color: '#e8ecf5', letterSpacing: '-.03em', margin: 0 })}>Robot</h1>
            <span style={S({ fontSize: 11, fontWeight: 800, color: '#1fad6e', background: '#1fad6e14', border: '1px solid #1fad6e33', borderRadius: 20, padding: '3px 10px', letterSpacing: '.05em' })}>
              ● ACTIVO
            </span>
          </div>
          <p style={S({ fontSize: 13, color: '#5a6480', margin: 0 })}>Automatizaciones diarias · corre cada día a las 06:00 UTC · ejecución manual siempre disponible</p>
        </div>
        <button onClick={loadAll}
          style={S({ background: '#111628', border: '1px solid #1c2240', color: '#7280a0', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
          ↺ Actualizar
        </button>
      </div>

      {missingSQL && (
        <div style={S({ background: '#e9a82d0f', border: '1px solid #e9a82d33', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#e9a82d' })}>
          ⚠ Tablas de Robot no existen aún. Ejecuta <code style={S({ fontFamily: 'monospace', fontSize: 12 })}>supabase/robot_tables.sql</code> en Supabase. El historial no se guardará hasta entonces.
        </div>
      )}

      {/* ── JOB CARDS ──────────────────────────────────────────────────── */}
      <div style={S({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 })}>
        {JOBS.map(job => {
          const st = states[job.name]
          if (!st) return null
          const { config, lastRun, running, flash } = st
          const isError = lastRun?.status === 'error'
          const borderColor = isError ? '#d94848' : running ? '#e9a82d' : config.enabled ? job.color : '#2a3050'

          return (
            <div key={job.name} style={S({
              background: '#0c0f1e',
              border: `1px solid ${borderColor}`,
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: 10, padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 16,
            })}>
              {/* Card header */}
              <div style={S({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 })}>
                <div>
                  <div style={S({ fontSize: 11, fontWeight: 700, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 })}>
                    <span>{job.icon}</span>
                    <span style={S({ color: job.color })}>{job.label}</span>
                  </div>
                  {lastRun ? (
                    <div style={S({ fontSize: 12, color: '#5a6480' })}>
                      Última: <span style={S({ color: '#9aa4c0' })}>{fmtDate(lastRun.startedAt)}</span>
                      {' · '}{relTime(lastRun.startedAt)}
                    </div>
                  ) : (
                    <div style={S({ fontSize: 12, color: '#3a4464' })}>Sin ejecuciones registradas</div>
                  )}
                </div>
                {lastRun && <StatusChip status={lastRun.status} />}
              </div>

              {/* Last result */}
              {lastRun && lastRun.status === 'ok' && lastRun.result && (
                <div style={S({ background: '#0a0d18', borderRadius: 7, padding: '10px 14px', display: 'flex', gap: 20, flexWrap: 'wrap' })}>
                  {job.name === 'detect-performance' ? (
                    <>
                      <Metric label="Evaluadas"  value={String(lastRun.result.evaluated ?? 0)} />
                      <Metric label="A retirar"  value={String(lastRun.result.retiring  ?? 0)} color="#d94848" />
                      <Metric label="Duración"   value={dur(lastRun.duration)} color="#5a6480" />
                    </>
                  ) : job.name === 'detect-devices' ? (
                    <>
                      <Metric label="Móviles"   value={String(lastRun.result.evaluated ?? 0)} />
                      <Metric label="Cambiar"   value={String(lastRun.result.toChange  ?? 0)} color="#d94848" />
                      <Metric label="Duración"  value={dur(lastRun.duration)} color="#5a6480" />
                    </>
                  ) : job.name === 'ig-sync' ? (
                    <>
                      <Metric label="Sync"      value={String(lastRun.result.procesadas ?? 0)} />
                      <Metric label="Errores"   value={String(lastRun.result.errores    ?? 0)} color="#d94848" />
                      <Metric label="Duración"  value={dur(lastRun.duration)} color="#5a6480" />
                    </>
                  ) : job.name === 'promote-new-accounts' ? (
                    <>
                      <Metric label="Activadas" value={String(lastRun.result.promoted   ?? 0)} color="#34c759" />
                      <Metric label="Alertas"   value={String(lastRun.result.alerted    ?? 0)} color="#f5a623" />
                      <Metric label="Duración"  value={dur(lastRun.duration)} color="#5a6480" />
                    </>
                  ) : job.name === 'reel-compliance' ? (
                    <>
                      <Metric label="OK"         value={String(lastRun.result.compliant ?? 0)} color="#34c759" />
                      <Metric label="Pendientes" value={String(lastRun.result.missing   ?? 0)} color="#e05252" />
                      <Metric label="Duración"   value={dur(lastRun.duration)} color="#5a6480" />
                    </>
                  ) : null}
                </div>
              )}
              {lastRun && lastRun.status === 'error' && (
                <div style={S({ background: '#d9484810', border: '1px solid #d9484830', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: '#d94848', fontFamily: 'monospace', wordBreak: 'break-word' })}>
                  {lastRun.errorMessage ?? 'Error desconocido'}
                </div>
              )}

              {/* Flash message */}
              {flash && (
                <div style={S({ fontSize: 13, fontWeight: 700, color: flash.startsWith('✓') ? '#1fad6e' : '#d94848', background: flash.startsWith('✓') ? '#1fad6e10' : '#d9484810', borderRadius: 6, padding: '8px 12px' })}>
                  {flash}
                </div>
              )}

              {/* Config */}
              <div style={S({ borderTop: '1px solid #1a1f38', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 })}>
                <div style={S({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 })}>
                  <div>
                    <div style={S({ fontSize: 11, color: '#5a6480', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' })}>
                      Cron programado
                    </div>
                    <div style={S({ fontSize: 11, color: '#3a4464', marginTop: 2 })}>
                      Cada día a las <span style={S({ color: '#9aa4c0', fontFamily: 'monospace' })}>06:00 UTC</span>
                      {' · '}{nextRun(6)}
                    </div>
                  </div>
                  <div style={S({ fontSize: 10, color: '#2a3050', background: '#161b30', border: '1px solid #252d50', borderRadius: 5, padding: '4px 8px', whiteSpace: 'nowrap' })}>
                    vercel.json
                  </div>
                </div>

                <div style={S({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 })}>
                  <label style={S({ fontSize: 11, color: '#5a6480', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' })}>
                    Activado
                  </label>
                  <button
                    onClick={() => updateConfig(job.name, { enabled: !config.enabled })}
                    style={S({
                      width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                      background: config.enabled ? job.color : '#252d50', transition: 'background .2s',
                    })}
                  >
                    <span style={S({
                      position: 'absolute', top: 3, left: config.enabled ? 22 : 3, width: 16, height: 16,
                      borderRadius: '50%', background: '#fff', transition: 'left .2s',
                    })} />
                  </button>
                </div>

                <div style={S({ fontSize: 10, color: '#2a3050', fontStyle: 'italic' })}>
                  💡 Cambiar la hora requiere editar vercel.json y redesplegar (límite del plan Hobby).
                </div>
              </div>

              {/* Trigger button */}
              <button
                onClick={() => trigger(job.name)}
                disabled={running}
                style={S({
                  background: running ? '#111628' : job.color + '18',
                  border: `1px solid ${running ? '#1c2240' : job.color + '44'}`,
                  color: running ? '#3a4464' : job.color,
                  borderRadius: 7, padding: '9px 0', fontSize: 13, fontWeight: 800, cursor: running ? 'not-allowed' : 'pointer',
                  width: '100%', letterSpacing: '.02em',
                })}
              >
                {running ? '⏳ Ejecutando…' : '▶ Ejecutar ahora'}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── HEATMAP ──────────────────────────────────────────────────────── */}
      <div style={S({ background: '#0c0f1e', border: '1px solid #1a1f38', borderRadius: 10, padding: '20px 22px', marginBottom: 24 })}>
        <div style={S({ fontSize: 11, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 })}>
          Actividad — últimos 14 días
        </div>
        <div style={S({ display: 'grid', gridTemplateColumns: `120px repeat(${dates.length}, 1fr)`, gap: 4, alignItems: 'center' })}>
          {/* Header row: dates */}
          <div />
          {dates.map(d => {
            const label = new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
            const isToday = d === new Date().toISOString().split('T')[0]
            return (
              <div key={d} style={S({ fontSize: 9, color: isToday ? '#e9a82d' : '#2a3050', textAlign: 'center', fontWeight: isToday ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden' })}>
                {label}
              </div>
            )
          })}
          {/* Job rows */}
          {JOBS.map(job => (
            <>
              <div key={job.name + '-label'} style={S({ fontSize: 11, color: '#5a6480', fontWeight: 700, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>
                {job.icon} {job.label.split(' ').slice(-1)[0]}
              </div>
              {dates.map(d => {
                const s = heatmap[d]?.[job.name]
                const bg = s === 'ok' ? job.color + 'cc' : s === 'error' ? '#d94848cc' : '#1a1f38'
                const title = s === 'ok' ? 'Correcto' : s === 'error' ? 'Error' : 'Sin ejecución'
                return (
                  <div key={d} title={`${d}: ${title}`}
                    style={S({ height: 22, borderRadius: 4, background: bg, opacity: s ? 1 : 0.4 })} />
                )
              })}
            </>
          ))}
        </div>
        <div style={S({ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#3a4464' })}>
          <span><span style={S({ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#1fad6e', marginRight: 4 })} />OK</span>
          <span><span style={S({ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#d94848', marginRight: 4 })} />Error</span>
          <span><span style={S({ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#1a1f38', marginRight: 4 })} />Sin datos</span>
        </div>
      </div>

      {/* ── HISTORY TABLE ──────────────────────────────────────────────── */}
      <div style={S({ background: '#0c0f1e', border: '1px solid #1a1f38', borderRadius: 10, overflow: 'hidden' })}>
        <div style={S({ padding: '14px 22px', borderBottom: '1px solid #1a1f38', display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
          <div style={S({ fontSize: 11, fontWeight: 800, color: '#3a4464', textTransform: 'uppercase', letterSpacing: '.1em' })}>
            Historial de ejecuciones
          </div>
          <span style={S({ fontSize: 11, color: '#2a3050' })}>{runs.length} registros</span>
        </div>
        <div style={S({ overflowX: 'auto' })}>
          <table style={S({ width: '100%', borderCollapse: 'collapse' })}>
            <thead>
              <tr style={S({ borderBottom: '1px solid #1a1f38' })}>
                {['Fecha', 'Trabajo', 'Tipo', 'Estado', 'Resultado', 'Duración', ''].map(h => (
                  <th key={h} style={S({ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#2a3050', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' })}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={7} style={S({ padding: 32, textAlign: 'center', color: '#2a3050', fontSize: 13 })}>
                  Sin registros aún. Las ejecuciones aparecerán aquí tras crear las tablas SQL.
                </td></tr>
              )}
              {runs.map(run => {
                const job = JOBS.find(j => j.name === run.jobName)
                const isOpen = expanded === run.id
                return (
                  <>
                    <tr key={run.id} style={S({ borderBottom: '1px solid #10142a', cursor: 'pointer' })}
                      onClick={() => setExpanded(isOpen ? null : run.id)}>
                      <td style={S({ padding: '10px 14px', fontSize: 12, color: '#9aa4c0', fontFamily: 'monospace', whiteSpace: 'nowrap' })}>
                        {fmtDate(run.startedAt)}
                      </td>
                      <td style={S({ padding: '10px 14px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' })}>
                        <span style={S({ color: job?.color ?? '#7280a0' })}>{job?.icon} {job?.label ?? run.jobName}</span>
                      </td>
                      <td style={S({ padding: '10px 14px', fontSize: 11, color: run.triggeredBy === 'manual' ? '#e9a82d' : '#3a4464' })}>
                        {run.triggeredBy === 'manual' ? '▶ Manual' : '⏱ Cron'}
                      </td>
                      <td style={S({ padding: '10px 14px' })}><StatusChip status={run.status} /></td>
                      <td style={S({ padding: '10px 14px', fontSize: 12, color: '#7280a0', fontFamily: 'monospace' })}>
                        {run.status === 'ok' ? resultSummary(run) : run.status === 'error' ? 'Ver detalle ↓' : '—'}
                      </td>
                      <td style={S({ padding: '10px 14px', fontSize: 12, color: '#3a4464', fontFamily: 'monospace' })}>{dur(run.duration)}</td>
                      <td style={S({ padding: '10px 14px', fontSize: 11, color: '#2a3050' })}>{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr key={run.id + '-detail'} style={S({ borderBottom: '1px solid #10142a', background: '#0a0d18' })}>
                        <td colSpan={7} style={S({ padding: '14px 22px' })}>
                          {run.errorMessage && (
                            <div style={S({ fontFamily: 'monospace', fontSize: 12, color: '#d94848', background: '#d9484810', borderRadius: 6, padding: '10px 14px', marginBottom: 10 })}>
                              {run.errorMessage}
                            </div>
                          )}
                          {run.result && (
                            <pre style={S({ fontFamily: 'monospace', fontSize: 11, color: '#5a6480', background: '#060810', borderRadius: 6, padding: '12px 14px', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
                              {JSON.stringify(run.result, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color = '#e8ecf5' }: { label: string; value: string; color?: string }) {
  const S = (x: React.CSSProperties) => x
  return (
    <div>
      <div style={S({ fontSize: 10, color: '#3a4464', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 })}>{label}</div>
      <div style={S({ fontSize: 20, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' })}>{value}</div>
    </div>
  )
}
