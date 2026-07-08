import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-secret-change-in-production-32chars'
)
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? 'fallback-refresh-change-in-production-32chars'
)

export interface JWTPayload {
  sub: string
  email: string
  roleId: string
  roleName: string
  type: 'access' | 'refresh'
  iat?: number
  exp?: number
}

export async function signAccessToken(payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>) {
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? '15m')
    .sign(JWT_SECRET)
}

export async function signRefreshToken(payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>) {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRES_IN ?? '7d')
    .sign(JWT_REFRESH_SECRET)
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  return payload as unknown as JWTPayload
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_REFRESH_SECRET)
  return payload as unknown as JWTPayload
}
