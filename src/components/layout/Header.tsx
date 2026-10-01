'use client'

import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Bell, User, ChevronDown, Menu, AlertTriangle, Clock, Maximize2, Minimize2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { useUIStore } from '@/store/ui'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: 'suspended' | 'shadow_banned' | 'pool_expiring'
  message: string
  href: string
}

const NOTIF_ICON: Record<Notification['type'], React.ElementType> = {
  suspended: AlertTriangle,
  shadow_banned: AlertTriangle,
  pool_expiring: Clock,
}
const NOTIF_COLOR: Record<Notification['type'], string> = {
  suspended: '#e05252',
  shadow_banned: '#f5a623',
  pool_expiring: '#d4a843',
}

const BREADCRUMB_MAP: Record<string, string> = {
  dashboard: 'Resumen',
  crm: 'CRM',
  instagram: 'Instagram',
  reddit: 'Reddit',
  telegram: 'Telegram',
  discord: 'Discord',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  x: 'X',
  leads: 'Leads',
  conversations: 'Conversaciones',
  followups: 'Seguimientos',
  sales: 'Ventas',
  tasks: 'Tareas',
  reports: 'Reportes',
  users: 'Usuarios',
  incidents: 'Incidencias',
  admin: 'Administración',
  channels: 'Canales',
  new: 'Nuevo',
  edit: 'Editar',
}

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { toggleMobileSidebar } = useUIStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen().catch(() => {})
  }

  const loadNotifications = useCallback(() => {
    const token = useAuthStore.getState().accessToken
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setNotifications(d.notifications ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadNotifications])

  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map((s) => BREADCRUMB_MAP[s] ?? s)
  // On mobile show only the last breadcrumb to save space
  const lastCrumb = breadcrumbs[breadcrumbs.length - 1] ?? ''

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {}
    logout()
    router.push('/login')
  }

  const initials = user
    ? getInitials(
        (user as unknown as { firstName: string }).firstName ?? 'U',
        (user as unknown as { lastName: string }).lastName ?? 'U'
      )
    : 'U'

  return (
    <header className="theme-light h-[70px] bg-card text-foreground shadow-[0_1px_2px_rgba(56,65,74,0.15)] flex items-center justify-between px-3 md:px-6 shrink-0 sticky top-0 z-30 gap-2">
      {/* Left: hamburger (mobile) + breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggleMobileSidebar}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumbs — desktop: full path, mobile: last segment only */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          {/* Desktop */}
          <span className="hidden md:flex items-center gap-1.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                <span className={cn(i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {crumb}
                </span>
              </span>
            ))}
          </span>
          {/* Mobile */}
          <span className="md:hidden text-foreground font-medium truncate">{lastCrumb}</span>
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={toggleFullscreen}
          className="hidden md:flex p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {fullscreen ? <Minimize2 className="w-[18px] h-[18px]" /> : <Maximize2 className="w-[18px] h-[18px]" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative"
          >
            <Bell className="w-[18px] h-[18px]" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
                {notifications.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-80 max-w-[90vw] bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in max-h-96 overflow-y-auto">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                  Notificaciones {notifications.length > 0 ? `(${notifications.length})` : ''}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-muted-foreground text-center">Sin novedades</div>
                ) : (
                  notifications.map(n => {
                    const Icon = NOTIF_ICON[n.type]
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); router.push(n.href) }}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left border-b border-border last:border-0"
                      >
                        <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: NOTIF_COLOR[n.type] }} />
                        <span className="min-w-0">{n.message}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2 md:px-3 h-[70px] bg-accent/60 hover:bg-accent transition-colors ml-2"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-foreground leading-tight">
                {(user as unknown as { firstName: string })?.firstName ?? ''}{' '}
                {(user as unknown as { lastName: string })?.lastName ?? ''}
              </p>
              <p className="text-xs text-muted-foreground leading-tight">{user?.roleName}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                  onClick={() => { setDropdownOpen(false); router.push('/profile') }}
                >
                  <User className="w-4 h-4" />
                  Mi perfil
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
