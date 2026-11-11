import { describe, expect, it } from 'vitest'
import { getParcel, isFree } from './city'
import { businessAttraction, buyRival, buyRivalBlock, newGame, openBusiness, tick } from './engine'
import { answer } from './messages'
import { RIVAL_BRANDS, RIVAL_RADIUS, competitionFactor, distance, getBrand, rivalCap, rivalPrice, threatsFor } from './rivals'
import { hireStaff } from './testUtils'
import type { GameState, RivalShop } from './types'

function cafe(seed = 9): GameState {
  let s = newGame(seed)
  const lot = s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === 'residentiel' && isFree(s, p))!.id
  s = openBusiness(s, 'cafe', lot, 'X')
  s = { ...s, cash: 300000, rivals: [] }
  return hireStaff(s, s.businesses[0].id, 2)
}

/** Installe un concurrent sur l'immeuble le plus proche du commerce du joueur. */
function neighbour(s: GameState, over: Partial<RivalShop> = {}): GameState {
  const here = getParcel(s.city, s.businesses[0].parcelId)
  const spot = s.city.parcels.filter((p) => p.kind === 'building').sort((a, b) => distance(a, here) - distance(b, here))[0]
  const r: RivalShop = { id: 'r1', brandId: 'kawa', sectorId: 'cafe', parcelId: spot.id, openedDay: s.day, priceLevel: 0.96, quality: 58, reputation: 55, health: 60, customers: 0, share: 1, ...over }
  return { ...s, rivals: [...s.rivals, r] }
}

const visitors = (s: GameState, days = 14) => {
  for (let i = 0; i < days; i++) s = tick({ ...s, rivals: s.rivals.slice(0, 1) })
  return s.businesses[0].history.slice(-days).reduce((a, r) => a + r.visitors, 0) / days
}

