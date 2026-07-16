'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import { User } from '@/types'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Trash2, UserCheck, UserX, UserPlus } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/auth'

interface EmployeeName {
  id: string | null
  name: string
  firstName: string
  lastName: string
  email: string
  linkedAccounts: number
  hasLogin: boolean
}

const createSchema = z.object({
  firstName: z.string().min(1, 'Obligatorio'),
  lastName: z.string().optional().default(''),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  roleId: z.string().min(1, 'Selecciona un rol'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
})

const editSchema = createSchema.extend({
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

const selectStyle: React.CSSProperties = {
  background: '#0d1124', border: '1px solid #1c2240', borderRadius: 8,
  color: '#e8ecf5', padding: '8px 12px', fontSize: 13, outline: 'none',
  width: '100%', cursor: 'pointer', colorScheme: 'dark',
}

export default function UsersPage() {
  const { fetchApi } = useApi()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([])
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([])
  const [withoutAccount, setWithoutAccount] = useState<EmployeeName[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { status: 'ACTIVE' },
  })

  const fetchData = useCallback(() => {
    setLoading(true)
    const token = useAuthStore.getState().accessToken
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    Promise.all([
      fetchApi<{ data: User[] }>('/users?pageSize=100'),
      fetchApi<{ id: string; name: string }[]>('/users/roles'),
      fetchApi<{ id: string; name: string }[]>('/crm/channels'),
      fetch('/api/crm/instagram/employee-names', { headers: h })
        .then(r => r.json())
        .catch(() => ({ withoutAccount: [] })),
    ])
      .then(([usersRes, rolesRes, channelsRes, empRes]) => {
        setUsers(usersRes.data)
        setRoles(rolesRes)
        setChannels(channelsRes)
        const er = empRes as { withoutAccount: EmployeeName[] }
        setWithoutAccount(er.withoutAccount ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fetchApi])

  useEffect(() => { fetchData() }, [fetchData])

  function applyEmployee(emp: EmployeeName) {
    setSelectedEmployee(emp.name)
    setValue('firstName', emp.firstName)
    setValue('lastName', emp.lastName)
    setValue('email', emp.email ?? '')
    const empleadoRole = roles.find(r => r.name === 'Empleado')
    if (empleadoRole) setValue('roleId', empleadoRole.id)
  }

  function openCreateForEmployee(emp: EmployeeName) {
    setEditingUser(null)
    setSelectedChannels([])
    setSelectedEmployee('')
    reset({ status: 'ACTIVE', firstName: '', lastName: '', email: '', password: '', roleId: '' })
    setDialogOpen(true)
    setTimeout(() => applyEmployee(emp), 0)
  }

  const openCreate = () => {
    setEditingUser(null)
    setSelectedChannels([])
    setSelectedEmployee('')
    reset({ status: 'ACTIVE', firstName: '', lastName: '', email: '', password: '', roleId: '' })
    setDialogOpen(true)
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setSelectedEmployee('')
    setSelectedChannels(user.channelAccess?.map((a) => a.channelId) ?? [])
    reset({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: '',
      roleId: user.roleId,
      status: user.status,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: EditForm) => {
    try {
      const payload: Record<string, unknown> = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        roleId: data.roleId,
        status: data.status,
        channelIds: selectedChannels,
      }
      if (data.password) payload.password = data.password

      if (editingUser) {
        if (!data.password) delete payload.password
        await fetchApi(`/users/${editingUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        toast('Usuario actualizado', 'success')
      } else {
        payload.password = data.password
        await fetchApi('/users', { method: 'POST', body: JSON.stringify(payload) })
        toast('Usuario creado', 'success')
      }
      setDialogOpen(false)
      fetchData()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const deleteUser = async (id: string) => {
    if (!confirm('¿Eliminar este usuario?')) return
    try {
      await fetchApi(`/users/${id}`, { method: 'DELETE' })
      toast('Usuario eliminado', 'success')
      fetchData()
    } catch { toast('Error al eliminar', 'error') }
  }

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: 'Usuario',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {getInitials(row.original.firstName, row.original.lastName)}
          </div>
          <div>
            <p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: 'role', header: 'Rol', cell: ({ row }) => (
      <span className="text-xs font-medium text-foreground bg-secondary px-2 py-0.5 rounded-full">
        {row.original.role?.name ?? '—'}
      </span>
    )},
    { accessorKey: 'status', header: 'Estado', cell: ({ row }) => <Badge value={row.original.status} /> },
    {
      accessorKey: 'channelAccess',
      header: 'Canales',
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          {row.original.channelAccess?.map((a) => (
            <span key={a.channelId} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {a.channel?.name}
            </span>
          )) ?? <span className="text-muted-foreground text-xs">—</span>}
        </div>
      ),
    },
    { accessorKey: 'createdAt', header: 'Alta', cell: ({ row }) => formatDate(row.original.createdAt) },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)} title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => deleteUser(row.original.id)} title="Eliminar" className="text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-1">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* ── Sin acceso: empleados en IG sin cuenta de login ──────────── */}
      {!loading && withoutAccount.length > 0 && (
        <div style={{ background: '#0c0f1e', border: '1px solid #e9a82d44', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <UserX size={15} style={{ color: '#e9a82d' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e8ecf5' }}>Empleados sin acceso al sistema</span>
            <span style={{ fontSize: 11, background: '#e9a82d22', color: '#e9a82d', border: '1px solid #e9a82d44', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>
              {withoutAccount.length}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#7a8299', marginBottom: 12 }}>
            Estos empleados tienen cuentas IG asignadas pero no pueden iniciar sesión. Créales una cuenta.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {withoutAccount.map(emp => (
              <div key={emp.name} style={{ background: '#111628', border: '1px solid #e9a82d33', borderRadius: 9, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e9a82d18', border: '1px solid #e9a82d44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#e9a82d', flexShrink: 0 }}>
                  {emp.firstName.slice(0, 1)}{emp.lastName ? emp.lastName.slice(0, 1) : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e8ecf5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                  <div style={{ fontSize: 10, color: '#e9a82d', fontWeight: 600 }}>Sin acceso al sistema</div>
                </div>
                <button
                  onClick={() => openCreateForEmployee(emp)}
                  style={{ background: '#6272e4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  + Crear cuenta
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        data={users}
        columns={columns}
        searchPlaceholder="Buscar usuarios..."
        searchKey="email"
        isLoading={loading}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingUser ? 'Editar usuario' : 'Nuevo usuario'}
        className="max-w-xl"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Preseleccionado si se abrió desde un empleado sin cuenta */}
          {!editingUser && selectedEmployee && (
            <div style={{ background: '#6272e422', border: '1px solid #6272e444', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#9aa4c0' }}>
              Rellenando datos de <strong style={{ color: '#e8ecf5' }}>{selectedEmployee}</strong> · ajusta email y contraseña
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *" {...register('firstName')} error={errors.firstName?.message} placeholder="Nombre" />
            <Input label="Apellidos (opcional)" {...register('lastName')} error={errors.lastName?.message} placeholder="Apellidos" />
          </div>
          <Input label="Email" type="email" {...register('email')} error={errors.email?.message} placeholder="correo@empresa.com" />
          <Input
            label={editingUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            type="password"
            {...register('password')}
            error={errors.password?.message}
            placeholder="••••••••"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Rol"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              placeholder="Seleccionar rol"
              {...register('roleId')}
              error={errors.roleId?.message}
            />
            <Select
              label="Estado"
              options={[
                { value: 'ACTIVE', label: 'Activo' },
                { value: 'INACTIVE', label: 'Inactivo' },
                { value: 'SUSPENDED', label: 'Suspendido' },
              ]}
              {...register('status')}
            />
          </div>

          {/* Channel access */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Acceso a canales</label>
            <div className="grid grid-cols-2 gap-2">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => toggleChannel(ch.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedChannels.includes(ch.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {selectedChannels.includes(ch.id)
                    ? <UserCheck className="w-3.5 h-3.5" />
                    : <UserX className="w-3.5 h-3.5" />
                  }
                  {ch.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {editingUser ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
