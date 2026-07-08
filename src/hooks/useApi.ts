'use client'

import { useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'

// Deduplicate concurrent refresh calls — one in-flight refresh serves all waiters
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = await res.json()
      return (data.accessToken as string) ?? null
    })
    .catch(() => null)
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

export function useApi() {
  const { logout } = useAuthStore()
  const router = useRouter()

  const fetchApi = useCallback(
    async <T>(
      endpoint: string,
      options: RequestInit = {}
    ): Promise<T> => {
      // Always read latest token from store (not stale closure value)
      const token = useAuthStore.getState().accessToken
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api${endpoint}`, { ...options, headers })

      if (res.status === 401) {
        const { refreshToken } = useAuthStore.getState()
        if (refreshToken) {
          const newToken = await refreshAccessToken(refreshToken)
          if (newToken) {
            useAuthStore.getState().setAccessToken(newToken)
            const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` }
            const retry = await fetch(`/api${endpoint}`, { ...options, headers: retryHeaders })
            if (retry.ok) return retry.json() as Promise<T>
            if (retry.status !== 401) {
              const err = await retry.json().catch(() => ({ error: 'Unknown error' }))
              throw new Error(err.error || `HTTP ${retry.status}`)
            }
          }
        }
        logout()
        router.push('/login')
        throw new Error('Unauthorized')
      }

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `HTTP ${res.status}`)
      }

      return res.json()
    },
    [logout, router]
  )

  return { fetchApi }
}
