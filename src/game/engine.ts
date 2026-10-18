import { generateCity, getParcel, parcelRent, parcelTraffic, isVacant } from './city'
import { FIRST_NAMES, LAST_NAMES, RANDOM_EVENTS, SECTORS, SUPPLIERS, getSector } from './sectors'
import type { Business, Candidate, DayReport, Employee, GameState, LogEntry, ProductState, SupplierTier } from './types'

export const SAVE_VERSION = 2
export const START_CASH = 60000
const HISTORY_DAYS = 120
const LOG_SIZE = 80
const BANKRUPTCY_DAYS = 30
/** Jour 1 = lundi 4 janvier 2027. */
const START_DATE = Date.UTC(2027, 0, 4)
const WEEKDAY_TRAFFIC = [0.9, 0.95, 1, 1, 1.1, 1.25, 0.8]

// ---------- Utilitaires ----------

/** Générateur pseudo-aléatoire déterministe (mulberry32) stocké dans l'état pour des parties reproductibles. */
export function rand(s: GameState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const randRange = (s: GameState, min: number, max: number) => min + rand(s) * (max - min)
const pick = <T>(s: GameState, arr: T[]): T => arr[Math.floor(rand(s) * arr.length)]
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round2 = (v: number) => Math.round(v * 100) / 100

function update(s: GameState, fn: (d: GameState) => void): GameState {
  const d = structuredClone(s)
  fn(d)
  return d
}

function log(s: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  s.log.unshift({ day: s.day, text, tone })
  if (s.log.length > LOG_SIZE) s.log.length = LOG_SIZE
}

const newId = (s: GameState, prefix: string) => `${prefix}${s.nextId++}`

export function dateOf(day: number): Date {
  return new Date(START_DATE + (day - 1) * 86400000)
}

export function weekday(day: number): number {
  return (day - 1) % 7
}

// ---------- Calculs dérivés ----------

export function unitCost(sectorId: string, p: ProductState): number {
  const def = getSector(sectorId).products.find((x) => x.id === p.id)!
  return def.unitCost * SUPPLIERS[p.supplier].costMult
}

/** Prix que les clients jugent « juste » compte tenu de la qualité. */
export function perceivedPrice(sectorId: string, p: ProductState): number {
  const def = getSector(sectorId).products.find((x) => x.id === p.id)!
  return def.refPrice * (0.75 + SUPPLIERS[p.supplier].quality / 240)
}

export function serviceCapacity(b: Business): number {
  const sector = getSector(b.sectorId)
  let cap = 0
  let staff = 0
  let managers = 0
  for (const e of b.employees) {
    const role = sector.roles.find((r) => r.id === e.roleId)!
    if (role.capacity > 0) {
      staff++
      cap += role.capacity * (0.7 + e.skill / 170) * (0.8 + e.morale / 250)
    } else {
      managers++
    }
  }
  const effectiveManagers = Math.min(managers, Math.ceil(staff / 5))
  return cap * (1 + 0.12 * effectiveManagers)
}

export function monthlyWages(b: Business): number {
  return b.employees.reduce((sum, e) => sum + e.salary, 0)
}

export function stockValue(b: Business): number {
  return b.products.reduce((sum, p) => sum + p.stock * unitCost(b.sectorId, p), 0)
}

export function businessValue(b: Business): number {
  const recent = b.history.slice(-30)
  const monthlyProfit = recent.length ? (recent.reduce((s, r) => s + r.profit, 0) / recent.length) * 30 : 0
  return Math.max(0, getSector(b.sectorId).setupCost * 0.5 + stockValue(b) * 0.6 + Math.max(0, monthlyProfit) * 8)
}

export function netWorth(s: GameState): number {
  return s.cash - s.loan + s.businesses.reduce((sum, b) => sum + businessValue(b), 0)
}

export function maxLoan(s: GameState): number {
  return Math.round(40000 + s.businesses.reduce((sum, b) => sum + businessValue(b) * 0.6, 0))
}

/** Aménagement + deux mois de loyer en caution. */
export function openingCost(state: GameState, sectorId: string, parcelId: string): number {
  return getSector(sectorId).setupCost + parcelRent(getParcel(state.city, parcelId)) * 2
}

/** Salaire attendu sur le marché pour un niveau de compétence donné. */
export function fairSalary(baseSalary: number, skill: number): number {
  return baseSalary * (0.8 + skill / 160)
}

// ---------- Création de partie ----------

export function newGame(seed = Date.now() % 2147483647): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    day: 1,
    cash: START_CASH,
    loan: 0,
    loanRate: 0.06,
    daysInDebt: 0,
    gameOver: false,
    economy: 1,
    sectorTrends: Object.fromEntries(SECTORS.map((x) => [x.id, 1])),
    events: [],
    city: { size: 0, roads: [], parcels: [] },
    businesses: [],
    candidates: [],
    log: [],
    nextId: 1,
  }
  s.city = generateCity(() => rand(s))
  refreshCandidates(s)
  log(s, `Bienvenue ! Vous démarrez avec ${START_CASH.toLocaleString('fr-FR')} €. Ouvrez votre première entreprise.`, 'good')
  return s
}

