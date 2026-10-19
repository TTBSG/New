import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { monthlyWages, newGame, openBusiness, serviceCapacity, tick } from './engine'
import { hireOffice, openHq, setPolicy } from './hq'
import { answer } from './messages'
import { toggleShift } from './schedule'
import { CHEF, TRAINING, moraleFactors, promote, promotionBlock, train } from './staff'
import { hireStaff } from './testUtils'
import type { GameState } from './types'

const RANK3 = ['open_first', 'hire_first', 'first_sales', 'rep_60', 'two_shops', 'month_5k']
const lot = (s: GameState, d = 'residentiel') => s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === d && isFree(s, p))!.id

function cafe(staff: number, seed = 21): GameState {
  let s = newGame(seed)
  s = openBusiness(s, 'cafe', lot(s), 'X')
  s = { ...s, cash: 500000 }
  return hireStaff(s, s.businesses[0].id, staff)
}
const team = (s: GameState) => s.businesses[0].employees

describe('évolution et bien-être', () => {
  it('une formation coûte, éloigne 2 jours puis fait progresser', () => {
    let s = cafe(1)
    const e = team(s)[0]
    const cash = s.cash
    const before = e.skills.qualite
    s = train(s, s.businesses[0].id, e.id, 'qualite')
    expect(s.cash).toBe(cash - TRAINING.cost)
    expect(team(s)[0].absence?.reason).toBe('formation')
    expect(serviceCapacity(s.businesses[0])).toBe(0)
    // Pas deux formations en même temps.
    expect(train(s, s.businesses[0].id, e.id, 'vente')).toBe(s)
    for (let i = 0; i < TRAINING.days; i++) s = tick(s)
    expect(team(s)[0].absence).toBeUndefined()
    expect(team(s)[0].skills.qualite).toBeGreaterThanOrEqual(before + TRAINING.gain)
  })

  it("les promotions demandent du niveau et de l'ancienneté", () => {
    let s = cafe(2)
    const id = s.businesses[0].id
    const e = team(s)[0]
    expect(promotionBlock(s, s.businesses[0], e, 'chef')).toMatch(/requis/)
    e.skills = { service: 80, vente: 80, qualite: 80 }
    e.hiredDay = s.day - 100
    const salary = e.salary
    s = promote(s, id, e.id, 'chef')
    expect(team(s)[0].chef).toBe(true)
    expect(team(s)[0].salary).toBeCloseTo(salary * (1 + CHEF.raise), -1)
    s = promote(s, id, e.id, 'manager')
    expect(team(s)[0].roleId).toBe('manager')
  })

  it('les heures sup fatiguent, le temps partiel repose', () => {
    let s = cafe(2)
    const id = s.businesses[0].id
    const [a, b] = team(s)
    for (const slot of [0, 1, 2] as const) if (!a.shifts.includes(slot)) s = toggleShift(s, id, a.id, slot)
    s = toggleShift(s, id, b.id, b.shifts[0])
    for (let i = 0; i < 10; i++) s = tick(s)
    const tired = team(s).find((e) => e.id === a.id)!
    const rested = team(s).find((e) => e.id === b.id)!
    expect(tired.fatigue).toBeGreaterThan(20)
    expect(rested.fatigue).toBe(0)
  })

  it("l'épuisement mène à des arrêts maladie", () => {
    let s = cafe(4, 3)
    let sick = 0
    for (let i = 0; i < 120; i++) {
      for (const e of s.businesses[0].employees) e.fatigue = 100
      s = tick(s)
      sick += team(s).filter((e) => e.absence?.reason === 'maladie').length
    }
    expect(sick).toBeGreaterThan(0)
  })

  it('les avantages sociaux exigent un responsable RH et coûtent par employé', () => {
    let s = cafe(2)
    s = { ...s, objectivesDone: RANK3 }
    s = openHq(s, lot(s, 'affaires'))
    s = setPolicy(s, 'tickets', true)
    const b = s.businesses[0]
    expect(moraleFactors(s, b, b.employees[0], 1).some((f) => f.label === 'Tickets restaurant')).toBe(false)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'recruteur')!.id)
    expect(moraleFactors(s, s.businesses[0], s.businesses[0].employees[0], 1).some((f) => f.label === 'Tickets restaurant')).toBe(true)
    s = tick(s)
    const r = s.businesses[0].history.at(-1)!
    expect(r.wages).toBeCloseTo((monthlyWages(s.businesses[0]) + 2 * 110) / 30, 0)
  })

  it("les employés écrivent : congés, promotions, conflits, parrainages", () => {
    let s = cafe(3, 8)
    const topics = new Set<string>()
    for (let i = 0; i < 200; i++) {
      s = tick(s)
      const c = s.inbox.find((x) => x.kind === 'staff' && x.choices.length)
      if (c) {
        topics.add(c.topic!)
        s = answer(s, c.id, c.choices[0].id)
      }
    }
    expect(topics.size).toBeGreaterThan(0)
    expect(topics.has('conges')).toBe(true)
  })
})
