import { describe, expect, it } from 'vitest'
import { CITY_HEIGHT, LANDMARKS, districtRank, districtUnlocked, getParcel } from './city'
import { LEADER_BONUS, districtStats } from './districts'
import { SAVE_VERSION, dateOf, migrate, newGame, openBusiness, tick, trafficFactors } from './engine'
import { OBJECTIVES, RANKS, currentRank } from './objectives'
import { dayProfile } from './schedule'
import { DISTRICTS, districtOfParcel } from './sectors'
import { hireStaff } from './testUtils'
import type { GameState } from './types'
import { canOpenWarehouseHere } from './warehouse'

const ALL = OBJECTIVES.map((o) => o.id)
const doneUpTo = (rank: number) => OBJECTIVES.filter((o) => o.rank < rank).map((o) => o.id)
const lot = (s: GameState, d: string, n = 0) => s.city.parcels.filter((p) => p.kind === 'lot' && p.districtId === d)[n].id

function shopIn(d: string, sectorId = 'restaurant', seed = 3): GameState {
  let s = newGame(seed)
  s = { ...s, cash: 2_000_000, objectivesDone: ALL, unlockedSectors: ['cafe', 'boulangerie', 'superette', 'restaurant', 'vetements', 'electronique'], rivals: [] }
  return openBusiness(s, sectorId, lot(s, d), 'X')
}

describe('quinze quartiers', () => {
  it('chaque quartier a sa place sur la grille et se débloque à un rang atteignable', () => {
    const cells = new Set(DISTRICTS.map((d) => d.cell.join(',')))
    expect(cells.size).toBe(15)
    for (const d of DISTRICTS) {
      expect(districtRank(d.id)).toBeLessThanOrEqual(RANKS.length)
      expect(LANDMARKS.filter((l) => l.districtId === d.id)).toHaveLength(1)
    }
    const s = newGame(1)
    expect(DISTRICTS.filter((d) => districtUnlocked(s, d.id)).map((d) => d.id).sort()).toEqual(['affaires', 'centre', 'commercial', 'residentiel'])
    expect(districtUnlocked({ ...s, objectivesDone: doneUpTo(2) }, 'faubourg')).toBe(true)
    expect(districtUnlocked({ ...s, objectivesDone: doneUpTo(6) }, 'aeroport')).toBe(false)
    expect(districtUnlocked({ ...s, objectivesDone: doneUpTo(7) }, 'aeroport')).toBe(true)
    expect(currentRank({ ...s, objectivesDone: doneUpTo(6) })).toBe(6)
  })

  it('le quartier des théâtres vit le soir, la zone industrielle le matin', () => {
    const night = dayProfile(shopIn('theatres').businesses[0])
    const centre = dayProfile(shopIn('centre').businesses[0])
    const factory = dayProfile(shopIn('industrie').businesses[0])
    expect(night.reduce((a, x) => a + x, 0)).toBeCloseTo(1)
    expect(night[2]).toBeGreaterThan(centre[2] + 0.1)
    expect(night[0]).toBeLessThan(centre[0])
    expect(factory[2]).toBeLessThan(centre[2])
  })

  it('la plage est bondée en été et déserte en hiver', () => {
    let s = shopIn('plage', 'cafe')
    const b = () => s.businesses[0]
    const season = () => trafficFactors(s, b()).find((f) => f.label.startsWith('Saison'))?.effect ?? 0
    expect(dateOf(s.day).getUTCMonth()).toBe(0)
    expect(season()).toBeLessThan(-0.4)
    s = { ...s, day: 200 }
    expect(dateOf(s.day).getUTCMonth()).toBe(6)
    expect(season()).toBeGreaterThan(0.5)
  })

  it('le week-end remplit le parc de loisirs et vide la technopole', () => {
    const weekend = (d: string) => {
      const s = { ...shopIn(d, 'cafe'), day: 6 }
      return trafficFactors(s, s.businesses[0]).find((f) => f.label.startsWith('Week-end'))?.effect ?? 0
    }
    expect(weekend('loisirs')).toBeGreaterThan(0.4)
    expect(weekend('technopole')).toBeLessThan(-0.4)
    const monday = { ...shopIn('loisirs', 'cafe'), day: 8 }
    expect(trafficFactors(monday, monday.businesses[0]).some((f) => f.label.startsWith('Week-end'))).toBe(false)
  })

  it('deux commerces et la majorité des clients font un leader de quartier', () => {
    let s = shopIn('faubourg', 'boulangerie')
    s = openBusiness(s, 'superette', lot(s, 'faubourg', 1), 'Y')
    for (const b of s.businesses) s = hireStaff(s, b.id, 2)
    expect(s.leaders).toEqual([])
    for (let i = 0; i < 3; i++) s = tick({ ...s, rivals: [] })
    expect(s.leaders).toContain('faubourg')
    expect(districtStats(s).find((d) => d.id === 'faubourg')).toMatchObject({ shops: 2, leader: true, share: 1 })
    expect(trafficFactors(s, s.businesses[0]).find((f) => f.label === 'Leader du quartier')?.effect).toBe(LEADER_BONUS)
    expect(s.log.some((l) => l.text.includes('leader du quartier Faubourg'))).toBe(true)
    // Un seul commerce ne suffit pas.
    const solo = shopIn('faubourg', 'boulangerie')
    expect(districtStats(solo).find((d) => d.id === 'faubourg')!.leader).toBe(false)
  })

  it('les entrepôts s\'installent aussi en zone industrielle', () => {
    const s = shopIn('centre')
    const withHq = { ...s, hq: { parcelId: lot(s, 'affaires'), level: 1, staff: [{ id: 'o', name: 'L', role: 'logisticien' as const, skill: 60, salary: 3000, hiredDay: 1 }], policies: { autoReplace: false, raiseLimit: 0, autoNegotiate: false, autoStock: false, mutuelle: false, tickets: false, prime: false }, openedDay: 1 } } as GameState
    expect(canOpenWarehouseHere(withHq, lot(withHq, 'industrie'))).toBe(true)
    expect(canOpenWarehouseHere(withHq, lot(withHq, 'centre', 1))).toBe(false)
  })

  it('une ville 20×13 est prolongée vers le sud sans toucher à l\'existant', () => {
    let s = newGame(7)
    s = openBusiness({ ...s, cash: 500000 }, 'cafe', lot(s, 'residentiel'), 'X')
    const old = structuredClone(s) as unknown as GameState & { version: number; leaders?: string[] }
    const before = s.city.parcels.filter((p) => p.j < 13).map((p) => (LANDMARKS.some((l) => l.id === p.landmarkId && districtOfParcel(p.id).cell[1] > 1) ? { ...p, kind: 'building' as const, landmarkId: undefined } : p))
    old.city = { ...s.city, height: 13, roadsJ: [2, 6, 10], parcels: before }
    old.rivals = old.rivals.filter((r) => before.some((p) => p.id === r.parcelId))
    delete (old as { leaders?: string[] }).leaders
    old.version = 13
    const m = migrate(old as unknown as GameState)!
    expect(m.version).toBe(SAVE_VERSION)
    expect(m.city.height).toBe(CITY_HEIGHT)
    expect(m.leaders).toEqual([])
    expect(m.city.parcels.filter((p) => p.landmarkId)).toHaveLength(15)
    expect(new Set(m.city.parcels.map((p) => p.id)).size).toBe(m.city.parcels.length)
    for (const p of before) expect(getParcel(m.city, p.id)).toMatchObject({ kind: p.kind, address: p.address })
    expect(() => tick(m)).not.toThrow()
  })
})
