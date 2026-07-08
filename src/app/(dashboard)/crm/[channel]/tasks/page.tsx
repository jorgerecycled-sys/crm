'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Task } from '@/types'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
  dueDate: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function TasksPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [tasks, setTasks] = useState<Task[]>([])
  const [channelId, setChannelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', status: 'TODO' },
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchApi<{ data: Task[] }>(`/crm/tasks?channelSlug=${channelSlug}&pageSize=100`),
      fetchApi<{ id: string; slug: string }[]>('/crm/channels/my'),
    ])
      .then(([res, channels]) => {
        setTasks(res.data)
        const ch = channels.find((c) => c.slug === channelSlug)
        if (ch) setChannelId(ch.id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditingTask(null)
    reset({ priority: 'MEDIUM', status: 'TODO' })
    setDialogOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    reset({ title: task.title, description: task.description ?? '', priority: task.priority, status: task.status, dueDate: task.dueDate ? task.dueDate.slice(0, 16) : '' })
    setDialogOpen(true)
  }

  const onSubmit = async (data: FormData) => {
    try {
      const payload = { ...data, channelId, dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined }
      if (editingTask) {
        await fetchApi(`/crm/tasks/${editingTask.id}`, { method: 'PATCH', body: JSON.stringify(data) })
        toast('Tarea actualizada', 'success')
      } else {
        await fetchApi('/crm/tasks', { method: 'POST', body: JSON.stringify(payload) })
        toast('Tarea creada', 'success')
      }
      setDialogOpen(false)
      fetchData()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const deleteTask = async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return
    try {
      await fetchApi(`/crm/tasks/${id}`, { method: 'DELETE' })
      toast('Tarea eliminada', 'success')
      fetchData()
    } catch { toast('Error al eliminar', 'error') }
  }

  const columns: ColumnDef<Task>[] = [
    { accessorKey: 'title', header: 'Tarea', cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.title}</p>
        {row.original.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{row.original.description}</p>}
      </div>
    )},
    { accessorKey: 'status', header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
    { accessorKey: 'priority', header: 'Prioridad', cell: ({ row }) => <Badge value={row.original.priority} type="priority" /> },
    { accessorKey: 'dueDate', header: 'Vencimiento', cell: ({ row }) => row.original.dueDate ? formatDate(row.original.dueDate) : <span className="text-muted-foreground">—</span> },
    { accessorKey: 'assignedTo', header: 'Responsable', cell: ({ row }) => row.original.assignedTo ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}` : <span className="text-muted-foreground">—</span> },
    { id: 'actions', header: '', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}><Pencil className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" onClick={() => deleteTask(row.original.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    )},
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tareas — {channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)}</h1>
          <p className="text-muted-foreground text-sm mt-1">{tasks.length} tareas</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nueva tarea</Button>
      </div>
      <DataTable data={tasks} columns={columns} searchPlaceholder="Buscar tareas..." searchKey="title" isLoading={loading} />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingTask ? 'Editar tarea' : 'Nueva tarea'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Título" {...register('title')} error={errors.title?.message} placeholder="Título de la tarea" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Descripción</label>
            <textarea {...register('description')} rows={2} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Prioridad" options={[{value:'LOW',label:'Baja'},{value:'MEDIUM',label:'Media'},{value:'HIGH',label:'Alta'},{value:'CRITICAL',label:'Crítica'}]} {...register('priority')} />
            <Select label="Estado" options={[{value:'TODO',label:'Por hacer'},{value:'IN_PROGRESS',label:'En progreso'},{value:'DONE',label:'Completada'},{value:'CANCELLED',label:'Cancelada'}]} {...register('status')} />
          </div>
          <Input label="Fecha límite" type="datetime-local" {...register('dueDate')} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">{editingTask ? 'Guardar' : 'Crear tarea'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
