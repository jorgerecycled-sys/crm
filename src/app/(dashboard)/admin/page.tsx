'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import { CrmChannel } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import {
  Plus, Pencil, Power, PowerOff, Settings, Globe,
  Instagram, Hash, Send, MessageCircle, Facebook, Phone, Music, Twitter,
  Youtube, Linkedin, Mail, Globe2, ShoppingBag, Megaphone, Bot,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'

const ICON_OPTIONS = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'hash', label: 'Reddit / Discord', Icon: Hash },
  { key: 'send', label: 'Telegram', Icon: Send },
  { key: 'message-circle', label: 'WhatsApp / Chat', Icon: MessageCircle },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'phone', label: 'Teléfono', Icon: Phone },
  { key: 'music', label: 'TikTok', Icon: Music },
  { key: 'twitter', label: 'X / Twitter', Icon: Twitter },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'mail', label: 'Email', Icon: Mail },
  { key: 'globe', label: 'Web', Icon: Globe2 },
  { key: 'shopping-bag', label: 'E-commerce', Icon: ShoppingBag },
  { key: 'megaphone', label: 'Publicidad', Icon: Megaphone },
  { key: 'bot', label: 'Bot / Automatización', Icon: Bot },
]

const ICON_MAP: Record<string, React.ElementType> = Object.fromEntries(
  ICON_OPTIONS.map(({ key, Icon }) => [key, Icon])
)

const channelSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  icon: z.string().min(1, 'Selecciona un icono'),
  color: z.string().default('#6366f1'),
})

type ChannelForm = z.infer<typeof channelSchema>

export default function AdminPage() {
  const { fetchApi } = useApi()
  const [channels, setChannels] = useState<(CrmChannel & { _count?: { leads: number; userAccess: number } })[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<CrmChannel | null>(null)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    defaultValues: { color: '#6366f1', icon: 'hash' },
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    fetchApi<typeof channels>('/crm/channels')
      .then(setChannels)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditingChannel(null)
    reset({ color: '#6366f1', icon: 'hash' })
    setDialogOpen(true)
  }

  const openEdit = (ch: CrmChannel) => {
    setEditingChannel(ch)
    reset({ name: ch.name, slug: ch.slug, icon: ch.icon, color: ch.color })
    setDialogOpen(true)
  }

  const onSubmit = async (data: ChannelForm) => {
    try {
      if (editingChannel) {
        await fetchApi(`/crm/channels/${editingChannel.id}`, { method: 'PATCH', body: JSON.stringify(data) })
        toast('Canal actualizado', 'success')
      } else {
        await fetchApi('/crm/channels', { method: 'POST', body: JSON.stringify(data) })
        toast('Canal creado', 'success')
      }
      setDialogOpen(false)
      fetchData()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const toggleActive = async (ch: CrmChannel) => {
    try {
      await fetchApi(`/crm/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ active: !ch.active }) })
      toast(ch.active ? 'Canal desactivado' : 'Canal activado', 'success')
      fetchData()
    } catch { toast('Error al actualizar canal', 'error') }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Administración</h1>
        <p className="text-muted-foreground text-sm mt-1">Configuración global del sistema</p>
      </div>

      {/* CRM Channels section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Canales CRM</h2>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Nuevo canal
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
            ))
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className={cn(
                'bg-card border rounded-xl p-5 flex flex-col gap-3 transition-opacity',
                !ch.active && 'opacity-60',
                'border-border'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: ch.color + '20' }}
                    >
                      {(() => { const ChannelIcon = ICON_MAP[ch.icon] ?? Hash; return <ChannelIcon className="w-5 h-5" style={{ color: ch.color }} /> })()}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">/{ch.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(ch)} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActive(ch)}
                      title={ch.active ? 'Desactivar' : 'Activar'}
                      className={ch.active ? 'text-green-400 hover:text-green-400' : 'text-muted-foreground'}
                    >
                      {ch.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {ch._count && (
                    <>
                      <span>{ch._count.leads} leads</span>
                      <span>{ch._count.userAccess} usuarios con acceso</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    ch.active
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-gray-500/10 text-gray-400'
                  )}>
                    {ch.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* System info */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Sistema</h2>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Versión</span>
              <span className="text-foreground font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Stack</span>
              <span className="text-foreground font-medium">Next.js 15 + PostgreSQL</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Canales activos</span>
              <span className="text-foreground font-medium">{channels.filter((c) => c.active).length}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Canales totales</span>
              <span className="text-foreground font-medium">{channels.length}</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingChannel ? 'Editar canal' : 'Nuevo canal CRM'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Nombre" {...register('name')} error={errors.name?.message} placeholder="ej: Instagram" />
          <Input
            label="Slug (URL)"
            {...register('slug')}
            error={errors.slug?.message}
            placeholder="ej: instagram"
            disabled={!!editingChannel}
          />

          {/* Icon picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Icono</label>
            <div className="grid grid-cols-5 gap-2">
              {ICON_OPTIONS.map(({ key, label, Icon }) => {
                const selected = watch('icon') === key
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    onClick={() => setValue('icon', key)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="truncate w-full text-center text-[10px]">{label.split('/')[0]}</span>
                  </button>
                )
              })}
            </div>
            {errors.icon && <p className="text-xs text-destructive">{errors.icon.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Color del canal</label>
            <input
              type="color"
              {...register('color')}
              className="w-full h-9 px-2 py-1 bg-input border border-border rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {editingChannel ? 'Guardar' : 'Crear canal'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
