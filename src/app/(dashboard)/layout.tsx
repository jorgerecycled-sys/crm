'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { useUIStore } from '@/store/ui'
import { useTokenRefresh } from '@/hooks/useTokenRefresh'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated } = useAuthStore()
  const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUIStore()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useTokenRefresh()

  useEffect(() => { setMounted(true) }, [])

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
        <main className="flex-1 overflow-y-auto p-3 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
