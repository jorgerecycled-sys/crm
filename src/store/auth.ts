import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthUser, CrmChannel } from '@/types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  channels: CrmChannel[]
  isAuthenticated: boolean
  setAuth: (user: AuthUser, accessToken: string, refreshToken?: string) => void
  setAccessToken: (token: string) => void
  setChannels: (channels: CrmChannel[]) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      channels: [],
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken: refreshToken ?? null, isAuthenticated: true }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setChannels: (channels) => set({ channels }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, channels: [], isAuthenticated: false }),
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        channels: state.channels,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
