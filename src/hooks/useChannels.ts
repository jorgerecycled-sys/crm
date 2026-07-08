'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { useApi } from './useApi'
import { CrmChannel } from '@/types'

export function useChannels() {
  const { channels, setChannels, isAuthenticated } = useAuthStore()
  const { fetchApi } = useApi()

  useEffect(() => {
    if (isAuthenticated && channels.length === 0) {
      fetchApi<CrmChannel[]>('/crm/channels/my')
        .then(setChannels)
        .catch(console.error)
    }
  }, [isAuthenticated, channels.length, fetchApi, setChannels])

  return channels
}
