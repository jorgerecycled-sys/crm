'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Lead } from '@/types'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const leadSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  username: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'CLOSED', 'LOST']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  notes: z.string().optional(),
})

type LeadForm = z.infer<typeof leadSchema>

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'INTERESTED', label: 'Interesado' },
  { value: 'NEGOTIATING', label: 'Negociación' },
  { value: 'CLOSED', label: 'Cerrado' },
  { value: 'LOST', label: 'Perdido' },
]

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
]

export default function LeadsPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [channelId, setChannelId] = useState<string>('')

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: { status: 'NEW', priority: 'MEDIUM' },
  })

  const fetchLeads = useCallback(() => {
    setLoading(true)
    fetchApi<{ data: Lead[] }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=100`)
      .then((res) => setLeads(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  const fetchChannelId = useCallback(() => {
    fetchApi<{ id: string; slug: string }[]>('/crm/channels/my')
      .then((channels) => {
        const ch = channels.find((c: { slug: string }) => c.slug === channelSlug)
        if (ch) setChannelId(ch.id)
      })
      .catch(console.error)
  }, [channelSlug, fetchApi])

  useEffect(() => {
    fetchLeads()
    fetchChannelId()
  }, [fetchLeads, fetchChannelId])

  const openCreate = () => {
    setEditingLead(null)
    reset({ status: 'NEW', priority: 'MEDIUM' })
    setDialogOpen(true)
  }

  const openEdit = (lead: Lead) => {
    setEditingLead(lead)
    reset({
      name: lead.name,
      username: lead.username ?? '',
      status: lead.status,
      priority: lead.priority,
      notes: lead.notes ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: LeadForm) => {
    try {
      if (editingLead) {
        await fetchApi(`/crm/leads/${editingLead.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        })
        toast('Lead actualizado correctamente', 'success')
      } else {
        await fetchApi('/crm/leads', {
          method: 'POST',
          body: JSON.stringify({ ...data, channelId }),
        })
        toast('Lead creado correctamente', 'success')
      }
      setDialogOpen(false)
      fetchLeads()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const deleteLead = async (id: string) => {
    if (!confirm('¿Eliminar este lead?')) return
    try {
      await fetchApi(`/crm/leads/${id}`, { method: 'DELETE' })
      toast('Lead eliminado', 'success')
      fetchLeads()
    } catch {
      toast('Error al eliminar', 'error')
    }
  }

  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)

  const columns: ColumnDef<Lead>[] = [
    { accessorKey: 'name', header: 'Nombre', cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.name}</p>
        {row.original.username && <p className="text-xs text-muted-foreground">{row.original.username}</p>}
      </div>
    )},
    { accessorKey: 'status', header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
    { accessorKey: 'priority', header: 'Prioridad', cell: ({ row }) => <Badge value={row.original.priority} type="priority" /> },
    { accessorKey: 'assignedTo', header: 'Responsable', cell: ({ row }) => row.original.assignedTo
      ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}`
      : <span className="text-muted-foreground">—</span>
    },
    { accessorKey: 'createdAt', header: 'Creado', cell: ({ row }) => formatDate(row.original.createdAt) },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)} title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteLead(row.original.id)} title="Eliminar" className="text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads — {channelName}</h1>
          <p className="text-muted-foreground text-sm mt-1">{leads.length} leads en total</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo lead
        </Button>
      </div>

      <DataTable
        data={leads}
        columns={columns}
        searchPlaceholder="Buscar leads..."
        searchKey="name"
        isLoading={loading}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingLead ? 'Editar lead' : 'Nuevo lead'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre" {...register('name')} error={errors.name?.message} placeholder="Nombre del lead" />
          <Input label="Usuario / Handle" {...register('username')} placeholder="@usuario" />
          <Select
            label="Estado"
            options={STATUS_OPTIONS}
            {...register('status')}
            error={errors.status?.message}
          />
          <Select
            label="Prioridad"
            options={PRIORITY_OPTIONS}
            {...register('priority')}
            error={errors.priority?.message}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notas</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Notas adicionales..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {editingLead ? 'Guardar cambios' : 'Crear lead'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
