'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  AlertCircle,
  Settings,
  ChevronDown,
  ChevronRight,
  BarChart3,
  MessageSquare,
  Target,
  CheckSquare,
  Clock,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  Instagram,
  Hash,
  Send,
  Music,
  Phone,
  Twitter,
  Facebook,
  MessageCircle,
  Smartphone,
  UserCheck,
  Star,
  Bot,
  Lightbulb,
  Film,
  Layers,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useUIStore } from '@/store/ui'
import { CrmChannel } from '@/types'

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  reddit: Hash,
  hash: Hash,
  telegram: Send,
  send: Send,
  discord: MessageCircle,
  'message-circle': MessageCircle,
  facebook: Facebook,
  whatsapp: Phone,
  phone: Phone,
  tiktok: Music,
  music: Music,
  x: Twitter,
  twitter: Twitter,
}

const STATS_CHANNELS = new Set(['instagram', 'reddit'])

const CRM_SUBMENU = [
  { label: 'Dashboard', href: 'dashboard', icon: LayoutDashboard },
  { label: 'Leads', href: 'leads', icon: Target },
  { label: 'Conversaciones', href: 'conversations', icon: MessageSquare },
  { label: 'Seguimientos', href: 'followups', icon: Clock },
  { label: 'Ventas', href: 'sales', icon: TrendingUp },
  { label: 'Tareas', href: 'tasks', icon: CheckSquare },
  { label: 'Reportes', href: 'reports', icon: BarChart3 },
]

const STATS_SUBMENU = [
  { label: 'Tareas del día', href: 'tareas', icon: CheckSquare },
  { label: 'Estadísticas',   href: 'estadisticas', icon: BarChart3 },
  { label: 'Cuentas',        href: 'cuentas', icon: Users },
  { label: 'Móviles',        href: 'moviles', icon: Smartphone },
  { label: 'Modelos',        href: 'modelos', icon: Star },
  { label: 'Empleados',      href: 'empleados', icon: UserCheck },
]

// ig-cuentas is the create/edit/delete CRUD page for Instagram accounts — only
// exists for that channel, so it's appended rather than living in STATS_SUBMENU.
const INSTAGRAM_MANAGE_ITEM = { label: 'Gestionar cuentas', href: 'ig-cuentas', icon: Trash2 }

const JAILBREAK_ACCOUNTS_SUBMENU = [
  { label: 'JailBreak',     href: 'jailbreak' },
  { label: 'Pool Accounts', href: 'pool' },
]

