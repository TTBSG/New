import { describe, expect, it } from 'vitest'
import { isVacant } from './city'
import { diagnose } from './diagnose'
import { hire, newGame, openBusiness, setPrice, tick } from './engine'
import type { GameState } from './types'

function cafe(staff: number): GameState {
  let s = newGame(11)
  s = openBusiness(s, 'cafe', s.city.parcels.find((p) => p.districtId === 'residentiel' && isVacant(p, s.businesses))!.id, 'X')
  for (let i = 0; i < staff; i++) s = hire(s, s.businesses[0].id, s.candidates.find((c) => c.sectorId === 'cafe' && c.roleId === 'barista')!.id)
  return s
}

describe('diagnostic', () => {
  it('signale l\'absence de personnel', () => {
    const s = cafe(0)
    expect(diagnose(s, s.businesses[0])[0]).toMatchObject({ tone: 'bad' })
  })

  it('repère un prix trop élevé', () => {
    let s = cafe(2)
    s = setPrice(s, s.businesses[0].id, 'espresso', 5)
    for (let i = 0; i < 3; i++) s = tick(s)
    expect(diagnose(s, s.businesses[0]).some((i) => i.text.includes('Espresso') && i.text.includes('trop cher'))).toBe(true)
  })

  it('conclut positivement quand tout va bien', () => {
    let s = cafe(2)
    for (let i = 0; i < 10; i++) s = tick(s)
    expect(diagnose(s, s.businesses[0]).at(-1)!.tone).not.toBe('bad')
  })
})
