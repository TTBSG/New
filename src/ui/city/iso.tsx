import { memo } from 'react'
import { getSector } from '../../game/sectors'
import type { Parcel } from '../../game/types'

// ---------- Géométrie isométrique ----------

export const TW = 64
export const TH = 32
/** Grille de la ville (voir game/city.ts) et bande de mer à l'est. */
const GRID_W = 20
const GRID_H = 34
export const SEA_WIDTH = 2
export const OX = (GRID_H * TW) / 2
export const OY = 140
export const MAP_W = ((GRID_W + SEA_WIDTH + GRID_H) * TW) / 2
export const MAP_H = ((GRID_W + SEA_WIDTH + GRID_H) * TH) / 2 + OY + 30
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
  campus: '#d8ead0',
  port: '#e6e2cf',
  faubourg: '#d3ebc0',
  vieille: '#e9dcc3',
  plage: '#f3e6bd',
  industrie: '#d9d9d4',
  theatres: '#e6d3de',
  chic: '#e3e8dc',
  aeroport: '#dcdfe3',
  technopole: '#d3e6e6',
  loisirs: '#dcefc9',
}

const FACADES: Record<string, string[]> = {
  residentiel: ['#f7e3c4', '#f3d0c0', '#e9eedb', '#f5dccb'],
  affaires: ['#9fb6e6', '#8eaadf', '#b3c4ea', '#a7bde8'],
  commercial: ['#f2d7a9', '#ecc993', '#f4dfba', '#e9c48f'],
  centre: ['#efc1b5', '#e6aa9b', '#f3d2c6', '#e8b5a5'],
  campus: ['#e7dcc4', '#d9c9a8', '#efe6d2', '#dccfb4'],
  port: ['#f4f1ea', '#cfe3ec', '#f2dfc9', '#dbe9e4'],
  faubourg: ['#f6ead2', '#efe0cf', '#f2ecd9', '#ead9c2'],
  vieille: ['#e8c9a0', '#dfb98a', '#edd5b3', '#d9ac7c'],
  plage: ['#fdf6e3', '#f9d9c4', '#d7ecf3', '#fbe7b5'],
  industrie: ['#b9bcc2', '#a8acb4', '#c7c9cd', '#b0a79d'],
  theatres: ['#d9a7b8', '#c98ea5', '#e4bcc9', '#b98aa8'],
  chic: ['#f3efe4', '#e8e2d2', '#f7f4ec', '#e3dccb'],
  aeroport: ['#cfd6de', '#bcc6d1', '#dbe1e7', '#c5cdd6'],
  technopole: ['#8fd0c8', '#7bc0cf', '#a6dcd3', '#86c9b9'],
  loisirs: ['#f7c8d6', '#c9e3f5', '#fbe3a8', '#cdeccb'],
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

export const ParcelObject = memo(function ParcelObject({
  parcel,
  shopSectorId,
  hqHeight,
  warehouse,
  rivalColor,
  closed,
  locked,
}: {
  parcel: Parcel
  shopSectorId?: string
  hqHeight?: number
  warehouse?: { sectorId: string; height: number }
  /** Couleur de l'enseigne concurrente installée ici. */
  rivalColor?: string
  /** Commerce fermé sur le créneau affiché : rideau baissé. */
  closed?: boolean
  /** Quartier pas encore débloqué : pas de panneau « À louer ». */
  locked?: boolean
}) {
  const { i, j, districtId, kind, height, variant } = parcel

  if (kind === 'landmark' && !shopSectorId) return <Landmark parcel={parcel} locked={locked} />
  if (locked && kind === 'lot' && !shopSectorId) return null

  if (rivalColor && !shopSectorId) {
    // Boutique concurrente : façade sombre, bandeau uni aux couleurs de l'enseigne et fanion sur le toit.
    const inset = 0.14
    const h = SHOP_HEIGHT + 4
    const [x, y] = P(i + 0.5, j + 0.5, h)
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={h} color="#5a5f6e" inset={inset} roof={shade(rivalColor, 0.75)} />
        <polygon points={pts([frontPoint(i, j, inset, 0.1, 3), frontPoint(i, j, inset, 0.55, 3), frontPoint(i, j, inset, 0.55, h * 0.42), frontPoint(i, j, inset, 0.1, h * 0.42)])} fill="#cfe6f2" className="shop-window" />
        <polygon points={pts([frontPoint(i, j, inset, 0.66, 0), frontPoint(i, j, inset, 0.86, 0), frontPoint(i, j, inset, 0.86, h * 0.4), frontPoint(i, j, inset, 0.66, h * 0.4)])} fill="#3a3e4a" />
        <polygon points={pts([frontPoint(i, j, inset, 0, h * 0.7), frontPoint(i, j, inset, 1, h * 0.7), frontPoint(i, j, inset, 1, h * 0.5), frontPoint(i, j, inset, 0, h * 0.5)])} fill={rivalColor} />
        <rect x={x - 0.8} y={y - 16} width={1.6} height={16} fill="#3b2f2a" />
        <path d={`M${x + 0.8},${y - 16} l11,3.5 l-11,3.5z`} fill={rivalColor} />
      </g>
    )
  }

  if (warehouse) {
    // Entrepôt : grand hangar bas, porte de quai et bande aux couleurs du secteur.
    const inset = 0.06
    const h = warehouse.height
    const color = getSector(warehouse.sectorId).color
    return (
      <g data-parcel={parcel.id}>
        <Box i={i} j={j} h={h} color="#c9ccd3" inset={inset} roof="#9aa0ad" />
        <polygon
          points={pts([frontPoint(i, j, inset, 0, h * 0.82), frontPoint(i, j, inset, 1, h * 0.82), frontPoint(i, j, inset, 1, h * 0.68), frontPoint(i, j, inset, 0, h * 0.68)])}
          fill={color}
        />
        <polygon points={pts([frontPoint(i, j, inset, 0.2, 0), frontPoint(i, j, inset, 0.55, 0), frontPoint(i, j, inset, 0.55, h * 0.55), frontPoint(i, j, inset, 0.2, h * 0.55)])} fill="#7d8391" />
        <polygon points={pts([frontPoint(i, j, inset, 0.65, 0), frontPoint(i, j, inset, 0.85, 0), frontPoint(i, j, inset, 0.85, h * 0.55), frontPoint(i, j, inset, 0.65, h * 0.55)])} fill="#7d8391" />
      </g>
    )
  }

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
        <polygon points={pts([frontPoint(i, j, inset, 0.1, 3), frontPoint(i, j, inset, 0.55, 3), frontPoint(i, j, inset, 0.55, h * 0.44), frontPoint(i, j, inset, 0.1, h * 0.44)])} fill={closed ? '#8d8f96' : '#a9dcf5'} className={closed ? undefined : 'shop-window'} />
        {closed &&
          [0.12, 0.22, 0.32].map((t) => (
            <polyline key={t} points={pts([frontPoint(i, j, inset, 0.1, h * t), frontPoint(i, j, inset, 0.55, h * t)])} stroke="#73757c" strokeWidth={0.8} fill="none" />
          ))}
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
  if (districtId === 'residentiel' || districtId === 'faubourg' || districtId === 'vieille' || districtId === 'plage')
    return (
      <g data-parcel={parcel.id} className={locked ? 'locked-parcel' : undefined}>
        <Box i={i} j={j} h={height} color={facade} inset={0.2} roof={ROOFS[variant % 4]} floors={2} />
        <Lights i={i} j={j} inset={0.2} h={height} rows={2} seed={i * 13 + j * 7 + variant} />
      </g>
    )
  if (districtId === 'affaires' || districtId === 'technopole')
    return (
      <g data-parcel={parcel.id} className={locked ? 'locked-parcel' : undefined}>
        <Box i={i} j={j} h={height} color={facade} inset={0.16} floors={Math.round(height / 11)} />
        <Lights i={i} j={j} inset={0.16} h={height} rows={Math.round(height / 11)} seed={i * 13 + j * 7 + variant} />
      </g>
    )
  if (districtId === 'commercial' || districtId === 'industrie' || districtId === 'aeroport' || districtId === 'loisirs')
    return (
      <g data-parcel={parcel.id} className={locked ? 'locked-parcel' : undefined}>
        <Box i={i} j={j} h={height} color={facade} inset={0.1} roof="#d7c3a3" floors={2} />
        <Lights i={i} j={j} inset={0.1} h={height} rows={2} seed={i * 13 + j * 7 + variant} />
      </g>
    )
  return (
    <g data-parcel={parcel.id} className={locked ? 'locked-parcel' : undefined}>
      <Box i={i} j={j} h={height} color={facade} inset={0.14} floors={Math.round(height / 11)} />
      <Lights i={i} j={j} inset={0.14} h={height} rows={Math.round(height / 11)} seed={i * 13 + j * 7 + variant} />
    </g>
  )
})