describe('concurrents', () => {
  it('une nouvelle partie démarre avec des enseignes hors du quartier résidentiel', () => {
    const s = newGame(4)
    expect(s.rivals.length).toBeGreaterThanOrEqual(3)
    for (const r of s.rivals) {
      const p = getParcel(s.city, r.parcelId)
      expect(p.kind).toBe('building')
      expect(p.districtId).not.toBe('residentiel')
      expect(getBrand(r.brandId).sectors).toContain(r.sectorId)
    }
    expect(RIVAL_BRANDS.length).toBeGreaterThan(3)
  })

  it('un concurrent voisin détourne une partie des passants', () => {
    const alone = cafe()
    const contested = neighbour(alone)
    const b = contested.businesses[0]
    expect(competitionFactor(alone, b, businessAttraction(alone, b))).toBe(1)
    const factor = competitionFactor(contested, b, businessAttraction(contested, b))
    expect(factor).toBeGreaterThan(0.6)
    expect(factor).toBeLessThan(0.9)
    expect(threatsFor(contested, b, businessAttraction(contested, b))[0].distance).toBeLessThanOrEqual(RIVAL_RADIUS)
    expect(visitors(contested)).toBeLessThan(visitors(alone) * 0.95)
  })

  it('un concurrent d\'un autre secteur ou trop loin ne gêne pas', () => {
    const s = cafe()
    const b = s.businesses[0]
    const other = neighbour(s, { sectorId: 'superette', brandId: 'proxi' })
    expect(competitionFactor(other, b, 1)).toBe(1)
    const here = getParcel(s.city, b.parcelId)
    const far = s.city.parcels.filter((p) => p.kind === 'building').sort((x, y) => distance(y, here) - distance(x, here))[0]
    expect(competitionFactor(neighbour(s, { parcelId: far.id }), b, 1)).toBe(1)
  })

  it('baisser ses prix ou soigner sa réputation reprend des clients', () => {
    const s = neighbour(cafe())
    const b = s.businesses[0]
    const base = competitionFactor(s, b, businessAttraction(s, b))
    const cheap = structuredClone(s)
    for (const p of cheap.businesses[0].products) p.price *= 0.8
    expect(competitionFactor(cheap, cheap.businesses[0], businessAttraction(cheap, cheap.businesses[0]))).toBeGreaterThan(base)
    const loved = structuredClone(s)
    loved.businesses[0].reputation = 90
    expect(competitionFactor(loved, loved.businesses[0], businessAttraction(loved, loved.businesses[0]))).toBeGreaterThan(base)
  })

  it('un concurrent dominé casse ses prix puis finit par fermer', () => {
    let s = neighbour(cafe(), { health: 25 })
    s.businesses[0].reputation = 95
    for (const p of s.businesses[0].products) p.price *= 0.85
    const start = s.rivals[0].priceLevel
    let lowest = start
    for (let i = 0; i < 150 && s.rivals.some((r) => r.id === 'r1'); i++) {
      s = tick(s)
      s.businesses[0].reputation = 95
      const r = s.rivals.find((x) => x.id === 'r1')
      if (r) lowest = Math.min(lowest, r.priceLevel)
    }
    expect(lowest).toBeLessThan(start)
    expect(s.rivals.some((r) => r.id === 'r1')).toBe(false)
    expect(s.log.some((l) => l.text.includes('ferme ses portes'))).toBe(true)
  })

  it('les enseignes s\'étendent sans dépasser la limite', () => {
    let s = cafe()
    for (let i = 0; i < 200; i++) {
      s = tick(s)
      expect(s.rivals.length).toBeLessThanOrEqual(rivalCap(s))
    }
    expect(s.rivals.length).toBeGreaterThan(0)
    const used = s.rivals.map((r) => r.parcelId)
    expect(new Set(used).size).toBe(used.length)
  })

  it('racheter un concurrent en fait un commerce avec son équipe et sa réputation', () => {
    let s = neighbour(cafe(), { reputation: 71 })
    const price = rivalPrice(s.rivals[0])
    expect(buyRivalBlock({ ...s, cash: price - 1 }, 'r1')).toMatch(/Trésorerie/)
    const parcelId = s.rivals[0].parcelId
    const cash = s.cash
    s = buyRival(s, 'r1')
    expect(s.rivals).toHaveLength(0)
    const b = s.businesses.find((x) => x.parcelId === parcelId)!
    expect(b.sectorId).toBe('cafe')
    expect(b.reputation).toBe(71)
    expect(b.employees).toHaveLength(2)
    expect(s.cash).toBeLessThanOrEqual(cash - price)
    expect(() => tick(s)).not.toThrow()
    // Sans siège, la limite de 3 commerces s'applique aussi aux rachats.
    let full = neighbour(cafe())
    for (let i = 0; i < 2; i++) full = openBusiness(full, 'cafe', full.city.parcels.find((p) => p.kind === 'lot' && isFree(full, p))!.id, `C${i}`)
    expect(buyRivalBlock(full, 'r1')).toMatch(/maximum/)
  })

  it('un concurrent voisin tente de débaucher les bons employés', () => {
    let s = neighbour(cafe(13))
    let seen = false
    for (let i = 0; i < 400 && !seen; i++) {
      for (const e of s.businesses[0].employees) {
        e.skills = { service: 80, vente: 80, qualite: 80 }
        e.trialUntil = 0
      }
      if (!s.rivals.length) s = neighbour(s)
      s = tick(s)
      const c = s.inbox.find((x) => x.kind === 'staff' && x.choices.length)
      if (!c) continue
      if (c.topic === 'debauchage') {
        seen = true
        const e = s.businesses[0].employees.find((x) => x.id === c.employeeId)!
        s = answer(s, c.id, 'match')
        expect(s.businesses[0].employees.find((x) => x.id === e.id)!.salary).toBe(c.amount)
      } else s = answer(s, c.id, c.choices[0].id)
    }
    expect(seen).toBe(true)
  })
})
