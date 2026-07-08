'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Sale } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toaster'
import { Plus, DollarSign, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'

const STAGES = [
  { key: 'NEW', label: 'Nuevo', border: 'border-blue-500/30', bg: 'bg-blue-500/5', badge: 'bg-blue-500/15 text-blue-400' },
  { key: 'CONTACTED', label: 'Contactado', border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', badge: 'bg-yellow-500/15 text-yellow-400' },
  { key: 'INTERESTED', label: 'Interesado', border: 'border-orange-500/30', bg: 'bg-orange-500/5', badge: 'bg-orange-500/15 text-orange-400' },
  { key: 'OFFER', label: 'Oferta', border: 'border-purple-500/30', bg: 'bg-purple-500/5', badge: 'bg-purple-500/15 text-purple-400' },
  { key: 'CLOSED', label: 'Cerrado', border: 'border-green-500/30', bg: 'bg-green-500/5', badge: 'bg-green-500/15 text-green-400' },
  { key: 'LOST', label: 'Perdido', border: 'border-red-500/30', bg: 'bg-red-500/5', badge: 'bg-red-500/15 text-red-400' },
]

const schema = z.object({
  leadId: z.string().uuid('Selecciona un lead'),
  title: z.string().min(2, 'Mínimo 2 caracteres'),
  amount: z.coerce.number().optional(),
  stage: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'OFFER', 'CLOSED', 'LOST']),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

// ----------- Draggable card -----------
function KanbanCard({
  sale,
  onEdit,
  onDelete,
}: {
  sale: Sale
  onEdit: (s: Sale) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: sale.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={cn(
        'bg-card border border-border rounded-lg p-3 group',
        'hover:border-primary/30 transition-all shadow-sm',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{sale.title}</p>
          {sale.lead && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{sale.lead.name}</p>
          )}
          {sale.amount != null && sale.amount > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <DollarSign className="w-3 h-3 text-green-400" />
              <span className="text-xs font-semibold text-green-400">
                {sale.amount.toLocaleString('es-ES')} €
              </span>
            </div>
          )}
          {sale.notes && (
            <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">{sale.notes}</p>
          )}
        </div>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(sale)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(sale.id)}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ----------- Droppable column -----------
function KanbanColumn({
  stage,
  sales,
  onEdit,
  onDelete,
}: {
  stage: typeof STAGES[number]
  sales: Sale[]
  onEdit: (s: Sale) => void
  onDelete: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })
  const total = sales.reduce((acc, s) => acc + (s.amount ?? 0), 0)

  return (
    <div className="flex-shrink-0 w-60">
      <div
        ref={setNodeRef}
        className={cn(
          'border rounded-xl p-3 min-h-[220px] transition-colors',
          stage.border,
          stage.bg,
          isOver && 'ring-2 ring-primary/40',
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {stage.label}
          </h3>
          <div className="flex items-center gap-1.5">
            {total > 0 && (
              <span className="text-xs text-green-400 font-medium">
                {total.toLocaleString('es-ES')} €
              </span>
            )}
            <span className={cn('text-xs font-medium rounded-full px-2 py-0.5', stage.badge)}>
              {sales.length}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {sales.map((sale) => (
            <KanbanCard key={sale.id} sale={sale} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {sales.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50 border border-dashed border-border/50 rounded-lg">
              Sin oportunidades
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ----------- Ghost card for DragOverlay -----------
function GhostCard({ sale }: { sale: Sale }) {
  return (
    <div className="bg-card border border-primary/40 rounded-lg p-3 shadow-2xl rotate-1 w-60">
      <p className="text-sm font-medium text-foreground">{sale.title}</p>
      {sale.lead && <p className="text-xs text-muted-foreground mt-0.5">{sale.lead.name}</p>}
      {sale.amount != null && sale.amount > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <DollarSign className="w-3 h-3 text-green-400" />
          <span className="text-xs font-semibold text-green-400">{sale.amount.toLocaleString('es-ES')} €</span>
        </div>
      )}
    </div>
  )
}

// ----------- Main page -----------
export default function SalesPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [sales, setSales] = useState<Sale[]>([])
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([])
  const [channelId, setChannelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { stage: 'NEW' },
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchApi<Sale[]>(`/crm/sales?channelSlug=${channelSlug}`),
      fetchApi<{ data: { id: string; name: string }[] }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=200`),
      fetchApi<{ id: string; slug: string }[]>('/crm/channels/my'),
    ])
      .then(([salesRes, leadsRes, channels]) => {
        setSales(salesRes)
        setLeads(leadsRes.data)
        const ch = channels.find((c) => c.slug === channelSlug)
        if (ch) setChannelId(ch.id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditingSale(null)
    reset({ stage: 'NEW' })
    setDialogOpen(true)
  }

  const openEdit = (sale: Sale) => {
    setEditingSale(sale)
    reset({
      leadId: sale.leadId,
      title: sale.title,
      amount: sale.amount ?? undefined,
      stage: sale.stage,
      notes: sale.notes ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: FormData) => {
    try {
      if (editingSale) {
        await fetchApi(`/crm/sales/${editingSale.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        })
        toast('Venta actualizada', 'success')
      } else {
        await fetchApi('/crm/sales', {
          method: 'POST',
          body: JSON.stringify({ ...data, channelId }),
        })
        toast('Venta añadida al pipeline', 'success')
      }
      setDialogOpen(false)
      reset({ stage: 'NEW' })
      fetchData()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const deleteSale = async (id: string) => {
    if (!confirm('¿Eliminar esta oportunidad?')) return
    try {
      await fetchApi(`/crm/sales/${id}`, { method: 'DELETE' })
      toast('Oportunidad eliminada', 'success')
      fetchData()
    } catch {
      toast('Error al eliminar', 'error')
    }
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const saleId = String(active.id)
    const newStage = String(over.id)
    const sale = sales.find((s) => s.id === saleId)
    if (!sale || sale.stage === newStage) return

    setSales((prev) => prev.map((s) => s.id === saleId ? { ...s, stage: newStage as Sale['stage'] } : s))
    try {
      await fetchApi(`/crm/sales/${saleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      })
    } catch {
      fetchData()
      toast('Error al mover la tarjeta', 'error')
    }
  }

  const activeSale = activeId ? sales.find((s) => s.id === activeId) : null
  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)
  const totalRevenue = sales.filter((s) => s.stage === 'CLOSED').reduce((acc, s) => acc + (s.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ventas — {channelName}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sales.length} oportunidades
            {totalRevenue > 0 && (
              <span className="ml-2 text-green-400 font-medium">
                · {totalRevenue.toLocaleString('es-ES')} € cerrados
              </span>
            )}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nueva oportunidad
        </Button>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => (
            <div key={s.key} className="flex-shrink-0 w-60 h-64 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                sales={sales.filter((s) => s.stage === stage.key)}
                onEdit={openEdit}
                onDelete={deleteSale}
              />
            ))}
          </div>
          <DragOverlay>
            {activeSale ? <GhostCard sale={activeSale} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingSale ? 'Editar oportunidad' : 'Nueva oportunidad'}
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
            label="Título"
            {...register('title')}
            error={errors.title?.message}
            placeholder="Descripción de la oportunidad"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Importe (€)" type="number" step="0.01" {...register('amount')} placeholder="0.00" />
            <Select
              label="Etapa"
              options={STAGES.map((s) => ({ value: s.key, label: s.label }))}
              {...register('stage')}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notas</label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Notas adicionales..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {editingSale ? 'Guardar cambios' : 'Añadir al pipeline'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
