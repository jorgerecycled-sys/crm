import { describe, it, expect } from 'vitest'
import { calcAccountMetrics, fmt } from './metrics'

const DAY = 86400000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const dateStr = (n: number) => new Date(Date.now() - n * DAY).toISOString().split('T')[0]

describe('calcAccountMetrics', () => {
  it('marks accounts younger than 14 days as "nueva" regardless of performance', () => {
    const result = calcAccountMetrics(daysAgo(5), [{ seguidores: 10000, siguiendo: 100 }], [])
    expect(result.estadoCodigo).toBe('nueva')
  })

  it('marks an older account with no follower data as "sin_datos"', () => {
    const result = calcAccountMetrics(daysAgo(30), [], [])
    expect(result.estadoCodigo).toBe('sin_datos')
    expect(result.seguidores).toBeNull()
  })

  it('is "on_fire" when the best recent reel hits 2x followers with >=2 reels', () => {
    const posts = [
      { tipo: 'Reel', visitas: 21000, fechaPub: dateStr(2), likes: 100, comentarios: 10 },
      { tipo: 'Reel', visitas: 5000, fechaPub: dateStr(3), likes: 50, comentarios: 5 },
    ]
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 10000, siguiendo: 0 }], posts)
    expect(result.nReels).toBe(2)
    expect(result.mejorReel).toBe(21000)
    expect(result.estadoCodigo).toBe('on_fire')
  })

  it('is "ok" when reels reach the account\'s follower count but don\'t 2x it', () => {
    const posts = [
      { tipo: 'Reel', visitas: 3000, fechaPub: dateStr(1), likes: 100, comentarios: 10 },
      { tipo: 'Reel', visitas: 2500, fechaPub: dateStr(2), likes: 80, comentarios: 8 },
    ]
    // 20% of 10000 = 2000, best reel (3000) clears that but not the 2x (20000) on_fire bar
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 10000, siguiendo: 0 }], posts)
    expect(result.estadoCodigo).toBe('ok')
  })

  it('is "ok" via the absolute 5000-view threshold even for a huge account', () => {
    const posts = [
      { tipo: 'Reel', visitas: 5500, fechaPub: dateStr(1), likes: 10, comentarios: 1 },
      { tipo: 'Reel', visitas: 100, fechaPub: dateStr(2), likes: 1, comentarios: 0 },
    ]
    // 20% of 500000 would need 100k views — nowhere close — but the 5000 absolute floor still clears it
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 500000, siguiendo: 0 }], posts)
    expect(result.estadoCodigo).toBe('ok')
  })

  it('is "no_funciona" when there are fewer than 2 reels even if views are great', () => {
    const posts = [{ tipo: 'Reel', visitas: 999999, fechaPub: dateStr(1), likes: 100, comentarios: 10 }]
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 1000, siguiendo: 0 }], posts)
    expect(result.nReels).toBe(1)
    expect(result.estadoCodigo).toBe('no_funciona')
  })

  it('is "no_funciona" when reels underperform relative to followers', () => {
    const posts = [
      { tipo: 'Reel', visitas: 50, fechaPub: dateStr(1), likes: 1, comentarios: 0 },
      { tipo: 'Reel', visitas: 30, fechaPub: dateStr(2), likes: 1, comentarios: 0 },
    ]
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 50000, siguiendo: 0 }], posts)
    expect(result.estadoCodigo).toBe('no_funciona')
  })

  it('ignores reels published outside the 30-day performance window', () => {
    const posts = [
      { tipo: 'Reel', visitas: 999999, fechaPub: dateStr(90), likes: 1, comentarios: 0 }, // too old, excluded
      { tipo: 'Reel', visitas: 200, fechaPub: dateStr(1), likes: 1, comentarios: 0 },
    ]
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 1000, siguiendo: 0 }], posts)
    expect(result.nReels).toBe(2) // nReels counts all reels regardless of date
    expect(result.mejorReel).toBe(200) // but mejorReel only looks at the recent window
  })

  it('computes engagement as avg (likes+comments) per post over followers', () => {
    const posts = [
      { tipo: 'Imagen', visitas: null, fechaPub: dateStr(1), likes: 80, comentarios: 20 },
      { tipo: 'Imagen', visitas: null, fechaPub: dateStr(2), likes: 40, comentarios: 10 },
    ]
    // total interactions = 150, / 2 posts = 75, / 1000 followers * 100 = 7.5%
    const result = calcAccountMetrics(daysAgo(60), [{ seguidores: 1000, siguiendo: 0 }], posts)
    expect(result.engagement).toBeCloseTo(7.5, 5)
  })

  it('returns null engagement when there are no posts or no followers', () => {
    expect(calcAccountMetrics(daysAgo(60), [{ seguidores: 1000, siguiendo: 0 }], []).engagement).toBeNull()
    expect(calcAccountMetrics(daysAgo(60), [{ seguidores: 0, siguiendo: 0 }], [
      { tipo: 'Imagen', visitas: null, fechaPub: dateStr(1), likes: 10, comentarios: 0 },
    ]).engagement).toBeNull()
  })

  it('uses the first (most recent) measurement for current follower count', () => {
    const result = calcAccountMetrics(
      daysAgo(60),
      [{ seguidores: 5000, siguiendo: 10 }, { seguidores: 4000, siguiendo: 8 }],
      []
    )
    expect(result.seguidores).toBe(5000)
  })
})

describe('fmt', () => {
  it('formats millions with an M suffix', () => {
    expect(fmt(1_500_000)).toBe('1.50M')
  })
  it('formats thousands with a K suffix', () => {
    expect(fmt(2_300)).toBe('2.3K')
  })
  it('leaves small numbers as localized plain numbers', () => {
    expect(fmt(842)).toBe('842')
  })
})
