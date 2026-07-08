'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Followup } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toaster'
import { Plus, Clock, CheckCircle2, XCircle, Trash2, Pencil, CalendarClock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'

const schema = z.object({
  leadId: z.string().uuid('Selecciona un lead'),
  scheduledAt: z.string().min(1, 'Fecha requerida'),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function isOverdue(scheduledAt: string, status: string) {
  return status === 'PENDING' && new Date(scheduledAt) < new Date()
}

export default function FollowupsPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [followups, setFollowups] = useState<Followup[]>([])
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([])
  const [channelId, setChannelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFollowup, setEditingFollowup] = useState<Followup | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchApi<{ data: Followup[] }>(`/crm/followups?channelSlug=${channelSlug}&pageSize=100`).catch(() => ({ data: [] })),
      fetchApi<{ data: { id: string; name: string }[] }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=200`),
      fetchApi<{ id: string; slug: string }[]>('/crm/channels/my'),
    ])
      .then(([fRes, lRes, channels]) => {
        setFollowups(fRes.data)
        setLeads(lRes.data)
        const ch = channels.find((c) => c.slug === channelSlug)
        if (ch) setChannelId(ch.id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditingFollowup(null)
    reset()
    setDialogOpen(true)
  }

  const openEdit = (f: Followup) => {
    setEditingFollowup(f)
    reset({
      leadId: f.leadId,
      scheduledAt: f.scheduledAt.slice(0, 16),
      notes: f.notes ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload = { ...data, channelId, scheduledAt: new Date(data.scheduledAt).toISOString() }
      if (editingFollowup) {
        await fetchApi(`/crm/followups/${editingFollowup.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ scheduledAt: payload.scheduledAt, notes: data.notes }),
        })
        toast('Seguimiento actualizado', 'success')
      } else {
        await fetchApi('/crm/followups', { method: 'POST', body: JSON.stringify(payload) })
        toast('Seguimiento programado', 'success')
      }
      setDialogOpen(false)
      reset()
      fetchData()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const changeStatus = async (id: string, status: 'COMPLETED' | 'CANCELLED' | 'PENDING') => {
    const labels: Record<string, string> = {
      COMPLETED: 'Seguimiento completado',
      CANCELLED: 'Seguimiento cancelado',
      PENDING: 'Seguimiento reabierto',
    }
    try {
      await fetchApi(`/crm/followups/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast(labels[status], 'success')
      fetchData()
    } catch {
      toast('Error al actualizar', 'error')
    }
  }

  const deleteFollowup = async (id: string) => {
    if (!confirm('¿Eliminar este seguimiento?')) return
    try {
      await fetchApi(`/crm/followups/${id}`, { method: 'DELETE' })
      toast('Seguimiento eliminado', 'success')
      fetchData()
    } catch {
      toast('Error al eliminar', 'error')
    }
  }

  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)

  const filtered = filter === 'ALL' ? followups : followups.filter((f) => f.status === filter)
  const pendingCount = followups.filter((f) => f.status === 'PENDING').length
  const overdueCount = followups.filter((f) => isOverdue(f.scheduledAt, f.status)).length

  const FILTER_TABS = [
    { key: 'ALL', label: `Todos (${followups.length})` },
    { key: 'PENDING', label: `Pendientes (${pendingCount})` },
    { key: 'COMPLETED', label: 'Completados' },
    { key: 'CANCELLED', label: 'Cancelados' },
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Seguimientos — {channelName}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {followups.length} seguimientos
            {overdueCount > 0 && (
              <span className="ml-2 text-orange-400 font-medium">· {overdueCount} vencidos</span>
            )}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Programar seguimiento
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              filter === tab.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Sin seguimientos en este estado</p>
          </div>
        ) : (
          filtered.map((f) => {
            const overdue = isOverdue(f.scheduledAt, f.status)
            return (
              <div
                key={f.id}
                className={cn(
                  'bg-card border rounded-xl p-4 flex items-center justify-between gap-4 group transition-colors',
                  overdue ? 'border-orange-500/30 bg-orange-500/5' : 'border-border',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    f.status === 'COMPLETED' ? 'bg-green-500/10' :
                    f.status === 'CANCELLED' ? 'bg-gray-500/10' :
                    overdue ? 'bg-orange-500/10' : 'bg-primary/10',
                  )}>
                    <Clock className={cn(
                      'w-4 h-4',
                      f.status === 'COMPLETED' ? 'text-green-400' :
                      f.status === 'CANCELLED' ? 'text-gray-400' :
                      overdue ? 'text-orange-400' : 'text-primary',
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{f.lead?.name ?? 'Lead desconocido'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={cn('text-xs', overdue ? 'text-orange-400 font-medium' : 'text-muted-foreground')}>
                        {overdue && '⚠ '}
                        {formatDateTime(f.scheduledAt)}
                      </p>
                      {f.responsible && (
                        <span className="text-xs text-muted-foreground/60">
                          · {f.responsible.firstName} {f.responsible.lastName}
                        </span>
                      )}
                    </div>
                    {f.notes && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate max-w-sm">{f.notes}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge value={f.status} />

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {f.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => changeStatus(f.id, 'COMPLETED')}
                          title="Completar"
                          className="p-1.5 rounded-md hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => changeStatus(f.id, 'CANCELLED')}
                          title="Cancelar"
                          className="p-1.5 rounded-md hover:bg-gray-500/10 text-muted-foreground hover:text-gray-400 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(f)}
                          title="Editar"
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {(f.status === 'COMPLETED' || f.status === 'CANCELLED') && (
                      <button
                        onClick={() => changeStatus(f.id, 'PENDING')}
                        title="Reabrir"
                        className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteFollowup(f.id)}
                      title="Eliminar"
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingFollowup ? 'Editar seguimiento' : 'Programar seguimiento'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select
            label="Lead"
            options={leads.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Seleccionar lead"
            {...register('leadId')}
            error={errors.leadId?.message}
          />
          <Input
            label="Fecha y hora"
            type="datetime-local"
            {...register('scheduledAt')}
            error={errors.scheduledAt?.message}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notas</label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors resize-none"
              placeholder="Notas del seguimiento..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {editingFollowup ? 'Guardar' : 'Programar'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