function makeCandidate(s: GameState, sectorId: string, roleId: string): Candidate {
  const role = getSector(sectorId).roles.find((r) => r.id === roleId)!
  const skill = Math.round(randRange(s, 15, 92))
  const salary = Math.round((fairSalary(role.baseSalary, skill) * randRange(s, 0.95, 1.05)) / 10) * 10
  return {
    id: newId(s, 'c'),
    name: `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`,
    sectorId,
    roleId,
    skill,
    salary,
  }
}

function refreshCandidates(s: GameState) {
  s.candidates = []
  for (const sector of SECTORS) {
    for (const role of sector.roles) {
      const count = role.capacity > 0 ? 4 : 2
      for (let i = 0; i < count; i++) s.candidates.push(makeCandidate(s, sector.id, role.id))
    }
  }
}

// ---------- Simulation d'une journée ----------

function simulateBusiness(s: GameState, b: Business): DayReport {
  const sector = getSector(b.sectorId)
  const parcel = getParcel(s.city, b.parcelId)

  const eventMult = s.events
    .filter((e) => e.sectorId === null || e.sectorId === b.sectorId)
    .reduce((m, e) => m * e.demandMult, 1)
  const marketingFactor = 1 + 0.5 * Math.log10(1 + b.marketingDaily / 10)
  const reputationFactor = 0.6 + b.reputation / 125
  const visitors = Math.round(
    parcelTraffic(parcel) *
      sector.trafficMult *
      WEEKDAY_TRAFFIC[weekday(s.day)] *
      s.economy *
      (s.sectorTrends[b.sectorId] ?? 1) *
      eventMult *
      marketingFactor *
      reputationFactor *
      randRange(s, 0.9, 1.1),
  )

  // Demande par produit selon le prix et la qualité perçue.
  const demands = b.products.map((p) => {
    const def = sector.products.find((x) => x.id === p.id)!
    const ref = perceivedPrice(b.sectorId, p)
    const priceFactor = Math.min(2.5, (ref / Math.max(0.01, p.price)) ** sector.priceElasticity)
    return visitors * def.baseShare * priceFactor
  })
  const totalDemand = demands.reduce((a, x) => a + x, 0)
  const capacity = serviceCapacity(b)
  const servedRatio = totalDemand > 0 ? Math.min(1, capacity / totalDemand) : 0

  let revenue = 0
  let grossMargin = 0
  let unitsSold = 0
  let lostToStockout = 0
  let qualitySum = 0
  let priceRatioSum = 0
  b.products.forEach((p, i) => {
    const want = demands[i] * servedRatio
    const sold = Math.min(p.stock, Math.floor(want + rand(s)))
    p.stock -= sold
    unitsSold += sold
    lostToStockout += Math.max(0, want - sold)
    revenue += sold * p.price
    grossMargin += sold * (p.price - unitCost(b.sectorId, p))
    qualitySum += SUPPLIERS[p.supplier].quality * demands[i]
    priceRatioSum += (p.price / perceivedPrice(b.sectorId, p)) * demands[i]
  })
  const lostToCapacity = totalDemand * (1 - servedRatio)

  // Réputation : tend vers une cible selon l'expérience client du jour.
  if (totalDemand > 0) {
    const avgQuality = qualitySum / totalDemand
    const avgPriceRatio = priceRatioSum / totalDemand
    const avgSkill = b.employees.length ? b.employees.reduce((a, e) => a + e.skill, 0) / b.employees.length : 0
    const target =
      50 +
      (avgQuality - 60) * 0.8 -
      (avgPriceRatio - 1) * 40 -
      (lostToCapacity / totalDemand) * 50 -
      (lostToStockout / totalDemand) * 50 +
      (avgSkill - 50) * 0.2
    b.reputation = clamp(b.reputation + (clamp(target, 0, 100) - b.reputation) * 0.04, 0, 100)
  }

  s.cash += revenue

  // Réapprovisionnement automatique.
  let purchases = 0
  for (const p of b.products) {
    if (p.restockTarget > p.stock) {
      const qty = p.restockTarget - p.stock
      const cost = qty * unitCost(b.sectorId, p)
      if (s.cash >= cost) {
        s.cash -= cost
        purchases += cost
        p.stock += qty
      }
    }
  }

  const wages = monthlyWages(b) / 30
  const rent = parcelRent(parcel) / 30
  const marketing = b.marketingDaily
  s.cash -= wages + rent + marketing

  // Évolution des employés.
  const load = capacity > 0 ? totalDemand / capacity : 0
  const hasManager = b.employees.some((e) => sector.roles.find((r) => r.id === e.roleId)!.capacity === 0)
  b.employees = b.employees.filter((e) => {
    const role = sector.roles.find((r) => r.id === e.roleId)!
    e.skill = Math.min(100, e.skill + 0.04)
    const moraleTarget = clamp(
      55 + (e.salary / fairSalary(role.baseSalary, e.skill) - 1) * 150 - Math.min(30, Math.max(0, load - 1) * 25) + (hasManager ? 10 : 0),
      0,
      100,
    )
    e.morale = clamp(e.morale + (moraleTarget - e.morale) * 0.05, 0, 100)
    if (e.morale < 20 && rand(s) < 0.015) {
      log(s, `${e.name} a démissionné de ${b.name} (moral trop bas).`, 'bad')
      return false
    }
    return true
  })

  const report: DayReport = {
    day: s.day,
    visitors,
    demand: Math.round(totalDemand),
    unitsSold,
    lostToCapacity: Math.round(lostToCapacity),
    lostToStockout: Math.round(lostToStockout),
    revenue: round2(revenue),
    grossMargin: round2(grossMargin),
    purchases: round2(purchases),
    wages: round2(wages),
    rent: round2(rent),
    marketing,
    profit: round2(grossMargin - wages - rent - marketing),
  }
  b.history.push(report)
  if (b.history.length > HISTORY_DAYS) b.history.splice(0, b.history.length - HISTORY_DAYS)
  return report
}

