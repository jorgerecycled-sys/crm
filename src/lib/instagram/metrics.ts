// Instagram account health calculation — ported from crm-miami-v2

const REACH_PCT = 0.20
const UMBRAL_ABS = 5000
const FIRE_MULT = 2.0
const DIAS_NUEVA = 14
const MIN_REELS = 2
const VENTANA_DIAS = 30

export type EstadoCodigo = 'ok' | 'on_fire' | 'no_funciona' | 'nueva' | 'sin_datos'

export const ESTADO_LABELS: Record<EstadoCodigo, string> = {
  on_fire: '🔥 On Fire',
  ok: '✅ Activa',
  no_funciona: '⚠️ Baja',
  nueva: '🆕 Nueva',
  sin_datos: '❓ Sin datos',
}

export const ESTADO_COLORS: Record<EstadoCodigo, string> = {
  on_fire: '#f97316',
  ok: '#22c55e',
  no_funciona: '#f59e0b',
  nueva: '#3b82f6',
  sin_datos: '#6b7280',
}

export interface AccountMetrics {
  seguidores: number | null
  mejorReel: number | null
  nReels: number
  estadoCodigo: EstadoCodigo
  engagement: number | null
}

export function calcAccountMetrics(
  createdAt: Date,
  measurements: { seguidores: number | null; siguiendo: number | null }[],
  posts: { tipo: string | null; visitas: number | null; fechaPub: string | null; likes: number | null; comentarios: number | null }[]
): AccountMetrics {
  const daysOld = Math.floor((Date.now() - createdAt.getTime()) / 86400000)
  const latest = measurements[0]
  const seguidores = latest?.seguidores ?? null

  const reels = posts.filter((p) => p.tipo === 'Reel')
  const nReels = reels.length

  const cutoff = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString().split('T')[0]
  const recentReels = reels.filter((p) => p.fechaPub && p.fechaPub >= cutoff)
  const mejorReel = recentReels.length > 0
    ? Math.max(...recentReels.map((p) => p.visitas ?? 0))
    : null

  const totalInter = posts.reduce((s, p) => s + (p.likes ?? 0) + (p.comentarios ?? 0), 0)
  const engagement = seguidores && seguidores > 0 && posts.length > 0
    ? (totalInter / posts.length / seguidores) * 100
    : null

  let estadoCodigo: EstadoCodigo = 'sin_datos'
  if (daysOld < DIAS_NUEVA) {
    estadoCodigo = 'nueva'
  } else if (!seguidores) {
    estadoCodigo = 'sin_datos'
  } else if (nReels >= MIN_REELS && mejorReel !== null && mejorReel >= seguidores * FIRE_MULT) {
    estadoCodigo = 'on_fire'
  } else if (nReels >= MIN_REELS && mejorReel !== null && (mejorReel >= seguidores * REACH_PCT || mejorReel >= UMBRAL_ABS)) {
    estadoCodigo = 'ok'
  } else {
    estadoCodigo = 'no_funciona'
  }

  return { seguidores, mejorReel, nReels, estadoCodigo, engagement }
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('es-ES')
}