// Nested one level deeper than a normal channel sub-item — lives inside the
// Instagram channel's own submenu, not as a sidebar top-level section.
function JailBreakAccountsGroup({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname.startsWith('/pool-accounts')
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-all duration-150',
          isActive
            ? 'text-white font-medium bg-white/10'
            : 'text-sidebar-foreground hover:text-white hover:bg-white/5'
        )}
      >
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">JailBreak Accounts</span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-sidebar-foreground/50" />
        ) : (
          <ChevronRight className="w-3 h-3 text-sidebar-foreground/50" />
        )}
      </button>

      {open && (
        <div className="ml-4 mt-0.5 border-l border-sidebar-border pl-3 space-y-0.5">
          {JAILBREAK_ACCOUNTS_SUBMENU.map((item) => {
            const href = `/pool-accounts/${item.href}`
            const isItemActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={item.href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-all duration-150',
                  isItemActive
                    ? 'text-white font-medium bg-white/10'
                    : 'text-sidebar-foreground hover:text-white hover:bg-white/5'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface NavItemProps {
  href: string
  icon: React.ElementType
  label: string
  collapsed?: boolean
  onNavigate?: () => void
}

function NavItem({ href, icon: Icon, label, collapsed, onNavigate }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-accent/60',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

interface ChannelMenuProps {
  channel: CrmChannel
  collapsed: boolean
  onNavigate?: () => void
}

function ChannelMenu({ channel, collapsed, onNavigate }: ChannelMenuProps) {
  const pathname = usePathname()
  const channelBase = `/crm/${channel.slug}`
  const isChannelActive = pathname.startsWith(channelBase)
  const [open, setOpen] = useState(isChannelActive)

  const Icon = CHANNEL_ICONS[channel.icon] ?? CHANNEL_ICONS[channel.slug] ?? Hash

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150',
          isChannelActive
            ? 'text-white font-medium'
            : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-accent/60',
          collapsed && 'justify-center px-2'
        )}
        title={collapsed ? channel.name : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: channel.color }} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{channel.name}</span>
            {open ? (
              <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/50" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/50" />
            )}
          </>
        )}
      </button>

      {open && !collapsed && (
        <div className="ml-4 mt-0.5 border-l border-sidebar-border pl-3 space-y-0.5">
          {(STATS_CHANNELS.has(channel.slug)
            ? (channel.slug === 'instagram' ? [...STATS_SUBMENU, INSTAGRAM_MANAGE_ITEM] : STATS_SUBMENU)
            : CRM_SUBMENU)
            .map((item) => {
            const href = `${channelBase}/${item.href}`
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={item.href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-all duration-150',
                  isActive
                    ? 'text-white font-medium bg-white/10'
                    : 'text-sidebar-foreground hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
          {channel.slug === 'instagram' && (
            <JailBreakAccountsGroup onNavigate={onNavigate} />
          )}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { channels, user } = useAuthStore()
  const { sidebarCollapsed, toggleCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUIStore()

  return (
    <aside
      className={cn(
        'theme-light fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-40 shadow-[0_1px_20px_rgba(64,81,137,0.15)]',
        // Desktop: width based on collapsed state
        sidebarCollapsed ? 'md:w-[70px]' : 'md:w-[250px]',
        // Mobile: always full width, slides in/out
        'w-72 md:translate-x-0',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 h-[70px] shrink-0 border-b border-sidebar-border',
        sidebarCollapsed && 'md:justify-center md:px-0'
      )}>
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-white/10">
          <Image src="/logo.ico" alt="Logo" width={32} height={32} className="w-7 h-7 object-contain" />
        </div>
        <div className={cn('overflow-hidden', sidebarCollapsed && 'md:hidden')}>
          <p className="text-base font-semibold leading-tight text-white tracking-wide">ERP CRM Pro</p>
          <p className="text-[11px] text-sidebar-foreground/70 truncate">{user?.email}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {user?.roleName !== 'Empleado' && (
          <NavItem
            href="/dashboard"
            icon={LayoutDashboard}
            label="Resumen"
            collapsed={sidebarCollapsed}
            onNavigate={closeMobileSidebar}
          />
        )}

        {/* CRM Section */}
        {channels.length > 0 && (
          <div>
            <p className={cn(
              'px-3 pt-4 pb-2 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-[0.1em]',
              sidebarCollapsed ? 'md:hidden' : ''
            )}>
              CRM
            </p>
            {sidebarCollapsed && <div className="border-t border-sidebar-border my-2 hidden md:block" />}
            <div className="space-y-0.5">
              {channels.map((channel) => (
                <ChannelMenu
                  key={channel.id}
                  channel={channel}
                  collapsed={sidebarCollapsed}
                  onNavigate={closeMobileSidebar}
                />
              ))}
            </div>
          </div>
        )}

        {/* Incidencias y Mejoras — visible para todos los roles */}
        <NavItem href="/incidents" icon={AlertCircle} label="Incidencias" collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
        <NavItem href="/mejoras" icon={Lightbulb} label="Mejoras" collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />

        {/* Main sections — hidden for Empleado role */}
        {user?.roleName !== 'Empleado' && (
          <>
            <p className={cn(
              'px-3 pt-4 pb-2 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-[0.1em]',
              sidebarCollapsed ? 'md:hidden' : ''
            )}>
              Gestión
            </p>
            {sidebarCollapsed && <div className="border-t border-sidebar-border my-2 hidden md:block" />}
            <NavItem href="/robot"     icon={Bot}         label="Robot"         collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
            <NavItem href="/reeles"    icon={Film}        label="Reels diarios" collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
            <NavItem href="/users"     icon={Users}       label="Usuarios"      collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
            <NavItem href="/admin"     icon={Settings}    label="Administración" collapsed={sidebarCollapsed} onNavigate={closeMobileSidebar} />
          </>
        )}
      </nav>

      {/* Collapse toggle — desktop only */}
      <div className="p-3 border-t border-sidebar-border hidden md:block">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-white hover:bg-sidebar-accent/60 transition-all text-sm"
          title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>Colapsar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
