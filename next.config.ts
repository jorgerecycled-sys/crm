import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client'],
  images: {
    remotePatterns: [{ hostname: 'avatars.githubusercontent.com' }],
  },
}

export default nextConfig
