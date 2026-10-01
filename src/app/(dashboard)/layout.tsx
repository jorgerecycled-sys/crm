'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useUIStore } from '@/store/ui'
import { useTokenRefresh } from '@/hooks/useTokenRefresh'
import { cn } from '@/lib/utils'

// Routes not yet migrated to the Velzon look: they hardcode a dark palette, so
// they keep rendering under the `.dark` token scope until they're restyled.
const LEGACY_DARK_ROUTES = [
  /^\/crm\/[^/]+\/(cuentas|empleados|estadisticas|ig-cuentas|modelos|moviles|tareas)(\/|$)/,
  /^\/(mejoras|pool-accounts|reeles|robot|users)(\/|$)/,
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated } = useAuthStore()
  const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUIStore()
  const router = useRouter()
  const pathname = usePathname()
  const legacyDark = LEGACY_DARK_ROUTES.some((re) => re.test(pathname))
  const [mounted, setMounted] = useState(false)
  useTokenRefresh()

  useEffect(() => { setMounted(true) }, [])

  // Toggled on <html> (not a wrapper) so portaled dialogs/toasts follow the page theme.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', legacyDark)
    return () => root.classList.remove('dark')
  }, [legacyDark])

  useEffect(() => {
    if (!mounted) return
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, mounted, router])

  if (!mounted) return null
  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <div
        className={cn(
          'flex flex-col flex-1 overflow-hidden transition-all duration-300',
          // Mobile: no left margin (sidebar overlays)
          'ml-0',
          // Desktop: margin matches sidebar width
          sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
        )}
      >
        <Header />
        <main className="flex-1 overflow-y-auto p-3 md:p-6 animate-fade-in bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}
