'use client'

import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Bell, User, ChevronDown, Menu } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useUIStore } from '@/store/ui'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

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
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-3 md:px-6 shrink-0 sticky top-0 z-30 gap-2">
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
        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative">
          <Bell className="w-4 h-4" />
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
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
