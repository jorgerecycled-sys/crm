'use client'

import { useEffect, useState, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { Lightbulb, Plus } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

interface Mejora {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  submittedById: string
  erp_users?: { firstName: string; lastName: string } | null
  adminNotes?: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  in_review:   { label: 'En revisión', color: '#5b8dd9', bg: 'rgba(91,141,217,0.12)' },
  in_progress: { label: 'En progreso', color: '#f5a623', bg: 'rgba(245,166,35,0.12)' },
  done:        { label: 'Completada',  color: '#34c759', bg: 'rgba(52,199,89,0.12)' },
  rejected:    { label: 'Descartada', color: '#e05252', bg: 'rgba(224,82,82,0.12)' },
}

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Baja',  color: '#6b7280' },
  medium: { label: 'Media', color: '#f5a623' },
  high:   { label: 'Alta',  color: '#e05252' },
}

const CAT_LABELS: Record<string, string> = {
  funcionalidad: 'Funcionalidad',
  ui:            'Interfaz',
  rendimiento:   'Rendimiento',
  otro:          'Otro',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `hace ${d}d`
  if (h > 0) return `hace ${h}h`
  if (m > 0) return `hace ${m}m`
  return 'ahora'
}

const SEL = {
  background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8,
  color: '#e8ecf5', fontSize: 13, outline: 'none', colorScheme: 'dark' as const,
  cursor: 'pointer', padding: '9px 12px', width: '100%',
}

