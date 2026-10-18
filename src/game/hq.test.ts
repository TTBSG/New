import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { effectiveLoanRate, hire, newGame, openBusiness, tick } from './engine'
import { HQ_LEVELS, fireOffice, hireOffice, hqMonthlyCost, maxBusinesses, openHq, purchasingRate, setPolicy, startingReputation, upgradeHq } from './hq'
import type { GameState } from './types'

const RANK3 = ['open_first', 'hire_first', 'first_sales', 'rep_60', 'two_shops', 'month_5k']
const lots = (s: GameState, d?: string) => s.city.parcels.filter((p) => p.kind === 'lot' && (!d || p.districtId === d) && isFree(s, p))

function rich(rank3 = true): GameState {
  let s = newGame(31)
  s = { ...s, cash: 2_000_000, objectivesDone: rank3 ? RANK3 : [] }
  return s
}

function withShops(s: GameState, n: number) {
  for (let i = 0; i < n; i++) s = openBusiness(s, 'cafe', lots(s, 'residentiel')[0]?.id ?? lots(s)[0].id, `C${i}`)
  return s
}

describe('siège social', () => {
  it('sans siège, on ne peut pas dépasser 3 commerces', () => {
    const s = withShops(rich(), 5)
    expect(s.businesses).toHaveLength(3)
    expect(maxBusinesses(s)).toBe(3)
  })

  it('le siège exige le rang 3', () => {
    const s = rich(false)
    expect(openHq(s, lots(s)[0].id).hq).toBeNull()
  })

  it('installer puis agrandir le siège augmente la limite de commerces', () => {
    let s = rich()
    s = openHq(s, lots(s, 'affaires')[0].id)
    expect(s.hq?.level).toBe(1)
    expect(maxBusinesses(s)).toBe(HQ_LEVELS[0].maxShops)
    s = withShops(s, 8)
    expect(s.businesses).toHaveLength(6)
    s = upgradeHq(s)
    s = withShops(s, 2)
    expect(s.businesses).toHaveLength(8)
  })

  it('le local du siège n\'est plus disponible pour un commerce', () => {
    let s = rich()
    const lot = lots(s)[0].id
    s = openHq(s, lot)
    expect(openBusiness(s, 'cafe', lot, 'X').businesses).toHaveLength(0)
  })

  it('les frais du siège sont prélevés chaque jour', () => {
    let s = openHq(rich(), lots(rich())[0].id)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'acheteur')!.id)
    // Objectifs du rang 3 déjà validés, pour qu'aucune prime ne fausse le calcul.
    s = { ...s, objectivesDone: [...RANK3, 'staff_8', 'three_shops', 'networth_200k'] }
    const cash = s.cash
    s = tick(s)
    expect(cash - s.cash).toBeCloseTo(hqMonthlyCost(s) / 30, 0)
  })

  it('les employés de bureau ont des effets sur tout le groupe', () => {
    let s = openHq(rich(), lots(rich(), 'affaires')[0].id)
    const rep = startingReputation(s)
    expect(rep).toBeGreaterThan(50)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'acheteur')!.id)
    expect(purchasingRate(s)).toBeGreaterThan(0.009)
    const rate = effectiveLoanRate(s)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'comptable')!.id)
    expect(effectiveLoanRate(s)).toBeCloseTo(rate - 0.01)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'marketing')!.id)
    expect(startingReputation(s)).toBeGreaterThan(rep)
    const id = s.hq!.staff[0].id
    s = fireOffice(s, id)
    expect(s.hq!.staff.some((e) => e.id === id)).toBe(false)
  })

  it('le nombre de bureaux limite les embauches au siège', () => {
    let s = openHq(rich(), lots(rich())[0].id)
    for (const c of [...s.officeCandidates]) s = hireOffice(s, c.id)
    expect(s.hq!.staff).toHaveLength(HQ_LEVELS[0].desks)
  })

  it('délégation : le recruteur remplace un employé qui démissionne', () => {
    let s = openHq(rich(), lots(rich())[0].id)
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'recruteur')!.id)
    s = setPolicy(s, 'autoReplace', true)
    s = withShops(s, 1)
    s = hire(s, s.businesses[0].id, s.candidates.find((c) => c.sectorId === 'cafe' && c.roleId === 'barista')!.id)
    // Un employé démotivé et sous-payé finit par partir.
    s = { ...s, businesses: s.businesses.map((b) => ({ ...b, employees: b.employees.map((e) => ({ ...e, morale: 0, salary: 500 })) })) }
    const first = s.businesses[0].employees[0].id
    for (let i = 0; i < 300 && s.businesses[0].employees.some((e) => e.id === first); i++) s = tick(s)
    expect(s.businesses[0].employees.some((e) => e.id === first)).toBe(false)
    expect(s.businesses[0].employees.length).toBeGreaterThan(0)
    expect(s.log.some((l) => l.text.includes('pour remplacer'))).toBe(true)
  })
})