function updateMarket(s: GameState) {
  s.economy = clamp(s.economy + (1 - s.economy) * 0.02 + (rand(s) - 0.5) * 0.012, 0.8, 1.2)
  for (const id of Object.keys(s.sectorTrends)) {
    const t = s.sectorTrends[id]
    s.sectorTrends[id] = clamp(t + (1 - t) * 0.02 + (rand(s) - 0.5) * 0.02, 0.75, 1.25)
  }

  for (const e of s.events.filter((x) => x.endsDay < s.day)) log(s, `Fin de l'événement : ${e.title}.`)
  s.events = s.events.filter((x) => x.endsDay >= s.day)

  if (rand(s) < 1 / 12) {
    const tpl = pick(s, RANDOM_EVENTS)
    if (!s.events.some((e) => e.title === tpl.title)) {
      const mult = round2(randRange(s, tpl.mult[0], tpl.mult[1]))
      const duration = Math.round(randRange(s, tpl.days[0], tpl.days[1]))
      s.events.push({
        id: newId(s, 'e'),
        title: tpl.title,
        description: tpl.description,
        sectorId: tpl.sector,
        demandMult: mult,
        endsDay: s.day + duration,
      })
      const scope = tpl.sector ? getSector(tpl.sector).name : 'tous les secteurs'
      log(s, `${tpl.title} : ${tpl.description} (${scope}, ${mult > 1 ? '+' : ''}${Math.round((mult - 1) * 100)} % de demande, ${duration} j)`, mult > 1 ? 'good' : 'bad')
    }
  }
}

export function tick(state: GameState): GameState {
  if (state.gameOver) return state
  return update(state, (s) => {
    s.day++
    updateMarket(s)
    for (const b of s.businesses) simulateBusiness(s, b)

    if (s.loan > 0) s.cash -= (s.loan * s.loanRate) / 365
    if (weekday(s.day) === 0) refreshCandidates(s)

    if (s.cash < 0) {
      s.daysInDebt++
      if (s.daysInDebt === 1) log(s, `Trésorerie négative ! Vous avez ${BANKRUPTCY_DAYS} jours pour redresser la barre.`, 'bad')
      if (s.daysInDebt >= BANKRUPTCY_DAYS) {
        s.gameOver = true
        log(s, 'Faillite : votre trésorerie est restée négative trop longtemps.', 'bad')
      }
    } else {
      s.daysInDebt = 0
    }
  })
}

// ---------- Actions du joueur ----------

