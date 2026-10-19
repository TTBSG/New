import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { fire, hire, newGame, openBusiness, serviceCapacity, tick } from './engine'
import { hireOffice, openHq } from './hq'
import { INTERVIEWS_PER_DAY, TRAITS_DISCOVERY_DAYS, interview, interviewsLeft, postJob, salesFactor, serviceQuality } from './staff'
import type { Employee, GameState } from './types'

const lot = (s: GameState) => s.city.parcels.find((p) => p.kind === 'lot' && p.districtId === 'residentiel' && isFree(s, p))!.id
function cafe(): GameState {
  let s = newGame(17)
  s = openBusiness(s, 'cafe', lot(s), 'X')
  return { ...s, cash: 200000 }
}
const worker = (over: Partial<Employee>): Employee => ({
  id: 'e',
  name: 'Test',
  roleId: 'barista',
  skills: { service: 50, vente: 50, qualite: 50 },
  traits: [],
  traitsKnown: true,
  salary: 2000,
  morale: 60,
  hiredDay: 1,
  trialUntil: 0,
  ...over,
})

describe('personnel', () => {
  it('les candidats spontanés ont un caractère caché', () => {
    const s = newGame(1)
    const c = s.candidates.filter((x) => x.source === 'spontane')
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((x) => !x.traitsKnown && x.traits.length === 2)).toBe(true)
  })

  it('une annonce et un cabinet apportent des candidats ; le cabinet fournit un dossier complet', () => {
    let s = cafe()
    const before = s.candidates.length
    s = postJob(s, 'cafe', 'barista', 'annonce')
    expect(s.candidates.length).toBe(before + 4)
    s = postJob(s, 'cafe', 'barista', 'cabinet')
    const fromCabinet = s.candidates.filter((x) => x.source === 'cabinet')
    expect(fromCabinet).toHaveLength(3)
    expect(fromCabinet.every((x) => x.traitsKnown)).toBe(true)
  })

  it(`l'entretien révèle le caractère, ${INTERVIEWS_PER_DAY} fois par jour au maximum`, () => {
    let s = postJob(cafe(), 'cafe', 'barista', 'annonce')
    const hidden = s.candidates.filter((x) => !x.traitsKnown)
    for (const c of hidden.slice(0, INTERVIEWS_PER_DAY + 1)) s = interview(s, c.id)
    expect(s.candidates.filter((x) => x.traitsKnown && hidden.some((h) => h.id === x.id))).toHaveLength(INTERVIEWS_PER_DAY)
    expect(interviewsLeft(s)).toBe(0)
    s = tick(s)
    expect(interviewsLeft(s)).toBe(INTERVIEWS_PER_DAY)
  })

  it('avec un responsable RH au siège, les entretiens sont faits pour vous', () => {
    let s = cafe()
    s = { ...s, objectivesDone: ['open_first', 'hire_first', 'first_sales', 'rep_60', 'two_shops', 'month_5k'] }
    s = openHq(s, lot(s))
    s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'recruteur')!.id)
    s = postJob(s, 'cafe', 'barista', 'annonce')
    expect(s.candidates.filter((x) => x.source === 'annonce').every((x) => x.traitsKnown)).toBe(true)
    expect(interviewsLeft(s)).toBe(Infinity)
  })

  it('pendant la période d\'essai, se séparer d\'un employé est gratuit', () => {
    let s = cafe()
    s = hire(s, s.businesses[0].id, s.candidates.find((c) => c.sectorId === 'cafe' && c.roleId === 'barista')!.id)
    const cash = s.cash
    s = fire(s, s.businesses[0].id, s.businesses[0].employees[0].id)
    expect(s.cash).toBe(cash)
  })

  it('on découvre le caractère d\'un employé embauché sans entretien', () => {
    let s = cafe()
    s = hire(s, s.businesses[0].id, s.candidates.find((c) => c.sectorId === 'cafe' && c.roleId === 'barista' && !c.traitsKnown)!.id)
    expect(s.businesses[0].employees[0].traitsKnown).toBe(false)
    for (let i = 0; i <= TRAITS_DISCOVERY_DAYS; i++) s = tick(s)
    expect(s.businesses[0].employees[0]?.traitsKnown ?? true).toBe(true)
  })

  it('les traits ont des effets mesurables', () => {
    const s = cafe()
    const base = { ...s.businesses[0], employees: [worker({})] }
    const fast = { ...s.businesses[0], employees: [worker({ traits: ['rapide'] })] }
    expect(serviceCapacity(fast)).toBeGreaterThan(serviceCapacity(base))
    expect(salesFactor([worker({ traits: ['vendeur'] })])).toBeGreaterThan(salesFactor([worker({})]))
    expect(serviceQuality([worker({ traits: ['souriant'] })])).toBeGreaterThan(serviceQuality([worker({ traits: ['distrait'] })]))
  })

  it('un râleur plombe le moral de ses collègues', () => {
    const run = (grumpy: boolean) => {
      let s = cafe()
      const team = [worker({ id: 'a' }), worker({ id: 'b', traits: grumpy ? ['raleur'] : [] })]
      s = { ...s, businesses: s.businesses.map((b) => ({ ...b, employees: team })) }
      for (let i = 0; i < 30; i++) s = tick(s)
      return s.businesses[0].employees.find((e) => e.id === 'a')?.morale ?? 0
    }
    expect(run(true)).toBeLessThan(run(false))
  })

  it('un mentor fait progresser ses collègues plus vite', () => {
    const run = (mentor: boolean) => {
      let s = cafe()
      const team = [worker({ id: 'a', skills: { service: 30, vente: 30, qualite: 30 } }), worker({ id: 'b', traits: mentor ? ['mentor'] : [] })]
      s = { ...s, businesses: s.businesses.map((b) => ({ ...b, employees: team })) }
      for (let i = 0; i < 30; i++) s = tick(s)
      return s.businesses[0].employees.find((e) => e.id === 'a')!.skills.service
    }
    expect(run(true)).toBeGreaterThan(run(false))
  })
})
