'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { useApi } from '@/hooks/useApi'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui/toaster'
import { fmt, ESTADO_LABELS, ESTADO_COLORS, type EstadoCodigo } from '@/lib/instagram/metrics'
import { RefreshCw, X, ExternalLink } from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Measurement {
  fecha: string
  seguidores: number | null; siguiendo: number | null; seguidoresGanados: number | null
  reproduccionesTotal: number | null; postsHoy: number | null; reelsHoy: number | null
  likesDia: number | null; comentariosDia: number | null
}
interface Post {
  id: string; shortcode: string; tipo: string | null; fechaPub: string | null
  visitas: number | null; likes: number | null; comentarios: number | null
}
interface AccountData {
  id: string; username: string; igId: string | null; status: string; notes: string | null
  model: string | null; employee: string | null; employeeId: string | null; phoneRef: string | null
  igType: string | null; niche: string | null; grupo: string | null; igCreatedOn: string | null
  createdAt: string
  latest: Measurement | null; prev: Measurement | null
  sparkline: { fecha: string; seguidores: number }[]
  posts: Post[]
  seguidores: number | null; mejorReel: number | null; nReels: number
  estadoCodigo: EstadoCodigo; engagement: number | null
  pool: string | null; origen: 'Instagram' | 'JailBreak' | 'Pool'
}
interface StatsData {
  accounts: AccountData[]
  totals: { totalAccounts: number; activeAccounts: number; totalFollowers: number; totalPlays: number; avgEngagement: number }
  lastSyncAt: string | null
}
interface LineSeries { username: string; color: string; points: { fecha: string; seguidores: number }[] }
interface Incident {
  id: string; accountId: string | null; description: string; tipo: string; status: string
  reportedBy: string | null; createdAt: string
  ig_accounts?: { username: string; model: string | null; status: string } | null
}
interface Recommendation {
  id: string; texto: string; prioridad: string; categoria: string
  createdBy: string; activa: boolean; createdAt: string
}

// ── Colors ────────────────────────────────────────────────────────────────────

const LINE_COLORS = ['#d4a843','#34c759','#a78bfa','#5b8dd9','#e05252','#e8623f','#3e9e74','#cf8a3f','#d4569e','#60c8d4','#f5a623','#8b5cf6']
function lineColor(i: number) { return LINE_COLORS[i % LINE_COLORS.length] }
const AVATAR_COLORS = ['#e05252','#f5a623','#34c759','#d4a843','#a78bfa','#e8623f','#3e9e74','#cf8a3f','#5b8dd9','#d4569e']
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const TABLE_STATUS_CYCLE = [null, 'active', 'shadow banned', 'suspended'] as const

// ── Mini sparkline for KPI cards ──────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 44 }} />
  const chartData = data.map((v, i) => ({ i, v }))
  const gradId = `spark-${color.replace('#', '')}`
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Main growth chart — Recharts LineChart ────────────────────────────────────