export function openBusiness(state: GameState, sectorId: string, parcelId: string, name: string): GameState {
  const parcel = state.city.parcels.find((p) => p.id === parcelId)
  if (!parcel || !isVacant(parcel, state.businesses)) return state
  const cost = openingCost(state, sectorId, parcelId)
  if (state.cash < cost) return state
  return update(state, (s) => {
    const sector = getSector(sectorId)
    const traffic = parcelTraffic(parcel)
    s.cash -= cost
    const b: Business = {
      id: newId(s, 'b'),
      name: name.trim() || `${sector.name} ${parcel.address}`,
      sectorId,
      parcelId,
      openedDay: s.day,
      employees: [],
      marketingDaily: 0,
      reputation: 50,
      history: [],
      products: sector.products.map((p) => ({
        id: p.id,
        price: p.refPrice,
        stock: 0,
        supplier: 'standard' as SupplierTier,
        restockTarget: Math.max(1, Math.ceil(traffic * sector.trafficMult * p.baseShare * 1.5)),
      })),
    }
    // Stock de départ.
    for (const p of b.products) {
      const c = p.restockTarget * unitCost(sectorId, p)
      if (s.cash >= c) {
        s.cash -= c
        p.stock = p.restockTarget
      }
    }
    s.businesses.push(b)
    log(s, `${b.name} (${sector.name}) ouvre ses portes au ${parcel.address} ! Pensez à recruter du personnel.`, 'good')
  })
}

function withBusiness(state: GameState, businessId: string, fn: (s: GameState, b: Business) => void): GameState {
  if (!state.businesses.some((b) => b.id === businessId)) return state
  return update(state, (s) => fn(s, s.businesses.find((b) => b.id === businessId)!))
}

export function setPrice(state: GameState, businessId: string, productId: string, price: number): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const p = b.products.find((x) => x.id === productId)
    if (p) p.price = Math.max(0.01, round2(price))
  })
}

export function setSupplier(state: GameState, businessId: string, productId: string, supplier: SupplierTier): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const p = b.products.find((x) => x.id === productId)
    if (p) p.supplier = supplier
  })
}

export function setRestockTarget(state: GameState, businessId: string, productId: string, target: number): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const p = b.products.find((x) => x.id === productId)
    if (p) p.restockTarget = Math.max(0, Math.round(target))
  })
}

export function setMarketing(state: GameState, businessId: string, daily: number): GameState {
  return withBusiness(state, businessId, (_, b) => {
    b.marketingDaily = Math.max(0, Math.round(daily))
  })
}

export function hire(state: GameState, businessId: string, candidateId: string): GameState {
  const c = state.candidates.find((x) => x.id === candidateId)
  const target = state.businesses.find((b) => b.id === businessId)
  if (!c || !target || c.sectorId !== target.sectorId) return state
  return withBusiness(state, businessId, (s, b) => {
    s.candidates = s.candidates.filter((x) => x.id !== candidateId)
    const e: Employee = { id: c.id, name: c.name, roleId: c.roleId, skill: c.skill, salary: c.salary, morale: 65, hiredDay: s.day }
    b.employees.push(e)
    log(s, `${e.name} rejoint ${b.name}.`)
  })
}

/** Indemnité de licenciement : un demi-mois de salaire. */
export function severance(e: Employee): number {
  return Math.round(e.salary / 2)
}

export function fire(state: GameState, businessId: string, employeeId: string): GameState {
  return withBusiness(state, businessId, (s, b) => {
    const e = b.employees.find((x) => x.id === employeeId)
    if (!e) return
    s.cash -= severance(e)
    b.employees = b.employees.filter((x) => x.id !== employeeId)
    for (const other of b.employees) other.morale = clamp(other.morale - 4, 0, 100)
    log(s, `${e.name} a été licencié(e) de ${b.name} (indemnité ${severance(e)} €).`)
  })
}

export function setSalary(state: GameState, businessId: string, employeeId: string, salary: number): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const e = b.employees.find((x) => x.id === employeeId)
    if (!e) return
    const raise = salary - e.salary
    // Une augmentation remonte le moral immédiatement, une baisse le fait chuter.
    e.morale = clamp(e.morale + (raise / e.salary) * (raise > 0 ? 60 : 150), 0, 100)
    e.salary = Math.max(0, Math.round(salary))
  })
}

export function sellBusiness(state: GameState, businessId: string): GameState {
  return withBusiness(state, businessId, (s, b) => {
    const value = Math.round(businessValue(b))
    s.cash += value
    s.businesses = s.businesses.filter((x) => x.id !== businessId)
    log(s, `${b.name} a été vendu pour ${value.toLocaleString('fr-FR')} €.`, 'good')
  })
}

export function borrow(state: GameState, amount: number): GameState {
  const allowed = Math.min(amount, maxLoan(state) - state.loan)
  if (allowed <= 0) return state
  return update(state, (s) => {
    s.loan += allowed
    s.cash += allowed
    log(s, `Prêt bancaire de ${Math.round(allowed).toLocaleString('fr-FR')} € accordé.`)
  })
}

export function repay(state: GameState, amount: number): GameState {
  const paid = Math.min(amount, state.loan, Math.max(0, state.cash))
  if (paid <= 0) return state
  return update(state, (s) => {
    s.loan -= paid
    s.cash -= paid
    log(s, `Remboursement de ${Math.round(paid).toLocaleString('fr-FR')} €.`)
  })
}

