import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import { isRoad, parcelRent, parcelTraffic } from '../../game/city'
import type { Business, City, Parcel } from '../../game/types'
import { signed } from '../format'
import { Icon, type IconName } from '../icons'
import { GROUND, MAP_H, MAP_W, P, ParcelObject, SHOP_HEIGHT, diamond } from './iso'

export type Overlay = 'none' | 'traffic' | 'rent'

/** Rampes séquentielles (une teinte, du clair au foncé) pour les calques d'analyse. */
const RAMPS: Record<Exclude<Overlay, 'none'>, [string, string]> = {
  traffic: ['#dcebfc', '#1f5fb0'],
  rent: ['#fde6d6', '#b4471a'],
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

const Ground = memo(function Ground({ city, overlay }: { city: City; overlay: Overlay }) {
  const tiles = []
  let lo = Infinity
  let hi = -Infinity
  const value = (p: Parcel) => (overlay === 'traffic' ? parcelTraffic(p) : parcelRent(p))
  if (overlay !== 'none') {
    for (const p of city.parcels) {
      if (p.kind !== 'lot') continue
      lo = Math.min(lo, value(p))
      hi = Math.max(hi, value(p))
    }
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
      fill = p.kind === 'lot' ? mix(RAMPS[overlay][0], RAMPS[overlay][1], hi > lo ? (value(p) - lo) / (hi - lo) : 0.5) : '#e6e2db'
    }
    tiles.push(<polygon key={p.id} data-parcel={p.id} points={diamond(p.i, p.j)} fill={fill} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} />)
  }
  return <g>{tiles}</g>
})

const Objects = memo(function Objects({ city, shops, faded }: { city: City; shops: Record<string, string>; faded: boolean }) {
  const sorted = useMemo(() => [...city.parcels].sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i), [city])
  return (
    <g className={faded ? 'faded' : undefined}>
      {sorted.map((p) => (
        <ParcelObject key={p.id} parcel={p} shopSectorId={shops[p.id]} />
      ))}
    </g>
  )
})

const DISTRICT_LABELS: [number, number, string][] = [
  [3.5, 3.5, 'RÉSIDENTIEL'],
  [9.5, 3.5, 'AFFAIRES'],
  [3.5, 9.5, 'COMMERCIAL'],
  [9.5, 9.5, 'CENTRE-VILLE'],
]

export function CityMap({
  city,
  businesses,
  selectedId,
  overlay,
  onSelect,
}: {
  city: City
  businesses: Business[]
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
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
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
    <div className="citymap" ref={wrapRef}>
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
          <g transform={`translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`}>
            <Ground city={city} overlay={overlay} />
            {selected && <polygon points={diamond(selected.i, selected.j, 0.04)} fill="none" stroke="#e8743b" strokeWidth={3} className="sel-ring" />}
            <Objects city={city} shops={shops} faded={overlay !== 'none'} />
            {DISTRICT_LABELS.map(([a, b, t]) => {
              const [x, y] = P(a, b)
              return (
                <g key={t} pointerEvents="none">
                  <rect x={x - 48} y={y - 10} width={96} height={20} rx={10} fill="#3b2f2a" opacity={0.72} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff" fontFamily="Nunito, system-ui">
                    {t}
                  </text>
                </g>
              )
            })}
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
                  </g>
                </g>
              )
            })}
            {selected && !shops[selected.id] && (
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
