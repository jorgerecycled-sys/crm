'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

// ── types ──────────────────────────────────────────────────────────────────
interface Task {
  id: string
  fecha: string
  employeeId: string
  phoneRef: string
  accountId: string | null
  username: string | null
  tipo: 'crear_cuenta' | 'reel' | 'historia'
  num: number
  status: 'pendiente' | 'hecha'
  doneAt: string | null
}

interface Summary {
  total: number
  done: number
  byEmployee: Record<string, { total: number; done: number }>
}

// ── helpers ──────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function taskLabel(tipo: string, num: number) {
  if (tipo === 'crear_cuenta') return '+ Crear cuenta'
  if (tipo === 'reel')    return `Reel ${num}`
  if (tipo === 'historia') return `Historia ${num}`
  return tipo
}

function taskColor(tipo: string) {
  if (tipo === 'crear_cuenta') return '#e9a82d'
  if (tipo === 'reel')    return '#6272e4'
  if (tipo === 'historia') return '#00c896'
  return '#7280a0'
}

function ProgressRing({ pct, size = 38 }: { pct: number; size?: number }) {
  const stroke = 3.5, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const dash = Math.min(1, pct / 100) * circ
  const color = pct >= 100 ? '#1fad6e' : pct >= 50 ? '#e9a82d' : '#6272e4'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1c2240" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round" />
    </svg>
  )
}

