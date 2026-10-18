import { describe, expect, it } from 'vitest'
import { isVacant } from './city'
import { borrow, fire, hire, newGame, openBusiness, repay, setPrice, tick } from './engine'
import { SECTORS } from './sectors'
import type { GameState } from './types'

function run(s: GameState, days: number) {
  for (let i = 0; i < days; i++) s = tick(s)
  return s
}

/** Premier local libre du quartier demandé. */
function lotIn(s: GameState, districtId: string) {
  return s.city.parcels.find((p) => p.districtId === districtId && isVacant(p, s.businesses))!.id
}

function staffed(sectorId: string, districtId: string, staff: number, seed = 42) {
  let s = newGame(seed)
  s = borrow(s, 100000)
  s = openBusiness(s, sectorId, lotIn(s, districtId), 'Test')
  const b = s.businesses[0]
  const sector = SECTORS.find((x) => x.id === sectorId)!
  const serviceRole = sector.roles.find((r) => r.capacity > 0)!
  for (let i = 0; i < staff; i++) {
    const c = s.candidates.filter((x) => x.sectorId === sectorId && x.roleId === serviceRole.id).sort((a, z) => z.skill - a.skill)[0]
    s = hire(s, b.id, c.id)
  }
  return s
}

const monthlyProfit = (s: GameState) => s.businesses[0].history.slice(-30).reduce((a, r) => a + r.profit, 0)

describe('moteur', () => {
  it('est déterministe pour une même graine', () => {
    expect(run(staffed('cafe', 'residentiel', 2), 60)).toEqual(run(staffed('cafe', 'residentiel', 2), 60))
  })

  it('un café bien géré est rentable', () => {
    const s = run(staffed('cafe', 'residentiel', 2), 90)
    expect(monthlyProfit(s)).toBeGreaterThan(0)
  })

  it.each(SECTORS.map((x) => x.id))('le secteur %s peut être rentable en centre-ville', (id) => {
    const s = run(staffed(id, 'centre', 3), 90)
    expect(monthlyProfit(s)).toBeGreaterThan(0)
  })

  it('sans personnel, rien ne se vend', () => {
    const s = run(staffed('cafe', 'residentiel', 0), 10)
    expect(s.businesses[0].history.every((r) => r.unitsSold === 0)).toBe(true)
  })

  it('des prix abusifs font chuter les ventes et la réputation', () => {
    let s = staffed('cafe', 'residentiel', 2)
    for (const p of s.businesses[0].products) s = setPrice(s, s.businesses[0].id, p.id, p.price * 3)
    s = run(s, 60)
    const normal = run(staffed('cafe', 'residentiel', 2), 60)
    expect(s.businesses[0].reputation).toBeLessThan(normal.businesses[0].reputation)
    expect(s.businesses[0].history.at(-1)!.unitsSold).toBeLessThan(normal.businesses[0].history.at(-1)!.unitsSold / 3)
  })

  it('le licenciement coûte une indemnité', () => {
    const s = staffed('cafe', 'residentiel', 1)
    const after = fire(s, s.businesses[0].id, s.businesses[0].employees[0].id)
    expect(after.cash).toBeLessThan(s.cash)
    expect(after.businesses[0].employees).toHaveLength(0)
  })

  it('la ville a des locaux libres dans chaque quartier', () => {
    const s = newGame(5)
    for (const d of ['residentiel', 'commercial', 'centre', 'affaires']) {
      expect(s.city.parcels.filter((p) => p.districtId === d && p.kind === 'lot').length).toBeGreaterThanOrEqual(4)
    }
  })

  it('on ne peut pas ouvrir deux commerces sur le même local', () => {
    let s = newGame(3)
    const lot = lotIn(s, 'residentiel')
    s = openBusiness(s, 'cafe', lot, 'A')
    s = openBusiness(s, 'cafe', lot, 'B')
    expect(s.businesses).toHaveLength(1)
  })

  it('le prêt est plafonné et remboursable', () => {
    let s = newGame(1)
    s = borrow(s, 10_000_000)
    expect(s.loan).toBe(40000)
    s = repay(s, 15000)
    expect(s.loan).toBe(25000)
  })

  it('la faillite survient après 30 jours de trésorerie négative', () => {
    let s = staffed('restaurant', 'affaires', 4)
    s = { ...s, cash: -50000 }
    s = run(s, 31)
    expect(s.gameOver).toBe(true)
  })
})
