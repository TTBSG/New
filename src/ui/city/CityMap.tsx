import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import { isRoad, parcelRent, parcelTraffic } from '../../game/city'
import type { Business, City, Parcel } from '../../game/types'
import { signed } from '../format'
import { Icon, type IconName } from '../icons'
import { GROUND, MAP_H, MAP_W, P, ParcelObject, SHOP_HEIGHT, diamond } from './iso'

export type Overlay = 'none' | 'traffic' | 'rent' | 'rivals'
/** Moment de la journée affiché : matin, midi, soir. */
export type Phase = 0 | 1 | 2
export type LocalEventMark = { districtId: string; title: string; mult: number }
export type ShopStatus = { queue: boolean; alert: boolean }

/** Rampes séquentielles (une teinte, du clair au foncé) pour les calques d'analyse. */
const RAMPS: Record<Exclude<Overlay, 'none'>, [string, string]> = {
  traffic: ['#dcebfc', '#1f5fb0'],
  rent: ['#fde6d6', '#b4471a'],
  rivals: ['#fbe9e7', '#a3231b'],
}

function mix(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16))
  const cb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16))
  return '#' + ca.map((v, k) => Math.round(v + (cb[k] - v) * t).toString(16).padStart(2, '0')).join('')
}

const MIN_K = 0.45
const MAX_K = 2.4

interface View {
  x: number
  y: number
  k: number
}