// ── main component ──────────────────────────────────────────────────────────
export default function TareasPage() {
  const { channel } = useParams<{ channel: string }>()
  const router = useRouter()
  const isEmpleado = useAuthStore(s => s.user?.roleName) === 'Empleado'
  const [tasks, setTasks]       = useState<Task[]>([])
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [fecha, setFecha]       = useState(today())
  const [empFilter, setEmpFilter] = useState('')
  const [loading, setLoading]   = useState(true)
  const [missingSQL, setMissingSQL] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [genMsg, setGenMsg]       = useState('')

  const headers = () => {
    const token = useAuthStore.getState().accessToken
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const h = headers()
    const params = new URLSearchParams({ fecha })
    if (empFilter) params.set('employeeId', empFilter)
    const r = await fetch(`/api/crm/instagram/tasks?${params}`, { headers: h })
    const d = await r.json() as { tasks?: Task[]; summary?: Summary; missing?: boolean }
    if (d.missing) setMissingSQL(true)
    setTasks(d.tasks ?? [])
    setSummary(d.summary ?? null)
    setLoading(false)
  }, [fecha, empFilter])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function toggleTask(id: string, current: 'pendiente' | 'hecha') {
    const newStatus = current === 'hecha' ? 'pendiente' : 'hecha'
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, doneAt: newStatus === 'hecha' ? new Date().toISOString() : null } : t))
    setSummary(prev => {
      if (!prev) return prev
      const task = tasks.find(t => t.id === id)
      if (!task) return prev
      const delta = newStatus === 'hecha' ? 1 : -1
      const emp = task.employeeId
      return {
        ...prev,
        done: prev.done + delta,
        byEmployee: {
          ...prev.byEmployee,
          [emp]: { ...prev.byEmployee[emp], done: (prev.byEmployee[emp]?.done ?? 0) + delta },
        },
      }
    })
    const h = headers()
    await fetch('/api/crm/instagram/tasks', {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ id, status: newStatus }),
    })
  }

  async function generateTasks() {
    setGenerating(true)
    const h = headers()
    const r = await fetch(`/api/cron/generate-tasks?fecha=${fecha}&trigger=manual`, { headers: h })
    const d = await r.json() as Record<string, unknown>
    setGenMsg(d.ok ? `✓ ${d.generated} tareas generadas para ${d.employees} empleados` : `✗ ${d.error}`)
    setTimeout(() => setGenMsg(''), 6000)
    setGenerating(false)
    loadTasks()
  }

  async function deleteTasks(regenerar: boolean) {
    const accion = regenerar ? 'borrar y regenerar' : 'borrar'
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} todas las tareas del ${fecha}? Las marcadas como hechas también se borrarán.`)) return
    setDeleting(true)
    const h = headers()
    const r = await fetch(`/api/crm/instagram/tasks?fecha=${fecha}&regenerar=${regenerar}`, { method: 'DELETE', headers: h })
    const d = await r.json() as Record<string, unknown>
    if (d.ok) {
      setGenMsg(regenerar
        ? `✓ Tareas borradas y regeneradas: ${d.generated} nuevas`
        : `✓ Tareas de ${fecha} borradas`)
    } else {
      setGenMsg(`✗ ${d.error}`)
    }
    setTimeout(() => setGenMsg(''), 6000)
    setDeleting(false)
    loadTasks()
  }

  // Group: employee → phone → account → tasks
  const grouped = useMemo(() => {
    const byEmp = new Map<string, Map<string, Map<string | null, Task[]>>>()
    for (const t of tasks) {
      if (!byEmp.has(t.employeeId)) byEmp.set(t.employeeId, new Map())
      const byPhone = byEmp.get(t.employeeId)!
      if (!byPhone.has(t.phoneRef)) byPhone.set(t.phoneRef, new Map())
      const byAcc = byPhone.get(t.phoneRef)!
      const accKey = t.accountId ?? '__crear__'
      if (!byAcc.has(accKey)) byAcc.set(accKey, [])
      byAcc.get(accKey)!.push(t)
    }
    return byEmp
  }, [tasks])

  const employees = Array.from(grouped.keys()).sort()
  const allEmployees = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) s.add(t.employeeId)
    return Array.from(s).sort()
  }, [tasks])

  const pct = summary ? Math.round((summary.done / Math.max(summary.total, 1)) * 100) : 0

  const S = (x: React.CSSProperties) => x

  return (
    <div style={S({ padding: '24px 28px', maxWidth: 900, margin: '0 auto' })}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={S({ marginBottom: 22 })}>
        <div style={S({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 })}>
          <div>
            <h1 style={S({ fontSize: 22, fontWeight: 900, color: '#e8ecf5', letterSpacing: '-.02em', margin: 0 })}>Tareas del día</h1>
            <p style={S({ fontSize: 13, color: '#5a6480', marginTop: 3 })}>{fmtDate(fecha)}</p>
          </div>
          <div style={S({ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' })}>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={S({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 6, color: '#e8ecf5', padding: '6px 10px', fontSize: 13 })} />
            {!isEmpleado && (
              <>
                <button onClick={generateTasks} disabled={generating || deleting}
                  style={S({ background: '#e9a82d18', border: '1px solid #e9a82d44', color: '#e9a82d', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
                  {generating ? '⏳' : '▶'} Generar tareas
                </button>
                {tasks.length > 0 && (
                  <>
                    <button onClick={() => deleteTasks(true)} disabled={generating || deleting}
                      style={S({ background: '#6272e418', border: '1px solid #6272e444', color: '#6272e4', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
                      {deleting ? '⏳' : '↺'} Regenerar
                    </button>
                    <button onClick={() => deleteTasks(false)} disabled={generating || deleting}
                      style={S({ background: '#d9484810', border: '1px solid #d9484833', color: '#d94848', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' })}>
                      🗑 Borrar
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {genMsg && (
          <div style={S({ marginTop: 10, background: genMsg.startsWith('✓') ? '#1fad6e10' : '#d9484810', border: `1px solid ${genMsg.startsWith('✓') ? '#1fad6e33' : '#d9484833'}`, borderRadius: 7, padding: '9px 14px', fontSize: 13, color: genMsg.startsWith('✓') ? '#1fad6e' : '#d94848' })}>
            {genMsg}
          </div>
        )}
      </div>

      {missingSQL && (
        <div style={S({ background: '#e9a82d0f', border: '1px solid #e9a82d33', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#e9a82d' })}>
          ⚠ Tabla ig_daily_tasks no existe. Ejecuta <code style={S({ fontFamily: 'monospace' })}>supabase/daily_tasks.sql</code> en Supabase. Después pulsa "Generar tareas".
        </div>
      )}

      {/* ── PROGRESS BAR ───────────────────────────────────────────────── */}
      {summary && summary.total > 0 && (
        <div style={S({ background: '#0c0f1e', border: '1px solid #1a1f38', borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 })}>
          <ProgressRing pct={pct} size={44} />
          <div style={S({ flex: 1 })}>
            <div style={S({ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 })}>
              <span style={S({ fontSize: 22, fontWeight: 900, color: '#e8ecf5', fontVariantNumeric: 'tabular-nums' })}>{summary.done}</span>
              <span style={S({ fontSize: 13, color: '#5a6480' })}>/ {summary.total} tareas completadas</span>
              <span style={S({ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: pct >= 100 ? '#1fad6e' : '#e9a82d' })}>{pct}%</span>
            </div>
            <div style={S({ background: '#1a1f38', borderRadius: 4, height: 6, overflow: 'hidden' })}>
              <div style={S({ height: '100%', borderRadius: 4, background: pct >= 100 ? '#1fad6e' : '#6272e4', width: `${pct}%`, transition: 'width .4s ease' })} />
            </div>
          </div>
        </div>
      )}

      {/* ── FILTERS ────────────────────────────────────────────────────── */}
      {!isEmpleado && (
        <div style={S({ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' })}>
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
            style={S({ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, color: '#e8ecf5', padding: '8px 14px', fontSize: 13, outline: 'none', minWidth: 200, cursor: 'pointer', colorScheme: 'dark' })}>
            <option value="">Todos los empleados</option>
            {allEmployees.map(e => {
              const n = tasks.filter(t => t.employeeId === e).length
              const d = tasks.filter(t => t.employeeId === e && t.status === 'hecha').length
              return <option key={e} value={e}>{e} ({d}/{n})</option>
            })}
          </select>
          {empFilter && (
            <button onClick={() => setEmpFilter('')}
              style={S({ background: 'transparent', border: '1px solid #1c2240', borderRadius: 8, color: '#5a6480', padding: '8px 12px', fontSize: 12, cursor: 'pointer' })}>
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── TASK LIST ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={S({ textAlign: 'center', color: '#3a4464', padding: 48, fontSize: 14 })}>Cargando tareas…</div>
      ) : employees.length === 0 ? (
        <div style={S({ textAlign: 'center', color: '#3a4464', padding: 64 })}>
          <div style={S({ fontSize: 36, marginBottom: 12 })}>📋</div>
          <div style={S({ fontSize: 15, fontWeight: 700, color: '#5a6480', marginBottom: 6 })}>Sin tareas para hoy</div>
          <div style={S({ fontSize: 13, color: '#3a4464' })}>Pulsa "Generar tareas" para crear las tareas del día según las cuentas activas.</div>
        </div>
      ) : (
        <div style={S({ display: 'flex', flexDirection: 'column', gap: 16 })}>
          {employees.map(emp => {
            const empTasks = tasks.filter(t => t.employeeId === emp)
            const empDone  = empTasks.filter(t => t.status === 'hecha').length
            const empPct   = Math.round((empDone / Math.max(empTasks.length, 1)) * 100)
            const byPhone  = grouped.get(emp)!

            return (
              <div key={emp} style={S({ background: '#0c0f1e', border: '1px solid #1a1f38', borderRadius: 10, overflow: 'hidden' })}>
                {/* Employee header */}
                <div style={S({ padding: '12px 18px', background: '#0a0d18', borderBottom: '1px solid #1a1f38', display: 'flex', alignItems: 'center', gap: 12 })}>
                  <div style={S({ width: 32, height: 32, borderRadius: '50%', background: '#6272e422', border: '1px solid #6272e444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#6272e4', flexShrink: 0 })}>
                    {emp.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={S({ flex: 1 })}>
                    <div style={S({ fontSize: 14, fontWeight: 800, color: '#e8ecf5' })}>{emp}</div>
                    <div style={S({ fontSize: 11, color: '#5a6480' })}>{empDone}/{empTasks.length} tareas</div>
                  </div>
                  <div style={S({ display: 'flex', alignItems: 'center', gap: 8 })}>
                    <ProgressRing pct={empPct} size={30} />
                    <span style={S({ fontSize: 13, fontWeight: 800, color: empPct >= 100 ? '#1fad6e' : '#e9a82d' })}>{empPct}%</span>
                  </div>
                </div>

                {/* Phones */}
                <div style={S({ padding: '8px 0' })}>
                  {Array.from(byPhone.entries()).map(([phoneRef, byAcc]) => {
                    const phoneTasks = Array.from(byAcc.values()).flat()
                    const phoneDone  = phoneTasks.filter(t => t.status === 'hecha').length
                    return (
                      <div key={phoneRef} style={S({ padding: '8px 18px 12px' })}>
                        {/* Phone label */}
                        <div style={S({ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 })}>
                          <span style={S({ fontSize: 11 })}>📱</span>
                          <button onClick={() => router.push(`/crm/${channel}/moviles?movil=${encodeURIComponent(phoneRef)}`)} style={{ fontSize: 12, fontWeight: 800, color: '#5b8dd9', letterSpacing: '.02em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{phoneRef}</button>
                          <span style={S({ fontSize: 10, color: '#3a4464' })}>{phoneDone}/{phoneTasks.length}</span>
                          <div style={S({ flex: 1, height: 1, background: '#1a1f38' })} />
                        </div>

                        {/* Accounts */}
                        <div style={S({ display: 'flex', flexDirection: 'column', gap: 6 })}>
                          {Array.from(byAcc.entries()).map(([accKey, accTasks]) => {
                            const isCreate = accKey === '__crear__'
                            const username = accTasks[0]?.username
                            const allDone  = accTasks.every(t => t.status === 'hecha')
                            const accDone  = accTasks.filter(t => t.status === 'hecha').length

                            return (
                              <div key={accKey} style={S({
                                background: allDone ? '#0f1f1866' : '#111628',
                                border: `1px solid ${allDone ? '#1fad6e22' : '#1a1f38'}`,
                                borderRadius: 8, padding: '10px 14px',
                                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                              })}>
                                {/* Account label */}
                                <div style={S({ minWidth: 160, flex: '0 0 auto' })}>
                                  {isCreate ? (
                                    <span style={S({ fontSize: 13, fontWeight: 700, color: '#e9a82d' })}>+ Crear cuenta nueva</span>
                                  ) : (
                                    <button onClick={() => username && router.push(`/crm/${channel}/estadisticas?cuenta=${encodeURIComponent(username)}`)} style={{ fontSize: 13, fontWeight: 700, color: allDone ? '#1fad6e' : '#e8ecf5', background: 'none', border: 'none', cursor: username ? 'pointer' : 'default', padding: 0 }}>@{username}</button>
                                  )}
                                  <span style={S({ fontSize: 10, color: '#3a4464', marginLeft: 6 })}>{accDone}/{accTasks.length}</span>
                                </div>

                                {/* Task checkboxes */}
                                <div style={S({ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 })}>
                                  {accTasks.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.num - b.num).map(task => {
                                    const done = task.status === 'hecha'
                                    const color = taskColor(task.tipo)
                                    return (
                                      <button
                                        key={task.id}
                                        onClick={() => toggleTask(task.id, task.status)}
                                        title={done ? `Hecha${task.doneAt ? ' · ' + new Date(task.doneAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Marcar como hecha'}
                                        style={S({
                                          display: 'inline-flex', alignItems: 'center', gap: 6,
                                          background: done ? color + '22' : '#0c0f1e',
                                          border: `1px solid ${done ? color + '66' : '#252d50'}`,
                                          borderRadius: 6, padding: '5px 10px',
                                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                          color: done ? color : '#5a6480',
                                          textDecoration: done ? 'line-through' : 'none',
                                          transition: 'all .15s',
                                        })}
                                      >
                                        <span style={S({ fontSize: 13, lineHeight: 1 })}>{done ? '✓' : '○'}</span>
                                        {taskLabel(task.tipo, task.num)}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
