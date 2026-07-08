'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'

function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function useTokenRefresh() {
  useEffect(() => {
    async function checkAndRefresh() {
      const { accessToken, refreshToken, setAccessToken, logout } = useAuthStore.getState()
      if (!accessToken || !refreshToken) return

      const exp = getTokenExp(accessToken)
      if (exp === null) return

      const secondsLeft = exp - Math.floor(Date.now() / 1000)
      // Refresh if less than 3 minutes remain
      if (secondsLeft > 180) return

      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) {
          if (secondsLeft <= 0) logout()
          return
        }
        const { accessToken: newToken } = await res.json()
        if (newToken) setAccessToken(newToken)
      } catch {
        // Network error — don't force logout, user may be offline briefly
      }
    }

    // Check immediately on mount, then every 60 seconds
    checkAndRefresh()
    const interval = setInterval(checkAndRefresh, 60_000)
    return () => clearInterval(interval)
  }, [])
}
