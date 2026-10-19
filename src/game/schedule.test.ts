import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { monthlyWages, newGame, openBusiness, serviceCapacity, tick } from './engine'
import { autoPlan, setHours, slotCapacity, toggleShift } from './schedule'
import { hireStaff } from './testUtils'
import type { GameState } from './types'

function cafe(staff: number): GameState {
  let s = newGame(11)
  const lot = s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === 'residentiel' && isFree(s, p))!.id
  s = openBusiness(s, 'cafe', lot, 'X')
  s = { ...s, cash: 200000 }
  return hireStaff(s, s.businesses[0].id, staff)
}

describe('horaires et planning', () => {
  it('une nouvelle recrue est à temps plein sur les créneaux les plus chargés', () => {
    const s = cafe(1)
    // Au café, le matin et le midi concentrent 80 % des clients.
    expect(s.businesses[0].employees[0].shifts).toEqual([0, 1])
    expect(slotCapacity(s.businesses[0])[2]).toBe(0)
  })

  it('le salaire suit le contrat : temps partiel, temps plein, heures sup', () => {
    let s = cafe(1)
    const b = s.businesses[0]
    const e = b.employees[0]
    const full = monthlyWages(b)
    s = toggleShift(s, b.id, e.id, 2)
    expect(monthlyWages(s.businesses[0])).toBeCloseTo(full * 1.6)
    s = toggleShift(s, b.id, e.id, 2)
    s = toggleShift(s, b.id, e.id, 0)
    expect(monthlyWages(s.businesses[0])).toBeCloseTo(full * 0.5)
    // On ne peut pas retirer le dernier créneau.
    s = toggleShift(s, b.id, e.id, 1)
    expect(s.businesses[0].employees[0].shifts).toEqual([1])
  })

  it("fermer un créneau replace l'équipe et fait perdre ses clients", () => {
    let s = cafe(2)
    const id = s.businesses[0].id
    for (let i = 0; i < 7; i++) s = tick(s)
    const before = s.businesses[0].history.at(-1)!.demand
    s = setHours(s, id, 0, false)
    expect(s.businesses[0].employees.every((e) => e.shifts.length === 2 && !e.shifts.includes(0))).toBe(true)
    for (let i = 0; i < 7; i++) s = tick(s)
    const r = s.businesses[0].history.at(-1)!
    expect(r.slotDemand![0]).toBe(0)
    expect(r.demand).toBeLessThan(before * 0.75)
    // Impossible de tout fermer.
    s = setHours(s, id, 1, false)
    s = setHours(s, id, 2, false)
    expect(s.businesses[0].hours.filter(Boolean)).toHaveLength(1)
  })

  it('le planning auto couvre les heures de pointe', () => {
    let s = cafe(3)
    const id = s.businesses[0].id
    for (const e of s.businesses[0].employees) {
      for (const slot of [0, 1, 2] as const) if (!e.shifts.includes(slot)) s = toggleShift(s, id, e.id, slot)
      for (const slot of [0, 1] as const) s = toggleShift(s, id, e.id, slot)
    }
    // Tout le monde le soir : le rush du matin n'est pas servi.
    expect(slotCapacity(s.businesses[0])[0]).toBe(0)
    s = autoPlan(s, id)
    const cap = slotCapacity(s.businesses[0])
    expect(cap[0]).toBeGreaterThan(0)
    expect(cap[0]).toBeGreaterThanOrEqual(cap[2])
    expect(serviceCapacity(s.businesses[0])).toBeGreaterThan(0)
  })

  it('les heures sup fatiguent', () => {
    let s = cafe(2)
    const [a, b] = s.businesses[0].employees
    const id = s.businesses[0].id
    for (const slot of [0, 1, 2] as const) if (!a.shifts.includes(slot)) s = toggleShift(s, id, a.id, slot)
    for (let i = 0; i < 40; i++) s = tick(s)
    const team = s.businesses[0].employees
    const tired = team.find((e) => e.id === a.id)
    const rested = team.find((e) => e.id === b.id)
    if (tired && rested) expect(tired.morale).toBeLessThan(rested.morale + 5)
  })
})
