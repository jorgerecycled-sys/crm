'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { User, KeyRound, Shield, Layers } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getInitials } from '@/lib/utils'
import { CrmChannel } from '@/types'

const profileSchema = z.object({
  firstName: z.string().min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().min(2, 'Mínimo 2 caracteres'),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Requerida'),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string().min(8),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

interface MeData {
  id: string
  email: string
  firstName: string
  lastName: string
  status: string
  role: { name: string }
  permissions: string[]
  channels: CrmChannel[]
}

export default function ProfilePage() {
  const { fetchApi } = useApi()
  const { user } = useAuthStore()
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)

  const {
    register: regProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    formState: { errors: errProfile, isSubmitting: submittingProfile },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) })

  const {
    register: regPwd,
    handleSubmit: handlePwd,
    reset: resetPwd,
    formState: { errors: errPwd, isSubmitting: submittingPwd },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  useEffect(() => {
    fetchApi<MeData>('/auth/me')
      .then((data) => {
        setMe(data)
        resetProfile({ firstName: data.firstName, lastName: data.lastName })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSaveProfile = async (data: ProfileForm) => {
    try {
      await fetchApi('/auth/me', { method: 'PATCH', body: JSON.stringify(data) })
      setMe((prev) => prev ? { ...prev, ...data } : prev)
      toast('Perfil actualizado', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const onChangePassword = async (data: PasswordForm) => {
    try {
      await fetchApi('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      })
      resetPwd()
      toast('Contraseña actualizada', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const initials = me ? getInitials(me.firstName, me.lastName) : (user ? '?' : '?')

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi perfil</h1>
        <p className="text-muted-foreground text-sm mt-1">Gestiona tu información personal y contraseña</p>
      </div>

      {/* Avatar + role */}
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground shrink-0">
          {loading ? '?' : initials}
        </div>
        <div>
          {loading ? (
            <div className="space-y-2">
              <div className="h-5 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">{me?.firstName} {me?.lastName}</p>
              <p className="text-sm text-muted-foreground">{me?.email}</p>
              <span className="inline-block mt-1 text-xs font-medium bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                {me?.role?.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Información personal</h2>
        </div>
        <form onSubmit={handleProfile(onSaveProfile)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              {...regProfile('firstName')}
              error={errProfile.firstName?.message}
              placeholder="Nombre"
            />
            <Input
              label="Apellidos"
              {...regProfile('lastName')}
              error={errProfile.lastName?.message}
              placeholder="Apellidos"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              value={me?.email ?? ''}
              disabled
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">El email no se puede modificar desde aquí</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={submittingProfile} size="sm">
              Guardar cambios
            </Button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Cambiar contraseña</h2>
        </div>
        <form onSubmit={handlePwd(onChangePassword)} className="space-y-4">
          <Input
            label="Contraseña actual"
            type="password"
            {...regPwd('currentPassword')}
            error={errPwd.currentPassword?.message}
            placeholder="••••••••"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nueva contraseña"
              type="password"
              {...regPwd('newPassword')}
              error={errPwd.newPassword?.message}
              placeholder="••••••••"
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              {...regPwd('confirmPassword')}
              error={errPwd.confirmPassword?.message}
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={submittingPwd} size="sm" variant="outline">
              Cambiar contraseña
            </Button>
          </div>
        </form>
      </div>

      {/* Permissions & channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Permisos</h2>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-5 bg-muted rounded animate-pulse" />)}</div>
          ) : (
            <div className="space-y-1.5">
              {me?.permissions.map((p) => (
                <div key={p} className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded font-mono">
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Canales asignados</h2>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
          ) : me?.channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin canales asignados</p>
          ) : (
            <div className="space-y-2">
              {me?.channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: ch.color }} />
                  <span className="text-foreground">{ch.name}</span>
                  <span className="text-muted-foreground/50 text-xs">/{ch.slug}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