export default function MejorasPage() {
  const { fetchApi } = useApi()
  const { user } = useAuthStore()
  const isAdmin = user?.roleName !== 'Empleado'

  const [mejoras, setMejoras] = useState<Mejora[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'funcionalidad', priority: 'medium' })
  const [submitting, setSubmitting] = useState(false)
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')

  const load = () => {
    setLoading(true)
    fetchApi<Mejora[]>('/mejoras')
      .then(setMejoras).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [fetchApi])

  const filtered = useMemo(() =>
    statusFilter ? mejoras.filter(m => m.status === statusFilter) : mejoras
  , [mejoras, statusFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of mejoras) c[m.status] = (c[m.status] ?? 0) + 1
    return c
  }, [mejoras])

  const onSubmit = async () => {
    if (form.title.trim().length < 5 || form.description.trim().length < 10) {
      toast('Título mínimo 5 caracteres, descripción mínimo 10', 'error')
      return
    }
    setSubmitting(true)
    try {
      await fetchApi('/mejoras', { method: 'POST', body: JSON.stringify(form) })
      toast('Mejora enviada', 'success')
      setShowForm(false)
      setForm({ title: '', description: '', category: 'funcionalidad', priority: 'medium' })
      load()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setSubmitting(false) }
  }

  const updateField = async (id: string, patch: Record<string, string>) => {
    try {
      await fetchApi(`/mejoras/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      setMejoras(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    } catch { toast('Error al actualizar', 'error') }
  }

  const saveNotes = async (id: string) => {
    await updateField(id, { adminNotes: notesValue })
    setEditingNotes(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Lightbulb size={20} color="#d4a843" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Mejoras de la app</h1>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>
              {isAdmin
                ? `${mejoras.length} sugerencia${mejoras.length !== 1 ? 's' : ''} recibida${mejoras.length !== 1 ? 's' : ''}`
                : 'Comparte ideas para mejorar la app'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: showForm ? '#b8902e' : '#d4a843', color: '#0d1124', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'background 0.15s' }}
        >
          <Plus size={15} />
          Nueva mejora
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#d4a843', marginBottom: 16 }}>Nueva sugerencia de mejora</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Título *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Añadir filtro de fechas en estadísticas"
                style={{ ...SEL, padding: '10px 12px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Descripción *</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Explica qué mejoraría, cómo funcionaría y por qué sería útil..."
                style={{ ...SEL, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Categoría</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={SEL}>
                  <option value="funcionalidad">Funcionalidad</option>
                  <option value="ui">Interfaz visual</option>
                  <option value="rendimiento">Rendimiento</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prioridad sugerida</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={SEL}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #1c2240', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={onSubmit}
                disabled={submitting}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#d4a843', color: '#0d1124', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Enviando…' : 'Enviar sugerencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[{ key: '', label: 'Todas', count: mejoras.length }, ...Object.entries(STATUS_CFG).map(([k, v]) => ({ key: k, label: v.label, count: counts[k] ?? 0 }))].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              borderColor: statusFilter === tab.key ? '#d4a843' : '#1c2240',
              background: statusFilter === tab.key ? 'rgba(212,168,67,0.1)' : 'transparent',
              color: statusFilter === tab.key ? '#d4a843' : 'var(--muted)',
            }}
          >
            {tab.label}{tab.count > 0 && <span style={{ marginLeft: 5, opacity: 0.65 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 180, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', opacity: 0.5 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--muted)' }}>
          <Lightbulb size={36} style={{ margin: '0 auto 14px', opacity: 0.25, display: 'block' }} />
          <div style={{ fontSize: 14 }}>{statusFilter ? 'Sin sugerencias en este estado' : '¡Aún no hay mejoras! Sé el primero en sugerir algo.'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {filtered.map(m => {
            const sc = STATUS_CFG[m.status] ?? STATUS_CFG.pending
            const pc = PRIORITY_CFG[m.priority] ?? PRIORITY_CFG.medium
            const submitter = m.erp_users ? `${m.erp_users.firstName} ${m.erp_users.lastName}` : ''
            return (
              <div key={m.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${sc.color}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Badges row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {isAdmin ? (
                    <>
                      <select
                        value={m.status}
                        onChange={e => updateField(m.id, { status: e.target.value })}
                        style={{ background: sc.bg, border: `1px solid ${sc.color}50`, borderRadius: 999, color: sc.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
                      >
                        {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <select
                        value={m.priority}
                        onChange={e => updateField(m.id, { priority: e.target.value })}
                        style={{ background: 'transparent', border: 'none', color: pc.color, fontSize: 11, fontWeight: 700, outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
                      >
                        {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>▲ {v.label}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <span style={{ background: sc.bg, border: `1px solid ${sc.color}50`, borderRadius: 999, color: sc.color, fontSize: 11, fontWeight: 700, padding: '3px 10px' }}>{sc.label}</span>
                      <span style={{ color: pc.color, fontSize: 11, fontWeight: 700 }}>▲ {pc.label}</span>
                    </>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '2px 8px', marginLeft: 'auto' }}>
                    {CAT_LABELS[m.category] ?? m.category}
                  </span>
                </div>

                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{m.title}</div>

                {/* Description */}
                <div style={{ fontSize: 12.5, color: '#8a96b3', lineHeight: 1.55 }}>{m.description}</div>

                {/* Admin notes */}
                {isAdmin && (
                  editingNotes === m.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <textarea
                        value={notesValue}
                        onChange={e => setNotesValue(e.target.value)}
                        rows={2}
                        placeholder="Nota interna (solo visible para admins)..."
                        style={{ width: '100%', background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8, padding: '8px 10px', color: '#e8ecf5', fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => saveNotes(m.id)} style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', background: '#d4a843', color: '#0d1124', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Guardar nota</button>
                        <button onClick={() => setEditingNotes(null)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #1c2240', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingNotes(m.id); setNotesValue(m.adminNotes ?? '') }}
                      style={{ width: '100%', textAlign: 'left', background: m.adminNotes ? 'rgba(212,168,67,0.05)' : 'rgba(255,255,255,0.02)', border: `1px ${m.adminNotes ? 'solid rgba(212,168,67,0.2)' : 'dashed #1c2240'}`, borderRadius: 8, padding: '8px 11px', color: m.adminNotes ? '#c9a94e' : '#3a4460', fontSize: 12, cursor: 'pointer', lineHeight: 1.4 }}
                    >
                      {m.adminNotes ?? '+ Añadir nota interna…'}
                    </button>
                  )
                )}

                {/* Note visible to the submitter */}
                {!isAdmin && m.adminNotes && (
                  <div style={{ background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: 8, padding: '8px 11px', fontSize: 12, color: '#d4a843', lineHeight: 1.4 }}>
                    💬 {m.adminNotes}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 2 }}>
                  <span>{isAdmin && submitter ? submitter : ''}</span>
                  <span>{relativeTime(m.createdAt)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