function GrowthChart({ series, onSeriesClick }: { series: LineSeries[]; onSeriesClick?: (username: string) => void }) {
  const withData = series.filter(s => s.points.length >= 2)
  if (withData.length === 0) return (
    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
      Sin datos de evolución — ejecuta Sync para obtener datos
    </div>
  )
  const allDates = [...new Set(withData.flatMap(s => s.points.map(p => p.fecha)))].sort()
  const chartData = allDates.map(fecha => {
    const row: Record<string, string | number | null> = { fecha }
    for (const s of withData) {
      const pt = s.points.find(p => p.fecha === fecha)
      row[s.username] = pt ? pt.seguidores : null
    }
    return row
  })

  const TooltipContent = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const sorted = [...payload].filter(p => p.value != null).sort((a, b) => b.value - a.value)
    const top5 = sorted.slice(0, 5)
    const extra = sorted.length - top5.length
    return (
      <div style={{ background: '#0d1124', border: '1px solid #1c2240', borderRadius: 9, padding: '10px 14px', fontSize: 12, minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>{label}</div>
        {top5.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.65)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dataKey}</span>
            <strong style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.value)}</strong>
          </div>
        ))}
        {extra > 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>+{extra} más</div>}
        {onSeriesClick && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 7, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            Clic en el punto para abrir →
          </div>
        )}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 44, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)', fontFamily: 'system-ui' }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickFormatter={v => String(v).slice(5)}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)', fontFamily: 'system-ui' }}
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <RTooltip
          content={TooltipContent as any}
          cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '4 3' }}
        />
        {withData.map(s => (
          <Line
            key={s.username}
            type="monotone"
            dataKey={s.username}
            stroke={s.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{
              r: 5, strokeWidth: 1.5, stroke: '#fff',
              cursor: onSeriesClick ? 'pointer' : 'default',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick: (_ev: unknown, d: any) => { if (onSeriesClick && d?.dataKey) onSeriesClick(d.dataKey) },
            } as any}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Donut gauge ───────────────────────────────────────────────────────────────

function DonutGauge({ pct, color }: { pct: number; color: string }) {
  const r = 54, cx = 70, cy = 70, stroke = 12
  const circ = 2 * Math.PI * r
  const dash = Math.min(pct / 100, 1) * circ
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" fontFamily="system-ui">{Math.round(pct)}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="system-ui">DEL OBJETIVO</text>
    </svg>
  )
}

// ── Account Modal ─────────────────────────────────────────────────────────────

function AccountModal({ account, onClose, channel }: { account: AccountData; onClose: () => void; channel: string }) {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  useEffect(() => {
    setMounted(true)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const followers = account.latest?.seguidores ?? null
  const ganados = account.latest?.seguidoresGanados ?? null
  const siguiendo = account.latest?.siguiendo ?? null
  const repros = account.latest?.reproduccionesTotal ?? null
  const prevFollowers = account.prev?.seguidores ?? null
  const followerDelta = followers && prevFollowers && prevFollowers > 0
    ? ((followers - prevFollowers) / prevFollowers) * 100 : null
  const estadoColor = ESTADO_COLORS[account.estadoCodigo]
  const estadoLabel = ESTADO_LABELS[account.estadoCodigo]
  const reelCount = account.posts.filter(p => p.tipo === 'Reel').length
  const imgCount = account.posts.filter(p => p.tipo === 'Imagen').length
  const carCount = account.posts.filter(p => p.tipo === 'Carrusel').length

  if (!mounted) return null

  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', background: 'rgba(0,0,0,0.82)', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 760, margin: '32px 0', background: '#0d1124', border: '1px solid #1c2240', borderRadius: 18, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #1c2240' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: avatarColor(account.username), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>
              {account.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>@{account.username}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: estadoColor + '22', color: estadoColor }}>{estadoLabel}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: account.origen === 'JailBreak' ? 'rgba(212,168,67,0.15)' : 'rgba(91,141,217,0.15)', color: account.origen === 'JailBreak' ? '#d4a843' : '#5b8dd9' }}>{account.origen}</span>
                {account.model && <button onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/crm/${channel}/modelos?modelo=${encodeURIComponent(account.model!)}`) }} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(212,168,67,0.15)', color: '#d4a843', cursor: 'pointer', border: 'none' }}>{account.model}</button>}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {account.employee && <span style={{ fontSize: 11, color: '#6b7a9e' }}>👤 {account.employee}</span>}
                {account.phoneRef && <button onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/crm/${channel}/moviles?movil=${encodeURIComponent(account.phoneRef!)}`) }} style={{ fontSize: 11, color: '#5b8dd9', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>📱 {account.phoneRef}</button>}
                {account.niche && <span style={{ fontSize: 11, color: '#6b7a9e' }}>🏷️ {account.niche}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={`https://instagram.com/${account.username}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6b7a9e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={12} /> Ver en IG
            </a>
            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#6b7a9e', cursor: 'pointer' }}><X size={16} /></button>
          </div>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Seguidores', value: followers !== null ? fmt(followers) : '—', sub: ganados !== null ? `${ganados >= 0 ? '+' : ''}${fmt(ganados)} hoy` : null, subColor: ganados !== null ? (ganados >= 0 ? '#34c759' : '#e05252') : '#6b7a9e', badge: followerDelta !== null ? `${followerDelta >= 0 ? '↑' : '↓'}${Math.abs(followerDelta).toFixed(2)}%` : null, bColor: followerDelta !== null ? (followerDelta >= 0 ? '#34c75922' : '#e0525222') : 'transparent', bTxt: followerDelta !== null ? (followerDelta >= 0 ? '#34c759' : '#e05252') : '#6b7a9e' },
              { label: 'Siguiendo', value: siguiendo !== null ? fmt(siguiendo) : '—', sub: null, subColor: '#6b7a9e', badge: null, bColor: 'transparent', bTxt: '#6b7a9e' },
              { label: 'Engagement', value: account.engagement !== null ? account.engagement.toFixed(1) + '%' : '—', sub: `${account.posts.length} posts`, subColor: '#6b7a9e', badge: null, bColor: 'transparent', bTxt: '#6b7a9e' },
              { label: 'Reproducciones', value: repros !== null ? fmt(repros) : '—', sub: null, subColor: '#6b7a9e', badge: null, bColor: 'transparent', bTxt: '#6b7a9e' },
            ].map(card => (
              <div key={card.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px', border: '1px solid #1c2240' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{card.value}</div>
                {(card.badge || card.sub) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {card.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: card.bColor, color: card.bTxt }}>{card.badge}</span>}
                    {card.sub && <span style={{ fontSize: 11, color: card.subColor }}>{card.sub}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {account.sparkline.length >= 2 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '14px 16px', border: '1px solid #1c2240' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Evolución seguidores</div>
              <GrowthChart series={[{ username: account.username, color: '#d4a843', points: account.sparkline }]} />
            </div>
          )}
          {account.posts.length > 0 && (
            <div style={{ borderRadius: 12, border: '1px solid #1c2240', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #1c2240', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7a9e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Publicaciones ({account.posts.length})</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {reelCount > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,166,35,0.12)', color: '#f5a623', fontWeight: 700 }}>{reelCount} Reels</span>}
                  {imgCount > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(52,199,89,0.12)', color: '#34c759', fontWeight: 700 }}>{imgCount} Imgs</span>}
                  {carCount > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', fontWeight: 700 }}>{carCount} Cars</span>}
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 220 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1c2240' }}>
                      {['Tipo','Fecha','Visitas','Likes','Coms.','Eng.',''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7a9e', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {account.posts.slice(0, 50).map((p, idx) => {
                      const eng = followers && followers > 0 ? ((p.likes ?? 0) + (p.comentarios ?? 0)) / followers * 100 : null
                      const tc = p.tipo === 'Reel' ? '#f5a623' : p.tipo === 'Carrusel' ? '#a78bfa' : '#34c759'
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #1c2240', background: idx === 0 ? 'rgba(212,168,67,0.04)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: tc + '18', color: tc }}>{p.tipo ?? '—'}</span></td>
                          <td style={{ padding: '8px 12px', color: '#6b7a9e', whiteSpace: 'nowrap' }}>{p.fechaPub?.slice(0, 10) ?? '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right', color: '#e8ecf5' }}>{p.visitas !== null ? fmt(p.visitas) : '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right', color: '#e8ecf5' }}>{p.likes !== null ? fmt(p.likes) : '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7a9e', textAlign: 'right' }}>{p.comentarios !== null ? fmt(p.comentarios) : '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right', color: eng !== null ? (eng > 3 ? '#34c759' : eng > 1 ? '#f5a623' : '#6b7a9e') : '#6b7a9e' }}>{eng !== null ? eng.toFixed(1) + '%' : '—'}</td>
                          <td style={{ padding: '8px 12px' }}>{p.shortcode && <a href={`https://instagram.com/p/${p.shortcode}`} target="_blank" rel="noopener noreferrer" style={{ color: '#5b8dd9', fontSize: 11 }}>↗</a>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const { channel } = useParams<{ channel: string }>()
  const router = useRouter()
  const { fetchApi } = useApi()
  const isEmpleado = useAuthStore(s => s.user?.roleName) === 'Empleado'
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [diagLog, setDiagLog] = useState<Record<string, unknown> | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<AccountData | null>(null)
  const [activeModel, setActiveModel] = useState<string>('all')
  const [activeEmployee, setActiveEmployee] = useState<string>('all') // employeeId, or 'all'
  const [realEmployees, setRealEmployees] = useState<{ id: string; name: string }[]>([])
  const [activeOrigen, setActiveOrigen] = useState<'all' | 'Instagram' | 'JailBreak'>('all')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [newIncident, setNewIncident] = useState({ description: '', tipo: 'general', reportedBy: '', accountId: '' })
  const [newRec, setNewRec] = useState({ texto: '', prioridad: 'media', categoria: 'general' })
  const [addingIncident, setAddingIncident] = useState(false)
  const [addingRec, setAddingRec] = useState(false)
  const [incidentFormOpen, setIncidentFormOpen] = useState(false)
  const [recFormOpen, setRecFormOpen] = useState(false)
  const autoOpenHandled = useRef(false)
  const [tableSort, setTableSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [tableStatusCycle, setTableStatusCycle] = useState(0)
  const [tableSearch, setTableSearch] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [dismissals, setDismissals] = useState<Map<string, string>>(new Map())
  const [dismissing, setDismissing] = useState(false)

  // Switching model/employee/origen can make the table's own "Estado" cycle
  // filter (independent of these) intersect to zero results — e.g. JailBreak
  // accounts never carry the active/suspended/shadow-banned statuses that
  // cycle targets, since they use pool_assigned/pool_expired instead — so
  // clear it whenever a top-level filter changes.
  function resetTableFilters() {
    setTableStatusCycle(0)
    setTableSort(null)
    setTablePage(0)
  }

  const load = useCallback(() => {
    setLoading(true)
    const token = useAuthStore.getState().accessToken
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    Promise.all([
      fetch('/api/crm/instagram/stats?pool=jailbreak', { headers: h }).then(r => r.json()),
      fetch('/api/crm/instagram/employee-names', { headers: h }).then(r => r.json()).catch(() => ({ withAccount: [] })),
    ])
      .then(([d, empNames]) => {
        setData(d)
        setRealEmployees((empNames.withAccount ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-open account modal from URL ?cuenta=USERNAME
  useEffect(() => {
    if (!data || autoOpenHandled.current) return
    const cuenta = new URLSearchParams(window.location.search).get('cuenta')
    if (!cuenta) return
    const acc = data.accounts.find(a => a.username === cuenta)
    if (acc) { setSelectedAccount(acc); autoOpenHandled.current = true }
  }, [data])

  const loadSideData = useCallback(() => {
    const token = useAuthStore.getState().accessToken
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    fetch('/api/crm/instagram/incidents', { headers: h })
      .then(r => r.json()).then(d => setIncidents(d.incidents ?? [])).catch(() => {})
    fetch('/api/crm/instagram/recommendations', { headers: h })
      .then(r => r.json()).then(d => setRecommendations(d.recommendations ?? [])).catch(() => {})
    fetch('/api/crm/instagram/alerts', { headers: h })
      .then(r => r.json())
      .then(d => setDismissals(new Map((d.dismissals ?? []).map((x: { accountId: string; dismissedStatus: string }) => [x.accountId, x.dismissedStatus]))))
      .catch(() => {})
  }, [])

  useEffect(() => { loadSideData() }, [loadSideData])

  async function handleDismissAlerts() {
    setDismissing(true)
    try {
      const token = useAuthStore.getState().accessToken
      await fetch('/api/crm/instagram/alerts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      loadSideData()
      toast('Alertas actuales descartadas — solo verás las nuevas a partir de ahora', 'success')
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setDismissing(false) }
  }

  const addIncidentHandler = async () => {
    if (!newIncident.description.trim()) return
    setAddingIncident(true)
    try {
      const token = useAuthStore.getState().accessToken
      const r = await fetch('/api/crm/instagram/incidents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newIncident),
      })
      const d = await r.json()
      if (d.incident) {
        setIncidents(prev => [d.incident, ...prev])
        setNewIncident({ description: '', tipo: 'general', reportedBy: '', accountId: '' })
        setIncidentFormOpen(false)
        toast('Incidencia registrada', 'success')
      } else { toast(d.error ?? 'Error', 'error') }
    } catch { toast('Error al guardar', 'error') }
    finally { setAddingIncident(false) }
  }

  const resolveIncident = async (id: string) => {
    const token = useAuthStore.getState().accessToken
    await fetch('/api/crm/instagram/incidents', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    })
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i))
  }

  const addRecHandler = async () => {
    if (!newRec.texto.trim()) return
    setAddingRec(true)
    try {
      const token = useAuthStore.getState().accessToken
      const r = await fetch('/api/crm/instagram/recommendations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newRec),
      })
      const d = await r.json()
      if (d.recommendation) {
        setRecommendations(prev => [d.recommendation, ...prev])
        setNewRec({ texto: '', prioridad: 'media', categoria: 'general' })
        setRecFormOpen(false)
        toast('Recomendación guardada', 'success')
      } else { toast(d.error ?? 'Error', 'error') }
    } catch { toast('Error al guardar', 'error') }
    finally { setAddingRec(false) }
  }

  const deleteRec = async (id: string) => {
    const token = useAuthStore.getState().accessToken
    await fetch(`/api/crm/instagram/recommendations?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    setRecommendations(prev => prev.filter(r => r.id !== id))
  }

  const handleDiag = async () => {
    try {
      const result = await fetchApi<Record<string, unknown>>('/crm/instagram/sync')
      setDiagLog(result)
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const handleSync = async (force = false) => {
    setSyncing(true)
    try {
      const result = await fetchApi<{ ok: boolean; procesadas: number; errores: number; info?: string; errorDetails?: string[]; error?: string }>('/crm/instagram/sync', {
        method: 'POST', body: JSON.stringify({ force }),
      })
      if (result.info) {
        toast(result.info, 'info')
      } else if (result.ok) {
        const firstErr = result.errorDetails?.[0] ?? ''
        const msg = result.procesadas === 0 && result.errores > 0
          ? `Sync: 0 OK, ${result.errores} errores. ${firstErr}`
          : `Sync: ${result.procesadas} cuentas${result.errores > 0 ? `, ${result.errores} errores (${firstErr})` : ''}`
        toast(msg, result.errores > 0 ? 'error' : 'success')
      } else {
        toast('Error en sync', 'error')
      }
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally { setSyncing(false) }
  }

  // All statuses (minus blocked-phone / unused-no-employee) — used only for the alert panels below.
  // Employees already only receive their own accounts from the API, so they see everything of theirs, no exclusions.
  const allAccounts = useMemo(() => {
    const raw = data?.accounts ?? []
    if (isEmpleado) return raw
    return raw.filter(a => {
      const isBlockedPhone = (a.phoneRef ?? '').includes('⛔')
      const isUnusedNoEmployee = a.status.toLowerCase() === 'unused' && !a.employee
      return !isBlockedPhone && !isUnusedNoEmployee
    })
  }, [data, isEmpleado])

  // Active + new accounts — used everywhere else (totals, charts, table, model breakdown).
  // Employees see all of their own accounts regardless of status (active, new, blocked, etc.)
  const accounts = useMemo(() => {
    if (isEmpleado) return allAccounts
    return allAccounts.filter(a => a.status === 'active' || a.status === 'new')
  }, [allAccounts, isEmpleado])

  // Recomputed from the active-only account list
  const totals = useMemo(() => {
    const workingAccounts = accounts.filter(a => a.seguidores !== null)
    const totalFollowers = workingAccounts.reduce((s, a) => s + (a.seguidores ?? 0), 0)
    const totalPlays = workingAccounts.reduce((s, a) => s + (a.latest?.reproduccionesTotal ?? 0), 0)
    const validEngagement = workingAccounts.filter(a => a.engagement !== null)
    const avgEngagement = validEngagement.length > 0
      ? validEngagement.reduce((s, a) => s + (a.engagement ?? 0), 0) / validEngagement.length
      : 0
    const activeAccounts = workingAccounts
    return {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      totalFollowers,
      totalPlays,
      avgEngagement: isNaN(avgEngagement) ? 0 : avgEngagement,
    }
  }, [accounts])

  // Last sync relative label
  const lastSyncLabel = useMemo(() => {
    if (!data?.lastSyncAt) return null
    const diff = Date.now() - new Date(data.lastSyncAt).getTime()
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(h / 24)
    if (d >= 1) return `hace ${d}d`
    if (h >= 1) return `hace ${h}h`
    return 'hace unos minutos'
  }, [data?.lastSyncAt])

  // Model list
  const models = useMemo(() => {
    return [...new Set(accounts.map(a => a.model).filter(Boolean) as string[])].sort()
  }, [accounts])

  // Accounts in current view
  const viewAccounts = useMemo(() => {
    let rows = accounts
    if (activeModel !== 'all') rows = rows.filter(a => a.model === activeModel)
    if (activeEmployee !== 'all') rows = rows.filter(a => a.employeeId === activeEmployee)
    if (activeOrigen !== 'all') rows = rows.filter(a => a.origen === activeOrigen)
    return rows
  }, [accounts, activeModel, activeEmployee, activeOrigen])

  // Instagram vs JailBreak breakdown for whatever filter (model/employee) is active
  const origenBreakdown = useMemo(() => {
    const base = accounts.filter(a =>
      (activeModel === 'all' || a.model === activeModel) &&
      (activeEmployee === 'all' || a.employeeId === activeEmployee)
    )
    const instagram = base.filter(a => a.origen === 'Instagram').length
    const jailbreak = base.filter(a => a.origen === 'JailBreak').length
    return { instagram, jailbreak, total: base.length }
  }, [accounts, activeModel, activeEmployee])

  // Table sorted/filtered
  const tableSorted = useMemo(() => {
    const sf = TABLE_STATUS_CYCLE[tableStatusCycle]
    const rows = sf ? viewAccounts.filter(a => a.status === sf) : viewAccounts
    if (!tableSort) return [...rows].sort((a, b) => (b.seguidores ?? 0) - (a.seguidores ?? 0))
    return [...rows].sort((a, b) => {
      const d = tableSort.dir === 'asc' ? 1 : -1
      switch (tableSort.col) {
        case 'seguidores': return ((a.seguidores ?? -1) - (b.seguidores ?? -1)) * d
        case 'ganados': return ((a.latest?.seguidoresGanados ?? -Infinity) - (b.latest?.seguidoresGanados ?? -Infinity)) * d
        case 'modelo': return (a.model ?? '').localeCompare(b.model ?? '') * d
        case 'empleado': return (a.employee ?? '').localeCompare(b.employee ?? '') * d
        case 'movil': return (a.phoneRef ?? '').localeCompare(b.phoneRef ?? '') * d
        case 'cuenta': return a.username.localeCompare(b.username) * d
        case 'engagement': return ((a.engagement ?? -1) - (b.engagement ?? -1)) * d
        case 'origen': return a.origen.localeCompare(b.origen) * d
        default: return (b.seguidores ?? 0) - (a.seguidores ?? 0)
      }
    })
  }, [viewAccounts, tableSort, tableStatusCycle])

  const TABLE_PAGE_SIZE = 50
  const tableFiltered = useMemo(() => {
    if (!tableSearch.trim()) return tableSorted
    const q = tableSearch.trim().toLowerCase()
    return tableSorted.filter(a =>
      a.username.toLowerCase().includes(q) ||
      (a.model ?? '').toLowerCase().includes(q) ||
      (a.employee ?? '').toLowerCase().includes(q)
    )
  }, [tableSorted, tableSearch])
  const tablePageData = useMemo(() => tableFiltered.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE), [tableFiltered, tablePage])
  const tableTotalPages = Math.ceil(tableFiltered.length / TABLE_PAGE_SIZE)

  // Accounts shown in charts: active + shadow banned (suspended and new excluded)
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active' || a.status === 'shadow banned'), [accounts])

  // Aggregate sparkline: sum followers per date across active accounts only
  const aggregateSparkline = useMemo(() => {
    const dateMap = new Map<string, number>()
    for (const acc of activeAccounts) {
      for (const sp of acc.sparkline) {
        dateMap.set(sp.fecha, (dateMap.get(sp.fecha) ?? 0) + sp.seguidores)
      }
    }
    return [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  }, [activeAccounts])

  // Total new followers (sum of seguidoresGanados across active accounts)
  const totalNuevos = useMemo(() => {
    return activeAccounts.reduce((s, a) => s + (a.latest?.seguidoresGanados ?? 0), 0)
  }, [activeAccounts])

  // Per-model line series for the growth chart (all accounts except unused)
  const chartSeries = useMemo((): LineSeries[] => {
    const pool = accounts.filter(a => a.status !== 'unused')
    const chartAccs = activeModel === 'all' ? pool : pool.filter(a => a.model === activeModel)
    if (activeModel === 'all') {
      return models.map((m, mi) => {
        const accs = chartAccs.filter(a => a.model === m)
        const dateMap = new Map<string, number>()
        for (const acc of accs) {
          for (const sp of acc.sparkline) {
            dateMap.set(sp.fecha, (dateMap.get(sp.fecha) ?? 0) + sp.seguidores)
          }
        }
        const points = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, seguidores]) => ({ fecha, seguidores }))
        return { username: m, color: lineColor(mi), points }
      })
    }
    // Single model selected: top 10 by followers + "Otras N" aggregate for the rest
    const sorted = [...chartAccs].sort((a, b) => (b.seguidores ?? 0) - (a.seguidores ?? 0))
    const top = sorted.slice(0, 10)
    const rest = sorted.slice(10)
    const series: LineSeries[] = top.map((a, i) => ({ username: a.username, color: lineColor(i), points: a.sparkline }))
    if (rest.length > 0) {
      const dateMap = new Map<string, number>()
      for (const acc of rest) {
        for (const sp of acc.sparkline) {
          dateMap.set(sp.fecha, (dateMap.get(sp.fecha) ?? 0) + sp.seguidores)
        }
      }
      const points = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, seguidores]) => ({ fecha, seguidores }))
      series.push({ username: `Otras ${rest.length}`, color: '#4a5568', points })
    }
    return series
  }, [accounts, models, activeModel])

  // Phones with problems (suspended or shadow banned accounts)
  const isUndismissedProblem = useCallback((a: AccountData) => {
    if (a.status !== 'suspended' && a.status !== 'shadow banned') return false
    return dismissals.get(a.id) !== a.status
  }, [dismissals])

  const phoneProblems = useMemo(() => {
    const map = new Map<string, { phone: string; accounts: AccountData[] }>()
    for (const acc of allAccounts) {
      if (!acc.phoneRef) continue
      if (isUndismissedProblem(acc)) {
        const e = map.get(acc.phoneRef) ?? { phone: acc.phoneRef, accounts: [] }
        e.accounts.push(acc)
        map.set(acc.phoneRef, e)
      }
    }
    return [...map.values()].sort((a, b) => b.accounts.length - a.accounts.length)
  }, [allAccounts, isUndismissedProblem])

  // Accounts with problems (not yet dismissed)
  const accountProblems = useMemo(() => {
    return allAccounts.filter(isUndismissedProblem)
      .sort((a, b) => {
        const order: Record<string, number> = { suspended: 0, 'shadow banned': 1 }
        return (order[a.status] ?? 2) - (order[b.status] ?? 2)
      })
  }, [allAccounts, isUndismissedProblem])

  const openIncidents = useMemo(() => incidents.filter(i => i.status !== 'resolved'), [incidents])

  // IG status counts
  const igStatus = useMemo(() => ({
    activas: allAccounts.filter(a => a.status === 'active').length,
    shadow: allAccounts.filter(a => a.status === 'shadow banned').length,
    suspendidas: allAccounts.filter(a => a.status === 'suspended').length,
    nuevas: allAccounts.filter(a => a.status === 'new').length,
  }), [allAccounts])

  // Unique phones (devices)
  const phones = useMemo(() => {
    const s = new Set<string>()
    for (const a of accounts) if (a.phoneRef) s.add(a.phoneRef)
    return [...s].sort()
  }, [accounts])

  // Monthly goal: estimate from total followers gained vs 5% growth target
  const goalPct = useMemo(() => {
    if (!totals?.totalFollowers || totals.totalFollowers === 0) return 0
    const goal = totals.totalFollowers * 0.05
    const actual = Math.max(totalNuevos, 0)
    return Math.min((actual / goal) * 100, 100)
  }, [totals, totalNuevos])

  const activeCount = totals?.activeAccounts ?? 0
  const totalCount = totals?.totalAccounts ?? 0

  // KPI sparklines (engagement: avg over time - no per-date data, show flat for now)
  const engSparkline = useMemo(() => {
    if (aggregateSparkline.length < 2) return []
    // Approximate engagement trend from follower growth
    const mn = Math.min(...aggregateSparkline)
    return aggregateSparkline.map(v => (v - mn) / Math.max(aggregateSparkline[aggregateSparkline.length - 1] - mn, 1) * (totals?.avgEngagement ?? 2))
  }, [aggregateSparkline, totals])

  const nuevosSparkline = useMemo(() => {
    const dateMap = new Map<string, number>()
    for (const acc of accounts) {
      for (const m of acc.sparkline) {
        dateMap.set(m.fecha, (dateMap.get(m.fecha) ?? 0) + 1)
      }
    }
    // Cumulative proxy: just use aggregate - previous
    if (aggregateSparkline.length < 2) return []
    return aggregateSparkline.map((v, i) => i === 0 ? 0 : Math.max(0, v - aggregateSparkline[i - 1]))
  }, [accounts, aggregateSparkline])

  const toggleSort = (col: string) => {
    setTableStatusCycle(0); setTablePage(0)
    setTableSort(prev => prev?.col === col ? (prev.dir === 'desc' ? { col, dir: 'asc' } : null) : { col, dir: 'desc' })
  }
  const cycleStatus = () => {
    setTableSort(null); setTablePage(0)
    setTableStatusCycle(c => (c + 1) % TABLE_STATUS_CYCLE.length)
  }
  const sortArrow = (col: string) => tableSort?.col === col
    ? <span style={{ fontSize: 9, color: '#d4a843', marginLeft: 3 }}>{tableSort.dir === 'desc' ? '↓' : '↑'}</span>
    : <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', marginLeft: 3 }}>⇅</span>
  const statusCycleColors = ['var(--muted)', '#34c759', '#f5a623', '#e05252']
  const statusCycleIcons = ['⇅', '●', '!', '✕']

  if (channel !== 'instagram') return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      Estadísticas avanzadas solo disponible para Instagram.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.4px' }}>Resumen</h1>
            {lastSyncLabel && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#34c759', background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: 999, padding: '3px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759', display: 'inline-block' }} />
                Sincronizado · {lastSyncLabel}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>
            Vista general de la agencia · <span style={{ color: '#fff', fontWeight: 700 }}>{activeCount}</span> de {totalCount} cuentas activas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleDiag} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            🔍 Diagnóstico
          </button>
          {!isEmpleado && (
            <>
              <button onClick={() => handleSync(false)} disabled={syncing || loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', opacity: syncing ? 0.6 : 1 }}>
                <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                Sincronizar
              </button>
              <button onClick={() => handleSync(true)} disabled={syncing || loading} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#d4a843', border: 'none', color: '#000', opacity: syncing ? 0.6 : 1 }}>
                Forzar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Diagnóstico sync ────────────────────────────────────────────────── */}
      {diagLog && (
        <div style={{ background: '#0a0d1a', border: '1px solid #1c2240', borderRadius: 12, padding: 16, fontSize: 12, color: '#9aa4c0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#e8ecf5' }}>Diagnóstico de Sincronización</span>
            <button onClick={() => setDiagLog(null)} style={{ background: 'none', border: 'none', color: '#5a6480', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'API Key', value: String(diagLog.rapidApiKey), color: String(diagLog.rapidApiKey).includes('⚠') ? '#e9a82d' : '#1fad6e' },
              { label: 'Total cuentas BD', value: String(diagLog.totalAccounts) },
              { label: 'Sincronizables', value: String(diagLog.syncable), color: '#6272e4' },
              { label: 'Ya synced hoy', value: String(diagLog.alreadySyncedToday), color: '#1fad6e' },
              { label: 'Pendientes', value: String(diagLog.pendingSync), color: Number(diagLog.pendingSync) > 0 ? '#e9a82d' : '#1fad6e' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#111628', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#5a6480', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 700, color: color ?? '#e8ecf5' }}>{value}</div>
              </div>
            ))}
          </div>
          {diagLog.byStatus != null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: '#5a6480', marginBottom: 6 }}>CUENTAS POR STATUS</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(diagLog.byStatus as Record<string, number>).map(([status, count]) => (
                  <span key={status} style={{ background: '#1c2240', borderRadius: 6, padding: '3px 10px', fontSize: 11 }}>
                    <strong style={{ color: '#e8ecf5' }}>{count}</strong> <span style={{ color: '#5a6480' }}>{status}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(diagLog.pendingList) && diagLog.pendingList.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#5a6480', marginBottom: 6 }}>PRIMERAS PENDIENTES</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(diagLog.pendingList as { username: string; status: string }[]).map(a => (
                  <span key={a.username} style={{ background: '#1c2240', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#9aa4c0' }}>@{a.username}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4 Alert panels ─────────────────────────────────────────────────── */}
      {!isEmpleado && (accountProblems.length > 0 || phoneProblems.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={handleDismissAlerts} disabled={dismissing}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: dismissing ? 'not-allowed' : 'pointer', opacity: dismissing ? 0.6 : 1 }}>
            {dismissing ? 'Descartando…' : '✕ Descartar alertas actuales'}
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>

        {/* Panel 1 – Móviles */}
        {(() => {
          const ok = phoneProblems.length === 0
          return (
            <div style={{ background: 'var(--surface)', border: `1px solid ${ok ? 'var(--border)' : '#f5a62344'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ok ? 'var(--muted)' : '#f5a623'} strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
                  <button onClick={() => router.push(`/crm/${channel}/moviles`)} style={{ fontSize: 11, fontWeight: 700, color: ok ? 'var(--muted)' : '#f5a623', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Móviles</button>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: ok ? 'rgba(52,199,89,0.1)' : 'rgba(245,166,35,0.12)', color: ok ? '#34c759' : '#f5a623' }}>
                  {ok ? 'OK' : phoneProblems.length + ' con alertas'}
                </span>
              </div>
              {ok ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Todos los móviles sin incidencias</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {phoneProblems.slice(0, 3).map(p => (
                    <button key={p.phone} onClick={() => router.push(`/crm/${channel}/moviles?movil=${encodeURIComponent(p.phone)}`)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(245,166,35,0.06)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#f5a623' }}>{p.phone}</span>
                      <span style={{ fontSize: 10, color: '#f5a623', fontWeight: 700 }}>{p.accounts.length} cuenta{p.accounts.length > 1 ? 's' : ''} →</span>
                    </button>
                  ))}
                  {phoneProblems.length > 3 && <button onClick={() => router.push(`/crm/${channel}/moviles`)} style={{ fontSize: 10, color: '#5b8dd9', textAlign: 'right', cursor: 'pointer', background: 'none', border: 'none', width: '100%' }}>+{phoneProblems.length - 3} más →</button>}
                </div>
              )}
            </div>
          )
        })()}

        {/* Panel 2 – Cuentas con errores */}
        {(() => {
          const ok = accountProblems.length === 0
          return (
            <div style={{ background: 'var(--surface)', border: `1px solid ${ok ? 'var(--border)' : '#e0525244'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ok ? 'var(--muted)' : '#e05252'} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <button onClick={() => router.push(`/crm/${channel}/cuentas`)} style={{ fontSize: 11, fontWeight: 700, color: ok ? 'var(--muted)' : '#e05252', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cuentas</button>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: ok ? 'rgba(52,199,89,0.1)' : 'rgba(224,82,82,0.12)', color: ok ? '#34c759' : '#e05252' }}>
                  {ok ? 'OK' : accountProblems.length + ' errores'}
                </span>
              </div>
              {ok ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Todas las cuentas activas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {accountProblems.slice(0, 3).map(acc => {
                    const isSuspended = acc.status === 'suspended'
                    const c = isSuspended ? '#e05252' : '#f5a623'
                    const l = isSuspended ? 'Baneada' : 'Warning'
                    return (
                      <button key={acc.id} onClick={() => setSelectedAccount(acc)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${c}0d`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', border: `1px solid ${c}22`, width: '100%', textAlign: 'left' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: c }}>@{acc.username}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: c }}>{l} →</span>
                      </button>
                    )
                  })}
                  {accountProblems.length > 3 && <button onClick={() => router.push(`/crm/${channel}/cuentas`)} style={{ fontSize: 10, color: '#5b8dd9', textAlign: 'right', cursor: 'pointer', background: 'none', border: 'none', width: '100%' }}>+{accountProblems.length - 3} más →</button>}
                </div>
              )}
            </div>
          )
        })()}

        {/* Panel 3 – Incidencias */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${openIncidents.length > 0 ? '#a78bfa44' : 'var(--border)'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={openIncidents.length > 0 ? '#a78bfa' : 'var(--muted)'} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Incidencias</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: openIncidents.length > 0 ? 'rgba(167,139,250,0.12)' : 'rgba(52,199,89,0.1)', color: openIncidents.length > 0 ? '#a78bfa' : '#34c759' }}>
                {openIncidents.length > 0 ? openIncidents.length + ' abiertas' : 'OK'}
              </span>
              <button onClick={() => setIncidentFormOpen(v => !v)} style={{ width: 20, height: 20, borderRadius: 6, background: '#a78bfa22', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
            </div>
          </div>
          {incidentFormOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(167,139,250,0.06)', borderRadius: 10, padding: 10 }}>
              <input value={newIncident.description} onChange={e => setNewIncident(p => ({ ...p, description: e.target.value }))} placeholder="Descripción de la incidencia…" style={{ width: '100%', padding: '6px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(167,139,250,0.3)', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              <input value={newIncident.reportedBy} onChange={e => setNewIncident(p => ({ ...p, reportedBy: e.target.value }))} placeholder="Empleado (opcional)" style={{ width: '100%', padding: '6px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(167,139,250,0.3)', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              <select value={newIncident.tipo} onChange={e => setNewIncident(p => ({ ...p, tipo: e.target.value }))} style={{ padding: '6px 9px', borderRadius: 7, background: '#16162a', border: '1px solid rgba(167,139,250,0.3)', color: '#e2e2e2', fontSize: 12, outline: 'none' }}>
                {['general','cuenta','contenido','engagement','tecnico'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={addIncidentHandler} disabled={addingIncident || !newIncident.description.trim()} style={{ padding: '6px', borderRadius: 7, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: addingIncident ? 0.6 : 1 }}>
                {addingIncident ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          )}
          {openIncidents.length === 0 && !incidentFormOpen ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin incidencias abiertas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {openIncidents.slice(0, 3).map(inc => (
                <div key={inc.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, background: 'rgba(167,139,250,0.06)', borderRadius: 8, padding: '5px 9px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.description}</div>
                    {inc.ig_accounts && (
                      <button onClick={() => { const acc = allAccounts.find(a => a.username === inc.ig_accounts!.username); if (acc) setSelectedAccount(acc) }} style={{ fontSize: 10, color: '#5b8dd9', marginTop: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'block' }}>@{inc.ig_accounts.username} →</button>
                    )}
                    {inc.reportedBy && <div style={{ fontSize: 10, color: 'var(--muted)' }}>por {inc.reportedBy}</div>}
                  </div>
                  <button onClick={() => resolveIncident(inc.id)} title="Marcar resuelta" style={{ flexShrink: 0, padding: '2px 5px', borderRadius: 5, background: 'rgba(52,199,89,0.12)', border: 'none', color: '#34c759', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                </div>
              ))}
              {openIncidents.length > 3 && <div style={{ fontSize: 10, color: '#5b8dd9', textAlign: 'right' }}>+{openIncidents.length - 3} más</div>}
            </div>
          )}
        </div>

        {/* Panel 4 – Recomendaciones */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${recommendations.length > 0 ? '#5b8dd944' : 'var(--border)'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={recommendations.length > 0 ? '#5b8dd9' : 'var(--muted)'} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recomendaciones</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(91,141,217,0.12)', color: '#5b8dd9' }}>{recommendations.length}</span>
              <button onClick={() => setRecFormOpen(v => !v)} style={{ width: 20, height: 20, borderRadius: 6, background: '#5b8dd922', border: 'none', color: '#5b8dd9', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
            </div>
          </div>
          {recFormOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(91,141,217,0.06)', borderRadius: 10, padding: 10 }}>
              <textarea value={newRec.texto} onChange={e => setNewRec(p => ({ ...p, texto: e.target.value }))} placeholder="Escribe la recomendación…" rows={2} style={{ width: '100%', padding: '6px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(91,141,217,0.3)', color: '#fff', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={newRec.prioridad} onChange={e => setNewRec(p => ({ ...p, prioridad: e.target.value }))} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, background: '#16162a', border: '1px solid rgba(91,141,217,0.3)', color: '#e2e2e2', fontSize: 11, outline: 'none' }}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
                <select value={newRec.categoria} onChange={e => setNewRec(p => ({ ...p, categoria: e.target.value }))} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, background: '#16162a', border: '1px solid rgba(91,141,217,0.3)', color: '#e2e2e2', fontSize: 11, outline: 'none' }}>
                  {['general','contenido','crecimiento','seguridad'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={addRecHandler} disabled={addingRec || !newRec.texto.trim()} style={{ padding: '6px', borderRadius: 7, background: '#5b8dd9', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: addingRec ? 0.6 : 1 }}>
                {addingRec ? 'Guardando…' : 'Añadir recomendación'}
              </button>
            </div>
          )}
          {recommendations.length === 0 && !recFormOpen ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin recomendaciones activas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recommendations.slice(0, 3).map(rec => {
                const pc = rec.prioridad === 'alta' ? '#e05252' : rec.prioridad === 'media' ? '#f5a623' : '#34c759'
                return (
                  <div key={rec.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, background: 'rgba(91,141,217,0.06)', borderRadius: 8, padding: '5px 9px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{rec.texto}</div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: pc, textTransform: 'uppercase', marginTop: 2, display: 'block' }}>{rec.prioridad} · {rec.categoria}</span>
                    </div>
                    <button onClick={() => deleteRec(rec.id)} title="Eliminar" style={{ flexShrink: 0, padding: '2px 5px', borderRadius: 5, background: 'rgba(224,82,82,0.1)', border: 'none', color: '#e05252', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>✕</button>
                  </div>
                )
              })}
              {recommendations.length > 3 && <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>+{recommendations.length - 3} más</div>}
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {/* Seguidores totales */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Seguidores Totales</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>{loading ? '…' : fmt(totals?.totalFollowers ?? 0)}</span>
              {totalNuevos !== 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: totalNuevos >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(224,82,82,0.12)', color: totalNuevos >= 0 ? '#34c759' : '#e05252' }}>
                  {totalNuevos >= 0 ? '+' : ''}{fmt(totalNuevos)}
                </span>
              )}
            </div>
          </div>
          <MiniSparkline data={aggregateSparkline} color="#d4a843" />
        </div>

        {/* Engagement */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Engagement Medio</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>{loading ? '…' : (totals?.avgEngagement ?? 0).toFixed(1) + '%'}</span>
            </div>
          </div>
          <MiniSparkline data={engSparkline.length >= 2 ? engSparkline : [0, totals?.avgEngagement ?? 0]} color="#34c759" />
        </div>

        {/* Nuevos seguidores */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Nuevos Seguidores · 30D</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>
                {loading ? '…' : `${totalNuevos >= 0 ? '+' : ''}${fmt(totalNuevos)}`}
              </span>
            </div>
          </div>
          <MiniSparkline data={nuevosSparkline.length >= 2 ? nuevosSparkline : [0, Math.max(totalNuevos, 0)]} color="#a78bfa" />
        </div>

        {/* Cuentas activas */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cuentas Activas</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>{loading ? '…' : activeCount}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)' }}>/ {totalCount}</span>
            </div>
            {accountProblems.length > 0 && (
              <button onClick={() => router.push(`/crm/${channel}/cuentas?status=suspended`)} style={{ fontSize: 11, color: '#e05252', marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'block', textAlign: 'left' }}>{igStatus.suspendidas} baneadas · {igStatus.shadow} shadow ban →</button>
            )}
            {igStatus.nuevas > 0 && (
              <button onClick={() => router.push(`/crm/${channel}/cuentas?status=new`)} style={{ fontSize: 11, color: '#5b8dd9', marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'block', textAlign: 'left' }}>{igStatus.nuevas} nuevas en calentamiento →</button>
            )}
          </div>
          <div style={{ height: 44 }} />
        </div>
      </div>

      {/* Main content + right sidebar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Left: chart + tabs + table */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Growth chart */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Crecimiento de seguidores</div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6 }}>
                  {chartSeries.filter(s => s.points.length >= 2).slice(0, 12).map(s => (
                    <div key={s.username} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{activeModel === 'all' ? s.username : `@${s.username}`}</span>
                    </div>
                  ))}
                </div>
              </div>
              {totalNuevos !== 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: totalNuevos >= 0 ? '#34c759' : '#e05252', lineHeight: 1 }}>
                    {totalNuevos >= 0 ? '+' : ''}{fmt(totalNuevos)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>en 30 días</div>
                </div>
              )}
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              {loading ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
              ) : (
                <GrowthChart
                  series={chartSeries}
                  onSeriesClick={username => {
                    if (activeModel === 'all') {
                      setActiveModel(username)
                    } else {
                      const acc = accounts.find(a => a.username === username)
                      if (acc) setSelectedAccount(acc)
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* Model tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['all', ...models].map(m => {
              const cnt = m === 'all' ? accounts.length : accounts.filter(a => a.model === m).length
              const active = activeModel === m
              return (
                <button key={m} onClick={() => { setActiveModel(m); resetTableFilters() }} style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', background: active ? '#d4a843' : 'var(--surface)', color: active ? '#000' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m === 'all' ? 'Todos' : m}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: active ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)', color: active ? '#000' : 'var(--muted)' }}>{cnt}</span>
                </button>
              )
            })}
          </div>

          {/* Employee tabs — sourced from Usuarios (erp_users), matched by employeeId */}
          {realEmployees.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[{ id: 'all', name: 'Todos los empleados' }, ...realEmployees].map(e => {
                const cnt = e.id === 'all' ? accounts.length : accounts.filter(a => a.employeeId === e.id).length
                const active = activeEmployee === e.id
                return (
                  <button key={e.id} onClick={() => { setActiveEmployee(e.id); resetTableFilters() }} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: active ? 700 : 500, cursor: 'pointer', background: active ? '#5b8dd9' : 'var(--surface)', color: active ? '#fff' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {e.name}
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)', color: active ? '#fff' : 'var(--muted)' }}>{cnt}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Origen filter + breakdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'Instagram', 'JailBreak'] as const).map(o => {
                const active = activeOrigen === o
                return (
                  <button key={o} onClick={() => { setActiveOrigen(o); resetTableFilters() }} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: active ? 700 : 500, cursor: 'pointer', background: active ? '#34c759' : 'var(--surface)', color: active ? '#000' : 'var(--muted)', border: active ? 'none' : '1px solid var(--border)' }}>
                    {o === 'all' ? 'Todo origen' : o}
                  </button>
                )
              })}
            </div>
            {(activeModel !== 'all' || activeEmployee !== 'all') && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Diferencia: <span style={{ color: '#e8ecf5', fontWeight: 700 }}>{origenBreakdown.instagram} Instagram</span>
                {' · '}
                <span style={{ color: '#d4a843', fontWeight: 700 }}>{origenBreakdown.jailbreak} JailBreak</span>
              </span>
            )}
          </div>

          {/* Account table */}
          {!loading && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                  {activeModel === 'all' ? 'Todas las cuentas' : activeModel}{' '}
                  ({tableFiltered.length}{tableFiltered.length !== viewAccounts.length ? ` de ${viewAccounts.length}` : ''})
                </span>
                <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 280 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2.5"
                    style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    value={tableSearch}
                    onChange={e => { setTableSearch(e.target.value); setTablePage(0) }}
                    placeholder="Buscar @cuenta, modelo…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '5px 10px 5px 28px', borderRadius: 7, background: '#060c1f', border: '1px solid #1c2240', color: '#e8ecf5', fontSize: 12, outline: 'none' }}
                  />
                  {tableSearch && (
                    <button onClick={() => { setTableSearch(''); setTablePage(0) }}
                      style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                  )}
                </div>
                {(tableSort || tableStatusCycle > 0 || tableSearch) && (
                  <button onClick={() => { setTableSort(null); setTableStatusCycle(0); setTableSearch(''); setTablePage(0) }}
                    style={{ fontSize: 10, color: '#7280a0', background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, flexShrink: 0 }}>
                    ✕ Limpiar
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {([
                        { col: 'cuenta', label: 'Cuenta' },
                        { col: 'modelo', label: 'Modelo' },
                        { col: 'seguidores', label: 'Seguidores' },
                        { col: 'ganados', label: 'Ganados hoy' },
                        { col: 'empleado', label: 'Empleado' },
                        { col: 'movil', label: 'Móvil' },
                        { col: 'engagement', label: 'Eng.' },
                        { col: 'origen', label: 'Origen' },
                      ] as { col: string; label: string }[]).map(({ col, label }) => (
                        <th key={col} onClick={() => toggleSort(col)} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: tableSort?.col === col ? '#d4a843' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                          {label}{sortArrow(col)}
                        </th>
                      ))}
                      <th onClick={cycleStatus} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: statusCycleColors[tableStatusCycle], textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                        Estado{' '}
                        <span style={{ fontSize: tableStatusCycle === 0 ? 8 : 9, color: tableStatusCycle === 0 ? 'rgba(255,255,255,0.15)' : statusCycleColors[tableStatusCycle], marginLeft: 3 }}>
                          {statusCycleIcons[tableStatusCycle]}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablePageData.map((acc, i) => {
                        const f = acc.seguidores
                        const g = acc.latest?.seguidoresGanados ?? null
                        const sc = acc.status === 'active' ? '#34c759' : acc.status === 'suspended' ? '#e05252'
                          : acc.status === 'pool_assigned' ? '#5b8dd9' : acc.status === 'pool_available' ? '#d4a843' : acc.status === 'pool_expired' ? '#6b7280' : '#f5a623'
                        const sl = acc.status === 'active' ? 'Activa' : acc.status === 'suspended' ? 'Baneada' : acc.status === 'shadow banned' ? 'Warning'
                          : acc.status === 'pool_assigned' ? 'Asignada' : acc.status === 'pool_available' ? 'Disponible' : acc.status === 'pool_expired' ? 'Expirada' : acc.status
                        const engColor = acc.engagement !== null ? (acc.engagement >= 3 ? '#34c759' : acc.engagement >= 1 ? '#f5a623' : '#6b7280') : '#2a3450'
                        return (
                          <tr key={acc.id} onClick={() => setSelectedAccount(acc)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{ padding: '9px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: lineColor(tablePage * TABLE_PAGE_SIZE + i), flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>@{acc.username}</span>
                              </div>
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              {acc.model ? <button onClick={(e) => { e.stopPropagation(); router.push(`/crm/${channel}/modelos?modelo=${encodeURIComponent(acc.model!)}`) }} style={{ fontSize: 12, color: '#d4a843', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{acc.model}</button> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ padding: '9px 14px', fontWeight: 800, color: '#fff', fontSize: 13 }}>{f !== null ? fmt(f) : '—'}</td>
                            <td style={{ padding: '9px 14px', fontWeight: 700, fontSize: 13, color: g !== null ? (g >= 0 ? '#34c759' : '#e05252') : 'var(--muted)' }}>
                              {g !== null ? `${g >= 0 ? '+' : ''}${fmt(g)}` : '—'}
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              {acc.employeeId ? <button onClick={(e) => { e.stopPropagation(); setActiveEmployee(acc.employeeId!) }} style={{ fontSize: 12, color: '#5b8dd9', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{acc.employee}</button> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>{acc.employee ?? '—'}</span>}
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              {acc.phoneRef ? <button onClick={(e) => { e.stopPropagation(); router.push(`/crm/${channel}/moviles?movil=${encodeURIComponent(acc.phoneRef!)}`) }} style={{ fontSize: 12, color: '#5b8dd9', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{acc.phoneRef}</button> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 700, color: engColor }}>
                              {acc.engagement !== null ? acc.engagement.toFixed(1) + '%' : '—'}
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: acc.origen === 'JailBreak' ? 'rgba(212,168,67,0.15)' : 'rgba(91,141,217,0.15)', color: acc.origen === 'JailBreak' ? '#d4a843' : '#5b8dd9' }}>{acc.origen}</span>
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: sc + '22', color: sc }}>{sl}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {tableTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {tablePage * TABLE_PAGE_SIZE + 1}–{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, tableFiltered.length)} de {tableFiltered.length}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0}
                        style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: tablePage === 0 ? '#2a3450' : 'var(--muted)', cursor: tablePage === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                        ← Ant.
                      </button>
                      {Array.from({ length: Math.min(tableTotalPages, 7) }, (_, i) => {
                        const p = tableTotalPages <= 7 ? i : Math.max(0, Math.min(tablePage - 3, tableTotalPages - 7)) + i
                        return (
                          <button key={p} onClick={() => setTablePage(p)}
                            style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: p === tablePage ? '#d4a843' : 'var(--surface)', color: p === tablePage ? '#000' : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: p === tablePage ? 700 : 400 }}>
                            {p + 1}
                          </button>
                        )
                      })}
                      <button onClick={() => setTablePage(p => Math.min(tableTotalPages - 1, p + 1))} disabled={tablePage === tableTotalPages - 1}
                        style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: tablePage === tableTotalPages - 1 ? '#2a3450' : 'var(--muted)', cursor: tablePage === tableTotalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>
                        Sig. →
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Objetivo del mes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Objetivo del mes</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <DonutGauge pct={loading ? 0 : goalPct} color="#d4a843" />
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
              {fmt(Math.max(totalNuevos, 0))} de {fmt(Math.round((totals?.totalFollowers ?? 0) * 0.05))} nuevos seguidores
            </div>
          </div>

          {/* Dispositivos */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dispositivos</div>
              <button onClick={() => router.push(`/crm/${channel}/moviles`)} style={{ fontSize: 11, color: '#5b8dd9', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>Ver →</button>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 2 }}>
              {phones.length} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>/ {phones.length} online</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {phones.slice(0, 18).map((p, i) => (
                <button key={p} title={p} onClick={() => router.push(`/crm/${channel}/moviles?movil=${encodeURIComponent(p)}`)} style={{ width: 20, height: 20, borderRadius: 6, background: lineColor(i), flexShrink: 0, cursor: 'pointer', border: 'none', padding: 0 }} />
              ))}
              {phones.length > 18 && (
                <button onClick={() => router.push(`/crm/${channel}/moviles`)} style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(91,141,217,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#5b8dd9', fontWeight: 700, cursor: 'pointer', border: 'none', padding: 0 }}>+{phones.length - 18}</button>
              )}
            </div>
          </div>

          {/* Estado Instagram */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Estado Instagram</div>
            {[
              { label: 'Activas', value: igStatus.activas, color: '#34c759' },
              { label: 'Shadow Ban', value: igStatus.shadow, color: '#f5a623' },
              { label: 'Suspendidas', value: igStatus.suspendidas, color: '#e05252' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{row.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: row.color }}>{loading ? '…' : row.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Sin asignar</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--muted)' }}>{loading ? '…' : totalCount - igStatus.activas - igStatus.shadow - igStatus.suspendidas}</span>
            </div>
          </div>

          {/* Modelos resumen */}
          {models.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Por Modelo</div>
              {models.map((m, mi) => {
                const accs = accounts.filter(a => a.model === m)
                const tf = accs.reduce((s, a) => s + (a.seguidores ?? 0), 0)
                const pct = totals?.totalFollowers ? (tf / totals.totalFollowers) * 100 : 0
                return (
                  <div key={m} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <button onClick={() => router.push(`/crm/${channel}/modelos?modelo=${encodeURIComponent(m)}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: lineColor(mi), display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#5b8dd9', fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{m}</span>
                      </button>
                      <button onClick={() => setActiveModel(m)} style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{fmt(tf)}</button>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: lineColor(mi), borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Account modal */}
      {selectedAccount && <AccountModal account={selectedAccount} onClose={() => setSelectedAccount(null)} channel={channel} />}
    </div>
  )
}
