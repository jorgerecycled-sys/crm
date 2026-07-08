'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { Conversation } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { Plus, MessageSquare, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'

const schema = z.object({
  leadId: z.string().uuid('Selecciona un lead'),
  channelId: z.string().uuid(),
  message: z.string().min(1, 'El mensaje es requerido'),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
})

type FormData = z.infer<typeof schema>

export default function ConversationsPage() {
  const { channel: channelSlug } = useParams<{ channel: string }>()
  const { fetchApi } = useApi()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([])
  const [channelId, setChannelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { direction: 'OUTBOUND' },
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchApi<{ data: Conversation[] }>(`/crm/conversations?channelSlug=${channelSlug}&pageSize=50`).catch(() => ({ data: [] })),
      fetchApi<{ data: { id: string; name: string }[] }>(`/crm/leads?channelSlug=${channelSlug}&pageSize=100`),
      fetchApi<{ id: string; slug: string }[]>('/crm/channels/my'),
    ])
      .then(([convRes, leadsRes, channels]) => {
        setConversations(convRes.data)
        setLeads(leadsRes.data)
        const ch = channels.find((c) => c.slug === channelSlug)
        if (ch) setChannelId(ch.id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [channelSlug, fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const onSubmit = async (data: FormData) => {
    try {
      await fetchApi('/crm/conversations', {
        method: 'POST',
        body: JSON.stringify({ ...data, channelId }),
      })
      toast('Conversación registrada', 'success')
      setDialogOpen(false)
      reset({ direction: 'OUTBOUND' })
      fetchData()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const channelName = channelSlug.charAt(0).toUpperCase() + channelSlug.slice(1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conversaciones — {channelName}</h1>
          <p className="text-muted-foreground text-sm mt-1">{conversations.length} conversaciones registradas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Registrar conversación
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))
        ) : conversations.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Sin conversaciones registradas</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div key={conv.id} className="bg-card border border-border rounded-xl p-4 flex gap-4">
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                conv.direction === 'INBOUND' ? 'bg-blue-500/10' : 'bg-green-500/10'
              )}>
                {conv.direction === 'INBOUND'
                  ? <ArrowDownLeft className="w-4 h-4 text-blue-400" />
                  : <ArrowUpRight className="w-4 h-4 text-green-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {conv.lead?.name ?? 'Lead desconocido'}
                  </p>
                  <p className="text-xs text-muted-foreground shrink-0">{formatDateTime(conv.createdAt)}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{conv.message}</p>
                {conv.responsible && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Por: {conv.responsible.firstName} {conv.responsible.lastName}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Registrar conversación">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select
            label="Lead"
            options={leads.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Seleccionar lead"
            {...register('leadId')}
            error={errors.leadId?.message}
          />
          <Select
            label="Dirección"
            options={[
              { value: 'OUTBOUND', label: 'Saliente (nosotros → lead)' },
              { value: 'INBOUND', label: 'Entrante (lead → nosotros)' },
            ]}
            {...register('direction')}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Mensaje</label>
            <textarea
              {...register('message')}
              rows={4}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Contenido de la conversación..."
            />
            {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">Registrar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
