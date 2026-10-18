import { describe, expect, it } from 'vitest'
import { isVacant } from './city'
import { dismissCelebration, hire, newGame, openBusiness, tick } from './engine'
import { activeObjectives, currentRank } from './objectives'
import type { GameState } from './types'

const lot = (s: GameState) => s.city.parcels.find((p) => p.districtId === 'residentiel' && isVacant(p, s.businesses))!.id

describe('objectifs', () => {
  it('les secteurs avancés sont verrouillés au départ', () => {
    const s = newGame(2)
    expect(openBusiness(s, 'restaurant', lot(s), 'X').businesses).toHaveLength(0)
    expect(openBusiness(s, 'cafe', lot(s), 'X').businesses).toHaveLength(1)
  })

  it('ouvrir puis embaucher valide les premiers objectifs immédiatement', () => {
    let s = newGame(2)
    s = openBusiness(s, 'cafe', lot(s), 'X')
    expect(s.objectivesDone).toContain('open_first')
    const c = s.candidates.find((x) => x.sectorId === 'cafe' && x.roleId === 'barista')!
    const cash = s.cash
    s = hire(s, s.businesses[0].id, c.id)
    expect(s.objectivesDone).toContain('hire_first')
    expect(s.cash).toBe(cash + 500)
    expect(s.celebrations.length).toBe(2)
    s = dismissCelebration(s)
    expect(s.celebrations.length).toBe(1)
  })

  it('terminer le rang 1 débloque restaurant et vêtements', () => {
    let s = newGame(2)
    s = openBusiness(s, 'cafe', lot(s), 'X')
    for (const _ of [0, 1]) s = hire(s, s.businesses[0].id, s.candidates.find((x) => x.sectorId === 'cafe' && x.roleId === 'barista')!.id)
    for (let i = 0; i < 60 && currentRank(s) === 1; i++) s = tick(s)
    expect(currentRank(s)).toBe(2)
    expect(s.unlockedSectors).toEqual(expect.arrayContaining(['restaurant', 'vetements']))
    expect(activeObjectives(s).every((o) => o.rank === 2)).toBe(true)
    expect(s.inbox.some((c) => c.lines.some((l) => l.text.includes('Boutique de quartier')))).toBe(true)
  })
})