const Ground = memo(function Ground({ city, overlay, pressure }: { city: City; overlay: Overlay; pressure: Record<string, number> }) {
  const tiles = []
  let lo = Infinity
  let hi = -Infinity
  const value = (p: Parcel) => (overlay === 'traffic' ? parcelTraffic(p) : overlay === 'rivals' ? (pressure[p.id] ?? 0) : parcelRent(p))
  if (overlay !== 'none') {
    for (const p of city.parcels) {
      if (p.kind !== 'lot') continue
      lo = Math.min(lo, value(p))
      hi = Math.max(hi, value(p))
    }
    // Sans aucun concurrent, toute la ville est « libre » plutôt qu'à mi-teinte.
    if (overlay === 'rivals') lo = 0
  }
  for (let i = 0; i < city.size; i++) {
    for (let j = 0; j < city.size; j++) {
      if (!isRoad(i, j)) continue
      tiles.push(<polygon key={`r${i}-${j}`} points={diamond(i, j)} fill="#9a9590" stroke="#8b8681" strokeWidth={0.6} />)
      const onI = city.roads.includes(i)
      const onJ = city.roads.includes(j)
      if (onI !== onJ) {
        const [a, b] = onI ? [P(i + 0.5, j + 0.2), P(i + 0.5, j + 0.8)] : [P(i + 0.2, j + 0.5), P(i + 0.8, j + 0.5)]
        tiles.push(<line key={`m${i}-${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#f4efe6" strokeWidth={1.6} strokeDasharray="5 5" />)
      }
    }
  }
  for (const p of city.parcels) {
    let fill = p.kind === 'park' ? '#b9e0a0' : GROUND[p.districtId]
    if (overlay !== 'none') {
      fill = p.kind === 'lot' ? mix(RAMPS[overlay][0], RAMPS[overlay][1], hi > lo ? (value(p) - lo) / (hi - lo) : overlay === 'rivals' ? 0 : 0.5) : '#e6e2db'
    }
    tiles.push(<polygon key={p.id} data-parcel={p.id} points={diamond(p.i, p.j)} fill={fill} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} />)
  }
  return <g>{tiles}</g>
})

export type WarehouseMark = { parcelId: string; sectorId: string; height: number; shops: string[] }
export type RivalMark = { parcelId: string; sectorId: string; color: string }

const Objects = memo(function Objects({
  city,
  shops,
  hq,
  warehouses,
  rivals,
  closed,
  faded,
}: {
  city: City
  shops: Record<string, string>
  hq: { parcelId: string; height: number } | null
  warehouses: WarehouseMark[]
  rivals: RivalMark[]
  /** Parcelles des commerces fermés sur le créneau affiché, séparées par des virgules. */
  closed: string
  faded: boolean
}) {
  const closedSet = useMemo(() => new Set(closed.split(',')), [closed])
  const sorted = useMemo(() => [...city.parcels].sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i), [city])
  return (
    <g className={faded ? 'faded' : undefined}>
      {sorted.map((p) => (
        <ParcelObject
          key={p.id}
          parcel={p}
          shopSectorId={shops[p.id]}
          hqHeight={hq?.parcelId === p.id ? hq.height : undefined}
          warehouse={warehouses.find((w) => w.parcelId === p.id)}
          rivalColor={rivals.find((r) => r.parcelId === p.id)?.color}
          closed={closedSet.has(p.id)}
        />
      ))}
    </g>
  )
})

const WALKER_COLORS = ['#5c8de8', '#d65db1', '#4cb86b', '#f2b134', '#e8743b', '#8a6142']

/** Passants qui font des allers-retours devant une boutique : plus elle est fréquentée, plus il y en a. */
const Walkers = memo(function Walkers({ i, j, visitors }: { i: number; j: number; visitors: number }) {
  const count = visitors > 0 ? Math.min(5, Math.max(1, Math.round(visitors / 110))) : 0
  const [ax, ay] = P(i + 0.06, j + 1.1)
  const [bx, by] = P(i + 0.94, j + 1.1)
  return (
    <g pointerEvents="none">
      {Array.from({ length: count }, (_, k) => {
        const dur = 6 + ((i * 7 + j * 3 + k * 5) % 5)
        return (
          <g key={k}>
            <rect x={-2.5} y={-9} width={5} height={7} rx={2} fill={WALKER_COLORS[(i + j + k) % WALKER_COLORS.length]} />
            <circle cx={0} cy={-11} r={2.6} fill="#f1c9a5" />
            <animateMotion
              dur={`${dur}s`}
              begin={`-${(k * dur) / count}s`}
              repeatCount="indefinite"
              path={`M${ax.toFixed(1)},${ay.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)} L${ax.toFixed(1)},${ay.toFixed(1)}`}
            />
          </g>
        )
      })}
    </g>
  )
})

const CAR_COLORS = ['#e8743b', '#5c8de8', '#f4f4f4', '#3b2f2a', '#4cb86b', '#f2b134']

/** Circulation d'ambiance : voitures sur les rues et passants sur les trottoirs. */
const Traffic = memo(function Traffic({ city }: { city: City }) {
  const n = city.size
  const line = (road: number, alongJ: boolean, offset: number, reverse: boolean) => {
    const a = alongJ ? P(road + 0.5 + offset, 0) : P(0, road + 0.5 + offset)
    const b = alongJ ? P(road + 0.5 + offset, n) : P(n, road + 0.5 + offset)
    const [from, to] = reverse ? [b, a] : [a, b]
    return `M${from[0].toFixed(1)},${from[1].toFixed(1)} L${to[0].toFixed(1)},${to[1].toFixed(1)}`
  }
  const cars = []
  const walkers = []
  let k = 0
  for (const road of city.roads) {
    for (const alongJ of [true, false]) {
      for (const reverse of [false, true]) {
        const dur = 16 + ((road * 3 + k * 5) % 9)
        cars.push(
          <g key={`c${k}`} className={k % 3 === 0 ? 'day-only' : undefined}>
            <rect x={-6} y={-3.2} width={12} height={6.4} rx={2.4} fill={CAR_COLORS[k % CAR_COLORS.length]} stroke="rgb(0 0 0 / 0.25)" strokeWidth={0.6} />
            <rect x={-1} y={-2.4} width={4} height={4.8} rx={1} fill="#cfe6f2" />
            <rect x={5} y={-2.6} width={1.6} height={1.6} className="headlight" fill="#fff6c9" />
            <rect x={5} y={1} width={1.6} height={1.6} className="headlight" fill="#fff6c9" />
            <animateMotion dur={`${dur}s`} begin={`-${(k * 3.7) % dur}s`} repeatCount="indefinite" rotate="auto" path={line(road, alongJ, reverse ? -0.2 : 0.2, reverse)} />
          </g>,
        )
        const wdur = 48 + ((road * 5 + k * 7) % 22)
        walkers.push(
          <g key={`w${k}`} className={k % 2 === 0 ? 'day-only' : undefined}>
            <rect x={-2.2} y={-8} width={4.4} height={6.5} rx={2} fill={WALKER_COLORS[(k * 2 + road) % WALKER_COLORS.length]} />
            <circle cx={0} cy={-10} r={2.4} fill="#f1c9a5" />
            <path className="umbrella" d="M-6,-13 a6,5 0 0 1 12,0z" fill={CAR_COLORS[(k + 1) % 2]} />
            <animateMotion dur={`${wdur}s`} begin={`-${(k * 11.3) % wdur}s`} repeatCount="indefinite" path={line(road, alongJ, reverse ? -0.56 : 0.56, reverse)} />
          </g>,
        )
        k++
      }
    }
  }
  return (
    <g pointerEvents="none">
      {cars}
      {walkers}
    </g>
  )
})

/** Carrefour intérieur de chaque quartier : c'est là que s'installent marchés, festivals et chantiers. */
const DISTRICT_SPOT: Record<string, [number, number]> = { residentiel: [2, 2], affaires: [10, 2], commercial: [2, 10], centre: [10, 10] }
const TENT_COLORS = ['#e85d8a', '#f2b134', '#5c8de8', '#4cb86b']

const EventDecor = memo(function EventDecor({ districtId, positive }: { districtId: string; positive: boolean }) {
  const [ci, cj] = DISTRICT_SPOT[districtId]
  const spots: [number, number][] = [
    [ci + 0.5, cj - 0.6],
    [ci + 0.5, cj + 1.6],
    [ci - 0.6, cj + 0.5],
    [ci + 1.6, cj + 0.5],
  ]
  return (
    <g pointerEvents="none">
      {spots.map(([a, b], k) => {
        const [x, y] = P(a, b)
        return positive ? (
          <g key={k}>
            <path d={`M${x - 9},${y} L${x},${y - 14} L${x + 9},${y}Z`} fill={TENT_COLORS[k]} stroke="#fff" strokeWidth={1} />
            <path d={`M${x - 3},${y} L${x},${y - 6} L${x + 3},${y}Z`} fill="rgb(0 0 0 / 0.3)" />
          </g>
        ) : (
          <g key={k}>
            <path d={`M${x - 4},${y} L${x},${y - 11} L${x + 4},${y}Z`} fill="#f2811d" stroke="#fff" strokeWidth={0.8} />
            <rect x={x - 3} y={y - 6} width={6} height={2} fill="#fff" />
            {k === 0 && <rect x={x + 8} y={y - 8} width={22} height={5} rx={1} fill="url(#barrier)" stroke="#8a6142" strokeWidth={0.6} />}
          </g>
        )
      })}
    </g>
  )
})

/** Un camion fait le tour des boutiques livrées par l'entrepôt, en suivant les axes de la grille. */
const Trucks = memo(function Trucks({ from, to }: { from: Parcel; to: Parcel[] }) {
  if (!to.length) return null
  const stops = [from, ...to, from]
  let path = ''
  for (let k = 0; k < stops.length; k++) {
    const a = stops[k]
    const [x, y] = P(a.i + 0.5, a.j + 1.1)
    if (k === 0) path += `M${x.toFixed(1)},${y.toFixed(1)}`
    else {
      const prev = stops[k - 1]
      const [cx, cy] = P(a.i + 0.5, prev.j + 1.1)
      path += ` L${cx.toFixed(1)},${cy.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`
    }
  }
  return (
    <g pointerEvents="none">
      <g>
        <rect x={-7} y={-9} width={14} height={8} rx={2} fill="#f4f4f4" stroke="#9aa0ad" strokeWidth={0.8} />
        <rect x={3} y={-7} width={5} height={6} rx={1} fill="#e8743b" />
        <circle cx={-4} cy={-1} r={1.6} fill="#3b2f2a" />
        <circle cx={4} cy={-1} r={1.6} fill="#3b2f2a" />
        <animateMotion dur={`${8 + to.length * 6}s`} repeatCount="indefinite" path={path} />
      </g>
    </g>
  )
})

const DISTRICT_AT: Record<string, string> = { RÉSIDENTIEL: 'residentiel', AFFAIRES: 'affaires', COMMERCIAL: 'commercial', 'CENTRE-VILLE': 'centre' }
const DISTRICT_LABELS: [number, number, string][] = [
  [3.5, 3.5, 'RÉSIDENTIEL'],
  [9.5, 3.5, 'AFFAIRES'],
  [3.5, 9.5, 'COMMERCIAL'],
  [9.5, 9.5, 'CENTRE-VILLE'],
]

export function CityMap({
  city,
  businesses,
  hq,
  warehouses,
  rivals,
  links,
  phase,
  closed,
  status,
  localEvents,
  pressure,
  selectedId,
  overlay,
  onSelect,
}: {
  city: City
  businesses: Business[]
  hq: { parcelId: string; height: number } | null
  warehouses: WarehouseMark[]
  rivals: RivalMark[]
  /** Commerces en concurrence avec la parcelle sélectionnée : paires de parcelles à relier. */
  links: [string, string][]
  phase: Phase
  /** Parcelles des commerces fermés sur le créneau affiché. */
  closed: string
  status: Record<string, ShopStatus>
  localEvents: LocalEventMark[]
  /** Pression concurrentielle par parcelle, pour le calque « Concurrence ». */
  pressure: Record<string, number>
  selectedId: string | null
  overlay: Overlay
  onSelect: (parcelId: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 390, h: 700 })
  const [view, setView] = useState<View | null>(null)
  const viewRef = useRef<View | null>(null)
  viewRef.current = view

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clamp = useCallback(
    (v: View): View => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k))
      // On garde toujours une partie de la ville au centre de l'écran.
      const x = Math.min(size.w * 0.6, Math.max(size.w * 0.4 - MAP_W * k, v.x))
      const y = Math.min(size.h * 0.5, Math.max(size.h * 0.3 - MAP_H * k, v.y))
      return { x, y, k }
    },
    [size],
  )

  // Cadrage initial : la ville centrée, assez zoomée pour être lisible.
  useEffect(() => {
    if (view) return
    const k = Math.max(0.8, Math.min(1.1, size.w / 440))
    setView(clamp({ k, x: size.w / 2 - (MAP_W / 2) * k, y: size.h * 0.5 - (MAP_H / 2) * k }))
  }, [size, view, clamp])

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const v = viewRef.current
      if (!v) return
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
      setView(clamp({ k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }))
    },
    [clamp],
  )

  // ---------- Gestes : glisser pour se déplacer, pincer pour zoomer, toucher pour sélectionner ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, pinchDist: 0, pinchK: 1, lastMid: { x: 0, y: 0 } })

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: RPointerEvent) => {
    pointers.current.set(e.pointerId, local(e))
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // Sans capture, le geste fonctionne tant que le doigt reste sur la carte.
    }
    if (pointers.current.size === 1) gesture.current.moved = 0
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.pinchK = viewRef.current?.k ?? 1
      gesture.current.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture.current.moved = 99
    }
  }

  const onPointerMove = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    const v = viewRef.current
    if (!prev || !v) return
    const cur = local(e)
    pointers.current.set(e.pointerId, cur)
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      gesture.current.moved += Math.abs(dx) + Math.abs(dy)
      setView(clamp({ ...v, x: v.x + dx, y: v.y + dy }))
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const k = Math.min(MAX_K, Math.max(MIN_K, (gesture.current.pinchK * dist) / gesture.current.pinchDist))
      const last = gesture.current.lastMid
      gesture.current.lastMid = mid
      setView(clamp({ k, x: mid.x - ((last.x - v.x) * k) / v.k, y: mid.y - ((last.y - v.y) * k) / v.k }))
    }
  }

  const onPointerUp = (e: RPointerEvent) => {
    const wasTap = pointers.current.size === 1 && gesture.current.moved < 8
    pointers.current.delete(e.pointerId)
    if (!wasTap) return
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof SVGElement && el.closest('[data-parcel]'))
    const id = target?.closest('[data-parcel]')?.getAttribute('data-parcel') ?? null
    onSelect(id)
  }

  const onWheel = (e: RWheelEvent) => {
    const p = local(e)
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const shops = useMemo(() => Object.fromEntries(businesses.map((b) => [b.parcelId, b.sectorId])), [businesses])
  const parcelsById = useMemo(() => Object.fromEntries(city.parcels.map((p) => [p.id, p])), [city])
  const selected = selectedId ? parcelsById[selectedId] : null

  return (
    <div className={`citymap phase-${phase} ${overlay !== 'none' ? 'analysis' : ''}`} ref={wrapRef}>
      {view && (
        <svg
          width={size.w}
          height={size.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onWheel={onWheel}
          role="application"
          aria-label="Carte de la ville"
        >
          <defs>
            <pattern id="barrier" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} fill="#fff" />
              <rect width={3} height={6} fill="#e8472b" />
            </pattern>
          </defs>
          <g transform={`translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`}>
            <Ground city={city} overlay={overlay} pressure={pressure} />
            {overlay === 'none' && <Traffic city={city} />}
            {overlay === 'none' && localEvents.map((e) => <EventDecor key={e.districtId} districtId={e.districtId} positive={e.mult >= 1} />)}
            {selected && <polygon points={diamond(selected.i, selected.j, 0.04)} fill="none" stroke="#e8743b" strokeWidth={3} className="sel-ring" />}
            <Objects city={city} shops={shops} hq={hq} warehouses={warehouses} rivals={rivals} closed={closed} faded={overlay !== 'none'} />
            {/* Lumière du moment : aube dorée le matin, bleu nuit le soir. */}
            {overlay === 'none' && <rect x={-3000} y={-3000} width={8000} height={8000} className="daylight" pointerEvents="none" />}
            {links.map(([from, to]) => {
              const [x1, y1] = P(parcelsById[from].i + 0.5, parcelsById[from].j + 0.5, SHOP_HEIGHT + 6)
              const [x2, y2] = P(parcelsById[to].i + 0.5, parcelsById[to].j + 0.5, SHOP_HEIGHT + 6)
              return <line key={`${from}-${to}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d64545" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" className="rival-link" pointerEvents="none" />
            })}
            {DISTRICT_LABELS.map(([a, b, t]) => {
              const [x, y] = P(a, b)
              return (
                <g key={t} pointerEvents="none">
                  <rect x={x - 48} y={y - 10} width={96} height={20} rx={10} fill="#3b2f2a" opacity={0.72} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff" fontFamily="Nunito, system-ui">
                    {t}
                  </text>
                  {localEvents
                    .filter((e) => DISTRICT_AT[t] === e.districtId)
                    .map((e) => {
                      const label = `${e.title} ${e.mult >= 1 ? '+' : '−'}${Math.abs(Math.round((e.mult - 1) * 100))} %`
                      const w = label.length * 5.6 + 16
                      return (
                        <g key={e.title}>
                          <rect x={x - w / 2} y={y + 13} width={w} height={18} rx={9} fill="#fff" stroke={e.mult >= 1 ? '#2f9e55' : '#d64545'} strokeWidth={1.5} />
                          <text x={x} y={y + 25.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#3b2f2a" fontFamily="Nunito, system-ui">
                            {label}
                          </text>
                        </g>
                      )
                    })}
                </g>
              )
            })}
            {businesses.map((b) => {
              // File d'attente devant la porte quand l'équipe n'arrive pas à suivre.
              if (!status[b.id]?.queue) return null
              const p = parcelsById[b.parcelId]
              return (
                <g key={`q${b.id}`} pointerEvents="none" className="queue">
                  {[0, 1, 2, 3].map((k) => {
                    const [x, y] = P(p.i + 0.72 - k * 0.15, p.j + 1.02 + k * 0.05)
                    return (
                      <g key={k} transform={`translate(${x} ${y})`}>
                        <rect x={-2.5} y={-9} width={5} height={7} rx={2} fill={WALKER_COLORS[(k + p.i) % WALKER_COLORS.length]} />
                        <circle cx={0} cy={-11} r={2.6} fill="#f1c9a5" />
                      </g>
                    )
                  })}
                </g>
              )
            })}
            {businesses.map((b) => (
              <Walkers key={b.id} i={parcelsById[b.parcelId].i} j={parcelsById[b.parcelId].j} visitors={b.history.at(-1)?.visitors ?? 0} />
            ))}
            {businesses.map((b) => {
              const p = parcelsById[b.parcelId]
              const [x, y] = P(p.i + 0.5, p.j + 0.5, SHOP_HEIGHT + 14)
              const last = b.history.at(-1)
              const active = selectedId === p.id
              return (
                <g key={b.id} data-parcel={p.id} transform={`translate(${x} ${y})`}>
                  <g className={active ? 'pin-bounce' : undefined}>
                    <path d="M0 0 C-14 -16 -14 -34 0 -34 C14 -34 14 -16 0 0Z" fill="#e8743b" stroke="#fff" strokeWidth={2.5} />
                    <Icon name={b.sectorId as IconName} size={16} x={-8} y={-29} color="#fff" strokeWidth={2.2} />
                    {last && view.k >= 0.55 && (
                      <g>
                        <rect x={-34} y={-58} width={68} height={19} rx={9.5} fill="#fff" />
                        <text x={0} y={-44.5} textAnchor="middle" fontSize={11} fontWeight={900} fontFamily="Nunito, system-ui" fill={last.profit >= 0 ? '#2f9e55' : '#d64545'}>
                          {signed(last.profit)}/j
                        </text>
                      </g>
                    )}
                    {status[b.id]?.alert && (
                      <g className="pin-alert">
                        <circle cx={12} cy={-32} r={7.5} fill="#d64545" stroke="#fff" strokeWidth={2} />
                        <rect x={11} y={-36.5} width={2} height={6} rx={1} fill="#fff" />
                        <circle cx={12} cy={-28.2} r={1.2} fill="#fff" />
                      </g>
                    )}
                  </g>
                </g>
              )
            })}
            {rivals.map((r) => {
              const p = parcelsById[r.parcelId]
              if (shops[p.id]) return null
              const [x, y] = P(p.i + 0.5, p.j + 0.5, SHOP_HEIGHT + 30)
              return (
                <g key={r.parcelId} data-parcel={p.id} transform={`translate(${x} ${y})`}>
                  <g className={selectedId === p.id ? 'pin-bounce' : undefined}>
                    <circle r={11} fill={r.color} stroke="#fff" strokeWidth={2.5} />
                    <Icon name={r.sectorId as IconName} size={13} x={-6.5} y={-6.5} color="#fff" strokeWidth={2.2} />
                  </g>
                </g>
              )
            })}
            {warehouses.map((w) => (
              <Trucks key={w.parcelId} from={parcelsById[w.parcelId]} to={w.shops.map((id) => parcelsById[id]).filter(Boolean)} />
            ))}
            {warehouses.map((w) => {
              const p = parcelsById[w.parcelId]
              const [x, y] = P(p.i + 0.5, p.j + 0.5, w.height + 16)
              return (
                <g key={w.parcelId} data-parcel={p.id} transform={`translate(${x} ${y})`}>
                  <g className={selectedId === p.id ? 'pin-bounce' : undefined}>
                    <path d="M0 0 C-14 -16 -14 -34 0 -34 C14 -34 14 -16 0 0Z" fill="#6b7280" stroke="#fff" strokeWidth={2.5} />
                    <Icon name="truck" size={16} x={-8} y={-29} color="#fff" strokeWidth={2.2} />
                  </g>
                </g>
              )
            })}
            {hq &&
              (() => {
                const p = parcelsById[hq.parcelId]
                const [x, y] = P(p.i + 0.5, p.j + 0.5, hq.height + 40)
                return (
                  <g data-parcel={p.id} transform={`translate(${x} ${y})`}>
                    <g className={selectedId === p.id ? 'pin-bounce' : undefined}>
                      <path d="M0 0 C-14 -16 -14 -34 0 -34 C14 -34 14 -16 0 0Z" fill="#3d4f7c" stroke="#fff" strokeWidth={2.5} />
                      <Icon name="tower" size={16} x={-8} y={-29} color="#fff" strokeWidth={2.2} />
                    </g>
                  </g>
                )
              })()}
            {selected && !shops[selected.id] && selected.id !== hq?.parcelId && !warehouses.some((w) => w.parcelId === selected.id) && !rivals.some((r) => r.parcelId === selected.id) && (
              <g transform={`translate(${P(selected.i + 0.5, selected.j + 0.5)[0]} ${P(selected.i + 0.5, selected.j + 0.5)[1] - 44})`} pointerEvents="none">
                <g className="pin-bounce">
                  <path d="M-9 -12 L0 0 L9 -12Z" fill="#e8743b" stroke="#fff" strokeWidth={2} />
                </g>
              </g>
            )}
          </g>
        </svg>
      )}
      <div className="zoom-ctrl">
        <button className="round-btn" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.25)} aria-label="Zoomer">
          <Icon name="plus" />
        </button>
        <button className="round-btn" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.8)} aria-label="Dézoomer">
          <Icon name="minus" />
        </button>
      </div>
    </div>
  )
}