/** Lieux remarquables : un bâtiment reconnaissable par quartier. */
function Landmark({ parcel, locked }: { parcel: Parcel; locked?: boolean }) {
  const { i, j } = parcel
  const [cx, cy] = P(i + 0.5, j + 0.5)
  let body = null
  switch (parcel.landmarkId) {
    case 'gare': {
      const [tx, ty] = P(i + 0.5, j + 0.5, 58)
      body = (
        <>
          <Box i={i} j={j} h={26} color="#d9b38c" inset={0.05} roof="#7a4f3a" />
          <polygon points={pts([frontPoint(i, j, 0.05, 0.12, 0), frontPoint(i, j, 0.05, 0.36, 0), frontPoint(i, j, 0.05, 0.36, 15), frontPoint(i, j, 0.05, 0.12, 15)])} fill="#5c3d2e" />
          <polygon points={pts([frontPoint(i, j, 0.05, 0.5, 6), frontPoint(i, j, 0.05, 0.88, 6), frontPoint(i, j, 0.05, 0.88, 17), frontPoint(i, j, 0.05, 0.5, 17)])} fill="#a9dcf5" className="shop-window" />
          <Box i={i} j={j} h={52} color="#c79a72" inset={0.36} roof="#7a4f3a" />
          <circle cx={tx} cy={ty + 14} r={5.5} fill="#fff" stroke="#3b2f2a" strokeWidth={1.2} />
          <path d={`M${tx},${ty + 14} v-3.5 M${tx},${ty + 14} h2.6`} stroke="#3b2f2a" strokeWidth={1.1} fill="none" />
        </>
      )
      break
    }
    case 'lycee': {
      const [x, y] = P(i + 0.5, j + 0.5, 26)
      body = (
        <>
          <Box i={i} j={j} h={26} color="#f6d98b" inset={0.08} roof="#b5523c" floors={2} />
          <polygon points={pts([frontPoint(i, j, 0.08, 0.4, 0), frontPoint(i, j, 0.08, 0.6, 0), frontPoint(i, j, 0.08, 0.6, 11), frontPoint(i, j, 0.08, 0.4, 11)])} fill="#8a6142" />
          <rect x={x - 0.8} y={y - 20} width={1.6} height={20} fill="#3b2f2a" />
          <path d={`M${x + 0.8},${y - 20} l12,4 l-12,4z`} fill="#3987e5" />
        </>
      )
      break
    }
    case 'stade':
      body = (
        <>
          <ellipse cx={cx} cy={cy} rx={29} ry={14.5} fill="#9aa0ad" />
          <ellipse cx={cx} cy={cy - 9} rx={29} ry={14.5} fill="#d5d8de" stroke="#9aa0ad" strokeWidth={1} />
          <ellipse cx={cx} cy={cy - 7} rx={20} ry={10} fill="#5fb85a" stroke="#fff" strokeWidth={1} />
          <path d={`M${cx},${cy - 17} v20`} stroke="#fff" strokeWidth={0.9} />
          <ellipse cx={cx} cy={cy - 7} rx={5} ry={2.5} fill="none" stroke="#fff" strokeWidth={0.9} />
        </>
      )
      break
    case 'bourse': {
      const [x, y] = P(i + 0.5, j + 0.5, 128)
      body = (
        <>
          <Box i={i} j={j} h={128} color="#6f8fd0" inset={0.2} roof="#3d4f7c" floors={12} />
          <Lights i={i} j={j} inset={0.2} h={128} rows={12} seed={7} />
          <rect x={x - 0.8} y={y - 22} width={1.6} height={22} fill="#3b2f2a" />
          <circle cx={x} cy={y - 23} r={2.2} fill="#e8472b" />
        </>
      )
      break
    }
    case 'universite': {
      const [x, y] = P(i + 0.5, j + 0.5, 30)
      body = (
        <>
          <Box i={i} j={j} h={30} color="#efe7d3" inset={0.07} roof="#b9a98a" />
          {[0.14, 0.3, 0.46, 0.62, 0.78].map((t) => (
            <polygon key={t} points={pts([frontPoint(i, j, 0.07, t, 0), frontPoint(i, j, 0.07, t + 0.07, 0), frontPoint(i, j, 0.07, t + 0.07, 22), frontPoint(i, j, 0.07, t, 22)])} fill="#fff" stroke="#cfc4a8" strokeWidth={0.5} />
          ))}
          <path d={`M${x - 12},${y} a12,11 0 0 1 24,0z`} fill="#6fae9c" stroke="#4d8a7a" strokeWidth={1} />
        </>
      )
      break
    }
    case 'piscine':
      body = (
        <>
          <polygon points={diamond(i, j, 0.06)} fill="#e9e4d6" stroke="#cfc8b5" strokeWidth={1} />
          <polygon points={diamond(i, j, 0.2)} fill="#5cc3e8" stroke="#fff" strokeWidth={1.5} />
          <path d={`M${cx - 12},${cy} h24 M${cx - 9},${cy - 4} h18 M${cx - 9},${cy + 4} h18`} stroke="#fff" strokeOpacity={0.7} strokeWidth={0.8} />
          <Box i={i} j={j} h={12} color="#f4f1ea" inset={0.4} roof="#3987e5" />
        </>
      )
      break
    case 'cathedrale': {
      const spire = (a: number, b: number) => {
        const [x, y] = P(i + a, j + b, 62)
        return <path d={`M${x - 6},${y} L${x},${y - 26} L${x + 6},${y}Z`} fill="#6f7f94" stroke="#55627a" strokeWidth={0.8} />
      }
      const [rx, ry] = P(i + 0.5, j + 0.82, 22)
      body = (
        <>
          <Box i={i} j={j} h={34} color="#d8cdb8" inset={0.1} roof="#8f9bb0" />
          <Box i={i + 0.08} j={j + 0.42} h={62} color="#cfc3ab" inset={0.3} roof="#6f7f94" />
          <Box i={i + 0.42} j={j + 0.08} h={62} color="#cfc3ab" inset={0.3} roof="#6f7f94" />
          {spire(0.58, 0.92)}
          {spire(0.92, 0.58)}
          <circle cx={rx} cy={ry} r={5} fill="#7fb7d9" stroke="#fff" strokeWidth={1.2} className="shop-window" />
        </>
      )
      break
    }
    case 'granderoue': {
      const wy = cy - 44
      body = (
        <>
          <path d={`M${cx - 16},${cy + 2} L${cx},${wy} L${cx + 16},${cy + 2}`} stroke="#5a5f6e" strokeWidth={2.4} fill="none" />
          <g className="wheel" style={{ transformOrigin: `${cx}px ${wy}px` }}>
            <circle cx={cx} cy={wy} r={30} fill="none" stroke="#e85d8a" strokeWidth={2.4} />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
              const a = (k * Math.PI) / 4
              const x = cx + Math.cos(a) * 30
              const y = wy + Math.sin(a) * 30
              return (
                <g key={k}>
                  <line x1={cx} y1={wy} x2={x} y2={y} stroke="#b9bcc6" strokeWidth={0.9} />
                  <rect x={x - 3.5} y={y - 2.5} width={7} height={6} rx={1.5} fill={['#f2b134', '#5c8de8', '#4cb86b', '#e8743b'][k % 4]} />
                </g>
              )
            })}
          </g>
          <circle cx={cx} cy={wy} r={3} fill="#3b2f2a" />
        </>
      )
      break
    }
    case 'usine': {
      const stack = (a: number, b: number, h: number) => {
        const [x, y] = P(i + a, j + b)
        return (
          <g>
            <rect x={x - 3.5} y={y - h} width={7} height={h} fill="#b5523c" stroke="#8f3d2c" strokeWidth={0.6} />
            <rect x={x - 3.5} y={y - h} width={7} height={4} fill="#f4f4f4" />
            <circle cx={x + 3} cy={y - h - 6} r={5} fill="#e3e3e3" opacity={0.85} />
            <circle cx={x + 9} cy={y - h - 13} r={7} fill="#ececec" opacity={0.7} />
          </g>
        )
      }
      body = (
        <>
          <Box i={i} j={j} h={24} color="#a8acb4" inset={0.06} roof="#7d8391" />
          <polygon points={pts([frontPoint(i, j, 0.06, 0.1, 0), frontPoint(i, j, 0.06, 0.4, 0), frontPoint(i, j, 0.06, 0.4, 14), frontPoint(i, j, 0.06, 0.1, 14)])} fill="#5a5f6e" />
          <polygon points={pts([frontPoint(i, j, 0.06, 0.52, 9), frontPoint(i, j, 0.06, 0.9, 9), frontPoint(i, j, 0.06, 0.9, 17), frontPoint(i, j, 0.06, 0.52, 17)])} fill="#cfe6f2" className="shop-window" />
          {stack(0.3, 0.3, 58)}
          {stack(0.55, 0.25, 46)}
        </>
      )
      break
    }
    case 'opera': {
      const [x, y] = P(i + 0.5, j + 0.5, 34)
      body = (
        <>
          <Box i={i} j={j} h={34} color="#f1e3d6" inset={0.06} roof="#a0405c" />
          {[0.1, 0.26, 0.42, 0.58, 0.74].map((t) => (
            <polygon key={t} points={pts([frontPoint(i, j, 0.06, t, 0), frontPoint(i, j, 0.06, t + 0.08, 0), frontPoint(i, j, 0.06, t + 0.08, 24), frontPoint(i, j, 0.06, t, 24)])} fill="#fff" stroke="#d9c7b5" strokeWidth={0.5} />
          ))}
          <path d={`M${x - 15},${y} a15,13 0 0 1 30,0z`} fill="#c9a23a" stroke="#a07f25" strokeWidth={1} />
          <circle cx={x} cy={y - 15} r={2.2} fill="#c9a23a" />
        </>
      )
      break
    }
    case 'casino': {
      const [x, y] = P(i + 0.5, j + 0.5, 44)
      body = (
        <>
          <Box i={i} j={j} h={44} color="#f6efdc" inset={0.08} roof="#c9a23a" floors={3} />
          <polygon points={pts([frontPoint(i, j, 0.08, 0.36, 0), frontPoint(i, j, 0.08, 0.64, 0), frontPoint(i, j, 0.08, 0.64, 16), frontPoint(i, j, 0.08, 0.36, 16)])} fill="#a0405c" />
          <polygon points={pts([frontPoint(i, j, 0.08, 0.1, 22), frontPoint(i, j, 0.08, 0.9, 22), frontPoint(i, j, 0.08, 0.9, 30), frontPoint(i, j, 0.08, 0.1, 30)])} fill="#c9a23a" className="shop-window" />
          <path d={`M${x},${y - 16} l3.5,7 7.5,1 -5.5,5.5 1.5,7.5 -7,-3.7 -7,3.7 1.5,-7.5 -5.5,-5.5 7.5,-1z`} fill="#f2b134" stroke="#a07f25" strokeWidth={0.8} />
        </>
      )
      break
    }
    case 'terminal': {
      const [tx, ty] = P(i + 0.25, j + 0.25, 60)
      const [px, py] = P(i + 0.62, j + 0.62, 16)
      body = (
        <>
          <Box i={i} j={j} h={14} color="#e3e8ee" inset={0.04} roof="#aeb8c4" />
          <polygon points={pts([frontPoint(i, j, 0.04, 0.06, 3), frontPoint(i, j, 0.04, 0.94, 3), frontPoint(i, j, 0.04, 0.94, 11), frontPoint(i, j, 0.04, 0.06, 11)])} fill="#a9dcf5" className="shop-window" />
          <Box i={i - 0.25} j={j - 0.25} h={56} color="#cfd6de" inset={0.42} roof="#8794a3" />
          <ellipse cx={tx} cy={ty + 2} rx={9} ry={4.5} fill="#5c8de8" stroke="#fff" strokeWidth={1} className="shop-window" />
          <path d={`M${px - 15},${py + 2} L${px + 13},${py - 5} l4,-1 -1,3 -9,5 -5,9 -3,0 2,-8 -8,2 -3,4 -2,0 1,-6 -3,-3z`} fill="#fff" stroke="#8794a3" strokeWidth={0.9} />
        </>
      )
      break
    }
    case 'incubateur': {
      const [x, y] = P(i + 0.5, j + 0.5, 70)
      body = (
        <>
          <Box i={i} j={j} h={70} color="#7fd0c0" inset={0.14} roof="#2fa58f" floors={7} />
          <Lights i={i} j={j} inset={0.14} h={70} rows={7} seed={11} />
          <path d={`M${x},${y - 3} l10,-6 0,-9 -10,6z M${x},${y - 3} l-10,-6 0,-9 10,6z`} fill="#b7f0e2" stroke="#2fa58f" strokeWidth={0.8} />
        </>
      )
      break
    }
    case 'grandhuit':
      body = (
        <>
          <polygon points={diamond(i, j, 0.05)} fill="#cdeccb" stroke="#a9d3a6" strokeWidth={1} />
          <path d={`M${cx - 28},${cy + 2} C${cx - 22},${cy - 60} ${cx - 6},${cy - 60} ${cx - 2},${cy - 14} S${cx + 16},${cy - 46} ${cx + 28},${cy + 2}`} stroke="#e8472b" strokeWidth={3} fill="none" strokeLinecap="round" />
          {[-24, -15, -6, 6, 16, 24].map((dx) => (
            <line key={dx} x1={cx + dx} y1={cy + 4} x2={cx + dx} y2={cy - (dx < 0 ? 34 - Math.abs(dx + 14) * 2.2 : 24 - Math.abs(dx - 16) * 1.6)} stroke="#8a6142" strokeWidth={1.1} />
          ))}
          <path d={`M${cx + 6},${cy + 4} L${cx + 14},${cy - 20} L${cx + 22},${cy + 4}Z`} fill="#f2b134" stroke="#fff" strokeWidth={1} />
          <rect x={cx - 14} y={cy - 46} width={8} height={5} rx={1.5} fill="#3987e5" />
        </>
      )
      break
    default: {
      // Phare : tour blanche à bandes rouges, lanterne allumée le soir.
      const top = cy - 74
      body = (
        <>
          <Box i={i} j={j} h={10} color="#d9d2c0" inset={0.2} roof="#b9b29f" />
          <path d={`M${cx - 9},${cy - 10} L${cx - 5.5},${top} h11 L${cx + 9},${cy - 10}Z`} fill="#fbfaf6" stroke="#b9b29f" strokeWidth={1} />
          <path d={`M${cx - 8.2},${cy - 28} L${cx - 7.2},${cy - 40} h14.4 L${cx + 8.2},${cy - 28}Z`} fill="#d9433b" />
          <path d={`M${cx - 6.6},${cy - 52} L${cx - 6},${cy - 62} h12 L${cx + 6.6},${cy - 52}Z`} fill="#d9433b" />
          <rect x={cx - 7} y={top - 9} width={14} height={9} rx={2} fill="#fff3b0" stroke="#3b2f2a" strokeWidth={1} className="shop-window" />
          <path d={`M${cx - 8},${top - 9} L${cx},${top - 17} L${cx + 8},${top - 9}Z`} fill="#3b2f2a" />
        </>
      )
    }
  }
  return (
    <g data-parcel={parcel.id} className={locked ? 'locked-parcel' : undefined}>
      {body}
    </g>
  )
}

/** Fenêtres allumées le soir : quelques-unes par étage, toujours les mêmes pour un immeuble donné. */
function Lights({ i, j, inset, h, rows, seed }: { i: number; j: number; inset: number; h: number; rows: number; seed: number }) {
  const out = []
  const floor = h / Math.max(1, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      // Petit tirage déterministe : environ une fenêtre sur deux est éclairée.
      if ((seed * 31 + r * 17 + c * 7) % 5 < 2) continue
      const t0 = 0.14 + c * 0.27
      const y0 = r * floor + floor * 0.3
      out.push(
        <polygon
          key={`${r}-${c}`}
          points={pts([frontPoint(i, j, inset, t0, y0), frontPoint(i, j, inset, t0 + 0.16, y0), frontPoint(i, j, inset, t0 + 0.16, y0 + floor * 0.42), frontPoint(i, j, inset, t0, y0 + floor * 0.42)])}
          fill="#fff3b0"
        />,
      )
    }
  }
  return <g className="night-light">{out}</g>
}
