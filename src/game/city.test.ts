import { describe, expect, it } from 'vitest'
import { CITY_HEIGHT, CITY_WIDTH, LANDMARKS, districtRank, districtUnlocked, getParcel, isFree, isRoad, locationFit, locationPerks } from './city'
import { SAVE_VERSION, migrate, newGame, openBusiness, tick } from './engine'
import type { GameState } from './types'

const RANK3 = ['open_first', 'hire_first', 'first_sales', 'rep_60', 'two_shops', 'month_5k']
const RANK4 = [...RANK3, 'staff_8', 'three_shops', 'networth_200k']

describe('ville agrandie', () => {
  it('la grille couvre six quartiers, chacun avec son lieu remarquable', () => {
    const s = newGame(2)
    expect(s.city.width).toBe(CITY_WIDTH)
    expect(s.city.height).toBe(CITY_HEIGHT)
    const districts = new Set(s.city.parcels.map((p) => p.districtId))
    expect([...districts].sort()).toEqual(['affaires', 'campus', 'centre', 'commercial', 'port', 'residentiel'])
    for (const lm of LANDMARKS) {
      const spot = s.city.parcels.filter((p) => p.landmarkId === lm.id)
      expect(spot).toHaveLength(1)
      expect(spot[0].kind).toBe('landmark')
      expect(spot[0].districtId).toBe(lm.districtId)
    }
    for (const p of s.city.parcels) expect(isRoad(p.i, p.j)).toBe(false)
    // Chaque quartier offre des locaux à louer.
    for (const d of districts) expect(s.city.parcels.filter((p) => p.districtId === d && p.kind === 'lot').length).toBeGreaterThan(1)
  })

  it('le Campus et le Port se débloquent avec les rangs', () => {
    let s = newGame(2)
    expect(districtRank('centre')).toBe(1)
    expect(districtRank('campus')).toBe(3)
    expect(districtRank('port')).toBe(4)
    const campusLot = s.city.parcels.find((p) => p.districtId === 'campus' && p.kind === 'lot')!
    expect(isFree(s, campusLot)).toBe(false)
    expect(openBusiness({ ...s, cash: 500000 }, 'cafe', campusLot.id, 'X').businesses).toHaveLength(0)
    s = { ...s, cash: 500000, objectivesDone: RANK3 }
    expect(districtUnlocked(s, 'campus')).toBe(true)
    expect(districtUnlocked(s, 'port')).toBe(false)
    expect(openBusiness(s, 'cafe', campusLot.id, 'X').businesses).toHaveLength(1)
    expect(districtUnlocked({ ...s, objectivesDone: RANK4 }, 'port')).toBe(true)
  })

  it('un lieu remarquable et la clientèle du quartier changent la fréquentation', () => {
    const s = newGame(2)
    const gare = s.city.parcels.find((p) => p.landmarkId === 'gare')!
    const near = s.city.parcels.filter((p) => p.id !== gare.id).sort((a, b) => Math.abs(a.i - gare.i) + Math.abs(a.j - gare.j) - (Math.abs(b.i - gare.i) + Math.abs(b.j - gare.j)))[0]
    const far = s.city.parcels.find((p) => p.districtId === 'centre' && Math.abs(p.i - gare.i) + Math.abs(p.j - gare.j) > 3)
    expect(locationPerks(s.city, near, 'cafe').some((x) => x.label.startsWith('Gare'))).toBe(true)
    expect(locationFit(s.city, near, 'cafe')).toBeGreaterThan(1.1)
    // La gare n'apporte rien à un magasin d'électronique.
    expect(locationPerks(s.city, near, 'electronique').some((x) => x.label.startsWith('Gare'))).toBe(false)
    if (far) expect(locationFit(s.city, far, 'cafe')).toBeLessThan(locationFit(s.city, near, 'cafe'))
    const port = s.city.parcels.find((p) => p.districtId === 'port' && p.kind === 'lot')!
    expect(locationFit(s.city, port, 'restaurant')).toBeGreaterThan(locationFit(s.city, port, 'electronique'))
  })

  it('les concurrents ne s\'installent ni sur un lieu remarquable ni dans un quartier fermé', () => {
    let s = newGame(5)
    for (let i = 0; i < 150; i++) s = tick(s)
    for (const r of s.rivals) {
      const p = getParcel(s.city, r.parcelId)
      expect(p.kind).toBe('building')
      expect(['campus', 'port']).not.toContain(p.districtId)
    }
  })

  it('une ancienne ville 13×13 est agrandie sans toucher aux commerces existants', () => {
    let s = newGame(7)
    s = { ...s, cash: 500000 }
    const lot = s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === 'residentiel')!
    s = openBusiness(s, 'cafe', lot.id, 'X')
    // Reconstitue la ville d'avant : 13 colonnes, pas de lieux remarquables.
    const old = structuredClone(s) as unknown as GameState & { version: number; city: Record<string, unknown> }
    const before = s.city.parcels.filter((p) => p.i < 13).map((p) => ({ ...p, kind: p.kind === 'landmark' ? 'building' : p.kind, landmarkId: undefined }))
    old.city = { size: 13, roads: [2, 6, 10], parcels: before } as never
    old.rivals = old.rivals.filter((r) => before.some((p) => p.id === r.parcelId))
    old.version = 12
    const m = migrate(old as unknown as GameState)!
    expect(m.version).toBe(SAVE_VERSION)
    expect(m.city.width).toBe(CITY_WIDTH)
    expect(m.city.parcels.filter((p) => p.landmarkId)).toHaveLength(LANDMARKS.length)
    expect(new Set(m.city.parcels.map((p) => p.id)).size).toBe(m.city.parcels.length)
    // Les parcelles occupées ne deviennent pas des lieux remarquables.
    const occupied = [m.businesses[0].parcelId, ...m.rivals.map((r) => r.parcelId)]
    for (const id of occupied) expect(getParcel(m.city, id).landmarkId).toBeUndefined()
    expect(getParcel(m.city, lot.id).kind).toBe('lot')
    expect(() => tick(m)).not.toThrow()
  })
})
