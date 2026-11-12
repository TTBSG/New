import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { dateOf, eventsFor, newGame, openBusiness, tick } from './engine'
import { weatherMult } from './weather'
import type { GameState } from './types'

const lot = (s: GameState, d: string) => s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === d && isFree(s, p))!.id

describe('météo et événements de quartier', () => {
  it('il ne neige que l\'hiver, et le temps change au fil des jours', () => {
    let s = newGame(6)
    const seen = new Set<string>()
    for (let i = 0; i < 365; i++) {
      s = tick(s)
      seen.add(s.weather)
      const month = dateOf(s.day).getUTCMonth()
      if (s.weather === 'neige') expect([11, 0, 1]).toContain(month)
    }
    expect(seen.has('soleil') && seen.has('pluie') && seen.has('neige')).toBe(true)
  })

  it('la pluie vide les terrasses plus que les supérettes', () => {
    expect(weatherMult('pluie', 'cafe')).toBeLessThan(weatherMult('pluie', 'superette'))
    expect(weatherMult('soleil', 'cafe')).toBeGreaterThan(1)
    expect(weatherMult('nuages', 'cafe')).toBe(1)
  })

  it('un événement de quartier ne touche que les commerces du quartier', () => {
    let s = newGame(6)
    s = { ...s, cash: 500000 }
    s = openBusiness(s, 'cafe', lot(s, 'residentiel'), 'A')
    s = openBusiness(s, 'cafe', lot(s, 'commercial'), 'B')
    s = { ...s, events: [{ id: 'x', title: 'Festival de rue', description: '', sectorId: null, districtId: 'commercial', demandMult: 1.4, endsDay: s.day + 5 }] }
    expect(eventsFor(s, s.businesses[0])).toHaveLength(0)
    expect(eventsFor(s, s.businesses[1])).toHaveLength(1)
  })

  it('des événements de quartier apparaissent, un seul à la fois par quartier', () => {
    let s = newGame(8)
    let local = 0
    for (let i = 0; i < 200; i++) {
      s = tick(s)
      const districts = s.events.filter((e) => e.districtId).map((e) => e.districtId)
      expect(new Set(districts).size).toBe(districts.length)
      local = Math.max(local, districts.length)
    }
    expect(local).toBeGreaterThan(0)
  })
})
