'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { Incident } from '@/types'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Eye, MessageSquare, AlertCircle } from 'lucide-react'
import { formatDateTime, cn } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(5, 'Mínimo 5 caracteres'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
  category: z.enum(['TECHNICAL', 'COMMERCIAL', 'CLIENT', 'ADMINISTRATION', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
})

type CreateForm = z.infer<typeof createSchema>

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: 'Técnica', COMMERCIAL: 'Comercial', CLIENT: 'Cliente',
  ADMINISTRATION: 'Administración', OTHER: 'Otra',
}

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Abierta' },
  { value: 'REVIEWING', label: 'En revisión' },
  { value: 'IN_PROGRESS', label: 'En proceso' },
  { value: 'RESOLVED', label: 'Resuelta' },
  { value: 'CLOSED', label: 'Cerrada' },
]

export default function IncidentsPage() {
  const { fetchApi } = useApi()
  const { user } = useAuthStore()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [comment, setComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string; phoneRef: string | null }[]>([])
  const [selectedCuenta, setSelectedCuenta] = useState('')
  const [selectedMovil, setSelectedMovil] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'MEDIUM', category: 'TECHNICAL' },
  })

  const fetchIncidents = useCallback(() => {
    setLoading(true)
    fetchApi<{ data: Incident[] }>('/incidents?pageSize=100')
      .then((res) => setIncidents(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fetchApi])

  useEffect(() => { fetchIncidents() }, [fetchIncidents])

  useEffect(() => {
    if (user?.roleName !== 'Empleado') return
    const token = useAuthStore.getState().accessToken
    fetch('/api/crm/instagram/stats', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(d => setIgAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [user?.roleName])

  const phoneRefs = useMemo(() => {
    const refs = new Set<string>()
    for (const a of igAccounts) { if (a.phoneRef) refs.add(a.phoneRef) }
    return [...refs].sort()
  }, [igAccounts])

  const openDetail = async (incident: Incident) => {
    try {
      const full = await fetchApi<Incident>(`/incidents/${incident.id}`)
      setSelectedIncident(full)
      setDetailOpen(true)
    } catch { toast('Error al cargar incidencia', 'error') }
  }

  const onSubmit = async (data: CreateForm) => {
    try {
      let { description } = data
      const refs: string[] = []
      if (selectedCuenta) refs.push(`Cuenta: @${selectedCuenta}`)
      if (selectedMovil) refs.push(`Móvil: ${selectedMovil}`)
      if (refs.length) description = `${description}\n\n— ${refs.join(' | ')}`
      await fetchApi('/incidents', { method: 'POST', body: JSON.stringify({ ...data, description }) })
      toast('Incidencia creada', 'success')
      setCreateOpen(false)
      reset()
      setSelectedCuenta('')
      setSelectedMovil('')
      fetchIncidents()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetchApi(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast('Estado actualizado', 'success')
      fetchIncidents()
      if (selectedIncident) {
        setSelectedIncident((prev) => prev ? { ...prev, status: status as Incident['status'] } : prev)
      }
    } catch { toast('Error al actualizar', 'error') }
  }

  const addComment = async () => {
    if (!comment.trim() || !selectedIncident) return
    setAddingComment(true)
    try {
      await fetchApi(`/incidents/${selectedIncident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      })
      toast('Comentario añadido', 'success')
      setComment('')
      const full = await fetchApi<Incident>(`/incidents/${selectedIncident.id}`)
      setSelectedIncident(full)
    } catch { toast('Error al añadir comentario', 'error') }
    finally { setAddingComment(false) }
  }

  const columns: ColumnDef<Incident>[] = [
    {
      accessorKey: 'title',
      header: 'Incidencia',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.title}</p>
          <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[row.original.category]}</p>
        </div>
      ),
    },
    { accessorKey: 'status', header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
    { accessorKey: 'priority', header: 'Prioridad', cell: ({ row }) => <Badge value={row.original.priority} type="priority" /> },
    {
      accessorKey: 'reportedBy',
      header: 'Reportado por',
      cell: ({ row }) => row.original.reportedBy
        ? `${row.original.reportedBy.firstName} ${row.original.reportedBy.lastName}`
        : '—',
    },
    { accessorKey: 'createdAt', header: 'Fecha', cell: ({ row }) => formatDateTime(row.original.createdAt) },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => openDetail(row.original)} title="Ver detalle">
          <Eye className="w-3.5 h-3.5" />
        </Button>
      ),
    },
  ]

  const PRIORITY_BORDER: Record<string, string> = {
    LOW: 'border-l-gray-400', MEDIUM: 'border-l-blue-400',
    HIGH: 'border-l-orange-400', CRITICAL: 'border-l-red-500',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidencias</h1>
          <p className="text-muted-foreground text-sm mt-1">{incidents.length} incidencias registradas</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Nueva incidencia
        </Button>
      </div>

      <DataTable
        data={incidents}
        columns={columns}
        searchPlaceholder="Buscar incidencias..."
        searchKey="title"
        isLoading={loading}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva incidencia">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Título" {...register('title')} error={errors.title?.message} placeholder="Descripción breve del problema" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Descripción detallada</label>
            <textarea
              {...register('description')}
              rows={4}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Describe el problema con detalle..."
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>
          {(igAccounts.length > 0 || phoneRefs.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Cuenta afectada <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <select
                  value={selectedCuenta}
                  onChange={e => setSelectedCuenta(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  <option value="">Sin cuenta específica</option>
                  {igAccounts.map(a => (
                    <option key={a.id} value={a.username}>@{a.username}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Móvil afectado <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <select
                  value={selectedMovil}
                  onChange={e => setSelectedMovil(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  <option value="">Sin móvil específico</option>
                  {phoneRefs.map(ref => (
                    <option key={ref} value={ref}>{ref}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Categoría"
              options={[
                { value: 'TECHNICAL', label: 'Técnica' },
                { value: 'COMMERCIAL', label: 'Comercial' },
                { value: 'CLIENT', label: 'Cliente' },
                { value: 'ADMINISTRATION', label: 'Administración' },
                { value: 'OTHER', label: 'Otra' },
              ]}
              {...register('category')}
            />
            <Select
              label="Prioridad"
              options={[
                { value: 'LOW', label: 'Baja' },
                { value: 'MEDIUM', label: 'Media' },
                { value: 'HIGH', label: 'Alta' },
                { value: 'CRITICAL', label: 'Crítica' },
              ]}
              {...register('priority')}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">Crear incidencia</Button>
          </div>
        </form>
      </Dialog>

      {/* Detail dialog */}
      {selectedIncident && (
        <Dialog
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={selectedIncident.title}
          className="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Status & priority */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge value={selectedIncident.status} />
              <Badge value={selectedIncident.priority} type="priority" />
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[selectedIncident.category]}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(selectedIncident.createdAt)}</span>
            </div>

            {/* Description */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-foreground">{selectedIncident.description}</p>
            </div>

            {/* Reported by */}
            {selectedIncident.reportedBy && (
              <p className="text-xs text-muted-foreground">
                Reportado por: <span className="text-foreground">{selectedIncident.reportedBy.firstName} {selectedIncident.reportedBy.lastName}</span>
              </p>
            )}

            {/* Change status */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cambiar estado</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateStatus(selectedIncident.id, opt.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      selectedIncident.status === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Comentarios</h4>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedIncident.comments?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin comentarios</p>
                )}
                {selectedIncident.comments?.map((c) => (
                  <div key={c.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">
                        {c.user?.firstName} {c.user?.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Añadir comentario..."
                  className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                />
                <Button onClick={addComment} loading={addingComment} size="sm">
                  Añadir
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
