'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ModalAccount {
  id: string
  username: string
  status: string
  model: string | null
  employee: string | null
  phoneRef: string | null
  sparkline: { fecha: string; seguidores: number }[]
  latest: {
    seguidores: number | null
    seguidoresGanados: number | null
    siguiendo: number | null
    reproduccionesTotal: number | null
    postsHoy: number | null
    reelsHoy: number | null
    likesDia: number | null
    comentariosDia: number | null
  } | null
  prev: { seguidores: number | null } | null
  engagement: number | null
  seguidores: number | null
  posts: {
    id: string
    shortcode: string
    tipo: string
    fechaPub: string | null
    visitas: number | null
    likes: number | null
    comentarios: number | null
  }[]
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', suspended: 'Baneada', 'shadow banned': 'Warning',
  new: 'Nueva', unused: 'Inactiva', retiring: 'A retirar',
}
const STATUS_COLOR: Record<string, string> = {
  active: '#34c759', suspended: '#e05252', 'shadow banned': '#f5a623',
  new: '#d4a843', unused: '#6b7280', retiring: '#f5a623',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-ES')
}

function ModalSparkline({ data, up, id }: { data: number[]; up: boolean; id: string }) {
  const w = 500, h = 80
  if (data.length < 2) {
    return (
      <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Sin datos suficientes
      </div>
    )
  }
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
  const X = (i: number) => (i / (data.length - 1)) * w
  const Y = (v: number) => h - 4 - ((v - mn) / rng) * (h - 14)
  const pts = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const area = `${pts} L${w},${h} L0,${h} Z`
  const stroke = up ? '#d4a843' : '#e05252'
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`msp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#msp-${id})`} />
      <path d={pts} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={X(i)} cy={Y(v)} r={i === data.length - 1 ? 3.5 : 2}
          fill={stroke} opacity={i === data.length - 1 ? 1 : 0.4} />
      ))}
    </svg>
  )
}

export function AccountStatsModal({ account, onClose }: { account: ModalAccount; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!mounted) return null

  const sparkVals = (account.sparkline ?? []).map(s => s.seguidores)
  const latest = account.latest
  const prev = account.prev
  const delta = latest?.seguidores != null && prev?.seguidores != null && prev.seguidores > 0
    ? ((latest.seguidores - prev.seguidores) / prev.seguidores) * 100 : null
  const up = delta === null ? true : delta >= 0
  const statusLabel = STATUS_LABEL[account.status.toLowerCase()] ?? account.status
  const statusColor = STATUS_COLOR[account.status.toLowerCase()] ?? '#6b7280'

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      className="sm:items-center sm:p-5"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d1124', border: '1px solid #1c2240',
          width: '100%', maxWidth: 580,
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
        className="rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh]"
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #1c2240',
          display: 'flex', alignItems: 'flex-start', gap: 14, position: 'sticky', top: 0,
          background: '#0d1124', zIndex: 1,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>@{account.username}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44`,
              }}>{statusLabel}</span>
              <a
                href={`https://instagram.com/${account.username}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver en Instagram"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 999, textDecoration: 'none',
                  background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                </svg>
                Instagram
              </a>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
              {account.employee && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {account.employee}
                </span>
              )}
              {account.phoneRef && (
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
                  {account.phoneRef}
                </span>
              )}
              {account.model && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{account.model}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid #1c2240', borderRadius: 8,
              color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '5px 11px',
              cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Main stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Seguidores</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#d4a843', lineHeight: 1 }}>
                {latest?.seguidores != null ? fmt(latest.seguidores) : '—'}
              </div>
            </div>
            <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Ganados hoy</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: latest?.seguidoresGanados != null ? (latest.seguidoresGanados >= 0 ? '#34c759' : '#e05252') : 'var(--muted)' }}>
                {latest?.seguidoresGanados != null
                  ? `${latest.seguidoresGanados >= 0 ? '+' : ''}${fmt(latest.seguidoresGanados)}`
                  : '—'}
              </div>
            </div>
            <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Engagement</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: account.engagement != null ? '#a78bfa' : 'var(--muted)', lineHeight: 1 }}>
                {account.engagement != null ? account.engagement.toFixed(1) + '%' : '—'}
              </div>
            </div>
          </div>

          {/* Sparkline */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              Evolución de seguidores
              {delta !== null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: up ? '#34c759' : '#e05252' }}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}{delta.toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 12, padding: '14px 14px 10px', overflow: 'hidden' }}>
              <ModalSparkline data={sparkVals} up={up} id={account.id} />
              {account.sparkline.length >= 2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
                  <span>{account.sparkline[0]?.fecha}</span>
                  <span>{account.sparkline[account.sparkline.length - 1]?.fecha}</span>
                </div>
              )}
            </div>
          </div>

          {/* Today's activity */}
          {latest && (latest.postsHoy != null || latest.likesDia != null || latest.reproduccionesTotal != null || latest.siguiendo != null) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Actividad reciente
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {latest.postsHoy != null && (
                  <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Posts hoy</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{latest.postsHoy}</div>
                    </div>
                    {latest.reelsHoy != null && (
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Reels</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa' }}>{latest.reelsHoy}</div>
                      </div>
                    )}
                  </div>
                )}
                {latest.likesDia != null && (
                  <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Likes hoy</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#e05252' }}>{fmt(latest.likesDia)}</div>
                    </div>
                    {latest.comentariosDia != null && (
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Comentarios</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#f5a623' }}>{fmt(latest.comentariosDia)}</div>
                      </div>
                    )}
                  </div>
                )}
                {latest.reproduccionesTotal != null && (
                  <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 10, padding: '11px 14px' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Reproducciones totales</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa' }}>{fmt(latest.reproduccionesTotal)}</div>
                  </div>
                )}
                {latest.siguiendo != null && (
                  <div style={{ background: '#121829', border: '1px solid #1c2240', borderRadius: 10, padding: '11px 14px' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Siguiendo</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{fmt(latest.siguiendo)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Posts */}
          {account.posts && account.posts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Últimos posts ({account.posts.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {account.posts.slice(0, 12).map(post => (
                  <div key={post.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#121829', border: '1px solid #1c2240', borderRadius: 8, padding: '8px 12px',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                      background: post.tipo === 'Reel' ? 'rgba(167,139,250,0.15)' : 'rgba(212,168,67,0.15)',
                      color: post.tipo === 'Reel' ? '#a78bfa' : '#d4a843',
                    }}>{post.tipo}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{post.fechaPub ?? '—'}</span>
                    <span style={{ flex: 1 }} />
                    {post.visitas != null && (
                      <span style={{ fontSize: 11, color: '#a78bfa', flexShrink: 0 }}>▶ {fmt(post.visitas)}</span>
                    )}
                    {post.likes != null && (
                      <span style={{ fontSize: 11, color: '#e05252', flexShrink: 0 }}>♥ {fmt(post.likes)}</span>
                    )}
                    {post.comentarios != null && (
                      <span style={{ fontSize: 11, color: '#f5a623', flexShrink: 0 }}>💬 {fmt(post.comentarios)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
