import { memo } from 'react'
import { getSector } from '../../game/sectors'
import type { Parcel } from '../../game/types'

// ---------- Géométrie isométrique ----------

export const TW = 64
export const TH = 32
const N = 13
export const OX = (N * TW) / 2
export const OY = 140
export const MAP_W = N * TW
export const MAP_H = N * TH + OY + 30
export const SHOP_HEIGHT = 30

type Pt = [number, number]

/** Coordonnées écran d'un point de la grille (a, b) à la hauteur h. */
export function P(a: number, b: number, h = 0): Pt {
  return [OX + ((a - b) * TW) / 2, OY + ((a + b) * TH) / 2 - h]
}

const pts = (list: Pt[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

export function shade(hex: string, f: number): string {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join('')
}

export function diamond(i: number, j: number, inset = 0): string {
  return pts([P(i + inset, j + inset), P(i + 1 - inset, j + inset), P(i + 1 - inset, j + 1 - inset), P(i + inset, j + 1 - inset)])
}

// ---------- Palette de la ville ----------

export const GROUND: Record<string, string> = {
  residentiel: '#cde8b8',
  affaires: '#d5dcec',
  commercial: '#f0e0c2',
  centre: '#eed3cc',
}

const FACADES: Record<string, string[]> = {
  residentiel: ['#f7e3c4', '#f3d0c0', '#e9eedb', '#f5dccb'],
  affaires: ['#9fb6e6', '#8eaadf', '#b3c4ea', '#a7bde8'],
  commercial: ['#f2d7a9', '#ecc993', '#f4dfba', '#e9c48f'],
  centre: ['#efc1b5', '#e6aa9b', '#f3d2c6', '#e8b5a5'],
}
const ROOFS = ['#c8664a', '#b5523c', '#d9814f', '#c25b45']

// ---------- Primitives ----------

function Box({
  i,
  j,
  h,
  color,
  inset = 0.14,
  roof,
  floors = 0,
}: {
  i: number
  j: number
  h: number
  color: string
  inset?: number
  roof?: string
  floors?: number
}) {
  const a0 = i + inset
  const a1 = i + 1 - inset
  const b0 = j + inset
  const b1 = j + 1 - inset
  const T: Pt = P(a0, b0)
  const R: Pt = P(a1, b0)
  const B: Pt = P(a1, b1)
  const L: Pt = P(a0, b1)
  const up = (p: Pt, y: number): Pt => [p[0], p[1] - y]
  const lines = []
  for (let k = 1; k < floors; k++) {
    const y = (h * k) / floors
    lines.push(<polyline key={k} points={pts([up(L, y), up(B, y), up(R, y)])} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1} />)
  }
  return (
    <>
      <polygon points={pts([L, B, up(B, h), up(L, h)])} fill={shade(color, 0.86)} />
      <polygon points={pts([B, R, up(R, h), up(B, h)])} fill={shade(color, 0.7)} />
      <polygon points={pts([up(T, h), up(R, h), up(B, h), up(L, h)])} fill={roof ?? shade(color, 1.08)} />
      {lines}
    </>
  )
}

/** Point situé à la fraction t de la façade gauche (de L à B), à la hauteur y. */
function frontPoint(i: number, j: number, inset: number, t: number, y: number): Pt {
  const L = P(i + inset, j + 1 - inset)
  const B = P(i + 1 - inset, j + 1 - inset)
  return [L[0] + (B[0] - L[0]) * t, L[1] + (B[1] - L[1]) * t - y]
}

function Tree({ a, b }: { a: number; b: number }) {
  const [x, y] = P(a, b)
  return (
    <g>
      <rect x={x - 1.5} y={y - 10} width={3} height={10} fill="#8a6142" />
      <circle cx={x} cy={y - 15} r={8} fill="#6dbb5a" />
      <circle cx={x - 3} cy={y - 18} r={3.5} fill="#8fd17a" />
    </g>
  )
}

// ---------- Contenu d'une parcelle ----------

export const ParcelObject = memo(function ParcelObject({ parcel, shopSectorId, hqHeight }: { parcel: Parcel; shopSectorId?: string; hqHeight?: number }) {
  const { i, j, districtId, kind, height, variant } = parcel

  if (hqHeight) {
    // Siège social : tour vitrée surmontée d'un drapeau aux couleurs du groupe.
    const [x, y] = P(i + 0.5, j + 0.5, hqHeight)
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={hqHeight} color="#5f79b8" inset={0.16} roof="#3d4f7c" floors={Math.round(hqHeight / 10)} />
        <rect x={x - 1} y={y - 30} width={2} height={30} fill="#3b2f2a" />
        <path d={`M${x + 1},${y - 30} l16,5 l-16,5z`} fill="#e8743b" />
      </g>
    )
  }

  if (shopSectorId) {
    const sector = getSector(shopSectorId)
    const inset = 0.14
    const h = SHOP_HEIGHT
    const facade = FACADES[districtId][variant % 4]
    const stripes = []
    for (let k = 0; k < 6; k++) {
      stripes.push(
        <polygon
          key={k}
          points={pts([frontPoint(i, j, inset, k / 6, h * 0.66), frontPoint(i, j, inset, (k + 1) / 6, h * 0.66), frontPoint(i, j, inset, (k + 1) / 6, h * 0.5), frontPoint(i, j, inset, k / 6, h * 0.5)])}
          fill={k % 2 === 0 ? sector.color : '#ffffff'}
        />,
      )
    }
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={h} color={facade} inset={inset} roof={shade(sector.color, 0.85)} />
        <polygon points={pts([frontPoint(i, j, inset, 0.1, 3), frontPoint(i, j, inset, 0.55, 3), frontPoint(i, j, inset, 0.55, h * 0.44), frontPoint(i, j, inset, 0.1, h * 0.44)])} fill="#a9dcf5" />
        <polygon points={pts([frontPoint(i, j, inset, 0.66, 0), frontPoint(i, j, inset, 0.86, 0), frontPoint(i, j, inset, 0.86, h * 0.42), frontPoint(i, j, inset, 0.66, h * 0.42)])} fill={shade(sector.color, 0.7)} />
        {stripes}
      </g>
    )
  }

  if (kind === 'park') {
    return (
      <g data-parcel={parcel.id}>
        <Tree a={i + 0.3} b={j + 0.35} />
        <Tree a={i + 0.7} b={j + 0.4} />
        <Tree a={i + 0.5} b={j + 0.75} />
      </g>
    )
  }

  if (kind === 'lot') {
    // Local commercial libre : terrain délimité + panneau « À louer ».
    const [x, y] = P(i + 0.5, j + 0.5)
    return (
      <g data-parcel={parcel.id}>
        <polygon points={diamond(i, j, 0.12)} fill="none" stroke="#b8a48c" strokeWidth={1.4} strokeDasharray="4 3" />
        <rect x={x - 1.2} y={y - 22} width={2.4} height={22} fill="#8a6142" />
        <rect x={x - 17} y={y - 33} width={34} height={14} rx={3} fill="#fff" stroke="#e8743b" strokeWidth={1.5} />
        <text x={x} y={y - 23} textAnchor="middle" fontSize={7.5} fontWeight={900} fill="#e8743b" fontFamily="Nunito, system-ui">
          À LOUER
        </text>
      </g>
    )
  }

  const facade = FACADES[districtId][variant % 4]
  if (districtId === 'residentiel')
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={height} color={facade} inset={0.2} roof={ROOFS[variant % 4]} floors={2} />
      </g>
    )
  if (districtId === 'affaires')
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={height} color={facade} inset={0.16} floors={Math.round(height / 11)} />
      </g>
    )
  if (districtId === 'commercial')
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={height} color={facade} inset={0.1} roof="#d7c3a3" floors={2} />
      </g>
    )
  return (
    <g data-parcel={parcel.id}>
      <Box i={i} j={j} h={height} color={facade} inset={0.14} floors={Math.round(height / 11)} />
    </g>
  )
})
