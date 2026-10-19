import { advisorMessage, dailyMessages, welcomeMessage } from './messages'
import { employeeFromCandidate, employeesDay, fairSalary, level, migrateEmployee, refreshCandidates as refreshStaffCandidates, capacityMult, salesFactor, serviceQuality, TRIAL_DAYS } from './staff'
import { STARTING_SECTORS, checkObjectives, currentRank, isSectorUnlocked, setNetWorth } from './objectives'
import { generateCity, getParcel, isFree, parcelRent, parcelTraffic } from './city'
import { canDelegate, loanRateCut, marketingBoost, maxBusinesses, payHq, refreshOfficeCandidates, startingReputation } from './hq'
import { RANDOM_EVENTS, SECTORS, getSector } from './sectors'
import { addBatch, productDef, stockOf, takeStock } from './stock'
import { warehouseDay } from './warehouse'
import { SUPPLIERS_RANK, canNegotiate, closeDay, costOf, dailySupply, defaultSupplier, getSupplier, tryNegotiate, generateSuppliers, productQuality, receiveDeliveries, sectorSuppliers, unitCost } from './supply'
import type { Business, DayReport, Employee, GameState, ProductState } from './types'
import { clamp, log, newId, pick, rand, randRange, round2, update } from './util'

export { rand }
export { fairSalary, unitCost }

export const SAVE_VERSION = 8
export const START_CASH = 60000
const HISTORY_DAYS = 120
const BANKRUPTCY_DAYS = 30
/** Jour 1 = lundi 4 janvier 2027. */
const START_DATE = Date.UTC(2027, 0, 4)
const WEEKDAY_TRAFFIC = [0.9, 0.95, 1, 1, 1.1, 1.25, 0.8]

// ---------- Dates ----------

export function dateOf(day: number): Date {
  return new Date(START_DATE + (day - 1) * 86400000)
}

export function weekday(day: number): number {
  return (day - 1) % 7
}

// ---------- Calculs dérivés ----------

/** Prix que les clients jugent « juste » compte tenu de la qualité du fournisseur. */
export function perceivedPrice(s: GameState, sectorId: string, p: ProductState): number {
  return productDef(sectorId, p.id).refPrice * (0.75 + productQuality(s, p) / 240)
}

/** Ventes moyennes attendues par jour pour un produit au prix du marché. */
export function expectedDemand(traffic: number, sectorId: string, productId: string): number {
  return traffic * getSector(sectorId).trafficMult * productDef(sectorId, productId).baseShare
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
      cap += role.capacity * (0.7 + e.skills.service / 170) * (0.8 + e.morale / 250) * capacityMult(e)
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
  return b.products.reduce((sum, p) => sum + stockOf(p) * productDef(b.sectorId, p.id).unitCost, 0)
}

export function businessValue(b: Business): number {
  const recent = b.history.slice(-30)
  const monthlyProfit = recent.length ? (recent.reduce((s, r) => s + r.profit, 0) / recent.length) * 30 : 0
  return Math.max(0, getSector(b.sectorId).setupCost * 0.5 + stockValue(b) * 0.6 + Math.max(0, monthlyProfit) * 8)
}

export function netWorth(s: GameState): number {
  return s.cash - s.loan + s.businesses.reduce((sum, b) => sum + businessValue(b), 0)
}

setNetWorth(netWorth)

/** Valide les objectifs et fait annoncer les nouveaux rangs par la conseillère. */
function progress(s: GameState) {
  for (const lines of checkObjectives(s)) advisorMessage(s, lines)
}

/** Taux d'emprunt après l'effet des contrôleurs de gestion du siège. */
export function effectiveLoanRate(s: GameState): number {
  return Math.max(0.01, s.loanRate - loanRateCut(s))
}

export function maxLoan(s: GameState): number {
  return Math.round(40000 + s.businesses.reduce((sum, b) => sum + businessValue(b) * 0.6, 0))
}

/** Aménagement + deux mois de loyer en caution. */
export function openingCost(state: GameState, sectorId: string, parcelId: string): number {
  return getSector(sectorId).setupCost + parcelRent(getParcel(state.city, parcelId)) * 2
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
    hq: null,
    officeCandidates: [],
    warehouses: [],
    suppliers: [],
    orders: [],
    orderHistory: [],
    businesses: [],
    candidates: [],
    interviews: { day: 0, count: 0 },
    log: [],
    inbox: [],
    flags: {},
    stats: { totalProfit: 0, totalRevenue: 0 },
    objectivesDone: [],
    unlockedSectors: [...STARTING_SECTORS],
    celebrations: [],
    nextId: 1,
  }
  s.city = generateCity(() => rand(s))
  generateSuppliers(s)
  refreshCandidates(s)
  welcomeMessage(s)
  log(s, `Bienvenue ! Vous démarrez avec ${START_CASH.toLocaleString('fr-FR')} €. Ouvrez votre première entreprise.`, 'good')
  return s
}

function refreshCandidates(s: GameState) {
  refreshStaffCandidates(s)
  refreshOfficeCandidates(s)
}

// ---------- Simulation d'une journée ----------

function simulateBusiness(s: GameState, b: Business): DayReport {
  const sector = getSector(b.sectorId)
  const parcel = getParcel(s.city, b.parcelId)
  const purchases = receiveDeliveries(s, b)

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
      (1 + marketingBoost(s)) *
      reputationFactor *
      randRange(s, 0.9, 1.1),
  )

  // Demande par produit selon le prix, la qualité perçue et le talent de vendeur de l'équipe.
  const upsell = salesFactor(b.employees.filter((e) => sector.roles.find((r) => r.id === e.roleId)!.capacity > 0))
  const demands = b.products.map((p) => {
    const def = sector.products.find((x) => x.id === p.id)!
    const ref = perceivedPrice(s, b.sectorId, p)
    const priceFactor = Math.min(2.5, (ref / Math.max(0.01, p.price)) ** sector.priceElasticity)
    return visitors * def.baseShare * priceFactor * upsell
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
  const soldByProduct: Record<string, number> = {}
  b.products.forEach((p, i) => {
    const want = demands[i] * servedRatio
    const sold = takeStock(p, Math.floor(want + rand(s)))
    soldByProduct[p.id] = sold
    unitsSold += sold
    lostToStockout += Math.max(0, want - sold)
    revenue += sold * p.price
    grossMargin += sold * (p.price - costOf(s, b.sectorId, p))
    qualitySum += productQuality(s, p) * demands[i]
    priceRatioSum += (p.price / perceivedPrice(s, b.sectorId, p)) * demands[i]
  })
  const lostToCapacity = totalDemand * (1 - servedRatio)

  // Réputation : tend vers une cible selon l'expérience client du jour.
  if (totalDemand > 0) {
    const avgQuality = qualitySum / totalDemand
    const avgPriceRatio = priceRatioSum / totalDemand
    const quality = serviceQuality(b.employees)
    const target =
      50 +
      (avgQuality - 60) * 0.8 -
      (avgPriceRatio - 1) * 40 -
      (lostToCapacity / totalDemand) * 50 -
      (lostToStockout / totalDemand) * 50 +
      (quality - 50) * 0.25
    b.reputation = clamp(b.reputation + (clamp(target, 0, 100) - b.reputation) * 0.04, 0, 100)
  }

  s.cash += revenue

  // Fin de journée : produits périmés jetés, commandes automatiques.
  const { wasteValue, wasteByProduct } = closeDay(s, b, soldByProduct)

  const wages = monthlyWages(b) / 30
  const rent = (parcelRent(parcel) * b.rentMult) / 30
  const marketing = b.marketingDaily
  s.cash -= wages + rent + marketing

  // Évolution des employés.
  const load = capacity > 0 ? totalDemand / capacity : 0
  const quits = employeesDay(s, b, load)
  for (const e of quits) autoReplace(s, b, e)

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
    profit: round2(grossMargin - wasteValue - wages - rent - marketing),
    reputation: round2(b.reputation),
    waste: wasteValue,
    wasteByProduct,
    soldByProduct,
  }
  s.stats.totalProfit += report.profit
  s.stats.totalRevenue += report.revenue
  b.history.push(report)
  if (b.history.length > HISTORY_DAYS) b.history.splice(0, b.history.length - HISTORY_DAYS)
  return report
}

/** Délégation : le recruteur du siège remplace un employé parti par le meilleur candidat au prix du marché. */
function autoReplace(s: GameState, b: Business, gone: Employee) {
  if (!s.hq?.policies.autoReplace || !canDelegate(s, 'recruteur')) return
  const role = getSector(b.sectorId).roles.find((r) => r.id === gone.roleId)!
  const c = s.candidates
    .filter((x) => x.sectorId === b.sectorId && x.roleId === gone.roleId && x.salary <= fairSalary(role.baseSalary, level(x.skills)) * 1.05)
    .sort((x, y) => level(y.skills) - level(x.skills))[0]
  if (!c) return
  s.candidates = s.candidates.filter((x) => x.id !== c.id)
  b.employees.push(employeeFromCandidate(s, c))
  log(s, `Le siège a recruté ${c.name} pour remplacer ${gone.name} chez ${b.name}.`)
}

/** Délégation des achats : négociation mensuelle et ajustement hebdomadaire des stocks cibles. */
function delegatePurchasing(s: GameState) {
  if (!s.hq || !canDelegate(s, 'acheteur')) return
  if (s.hq.policies.autoNegotiate && s.day % 30 === 0) {
    const used = new Set(s.businesses.flatMap((b) => b.products.map((p) => p.supplierId)))
    for (const id of used) {
      const x = getSupplier(s, id)
      if (canNegotiate(s, x) && tryNegotiate(s, x)) log(s, `Votre acheteur a obtenu −${Math.round(x.negotiated * 100)} % chez ${x.name}.`, 'good')
    }
  }
  if (s.hq.policies.autoStock && weekday(s.day) === 0) {
    for (const b of s.businesses) {
      if (b.history.length < 7) continue
      for (const p of b.products) {
        const def = productDef(b.sectorId, p.id)
        if (!p.auto || def.shelfLife !== undefined) continue
        const avg = b.history.slice(-7).reduce((a, r) => a + (r.soldByProduct?.[p.id] ?? 0), 0) / 7
        if (avg > 0) p.restockTarget = Math.max(1, Math.ceil(avg * (getSupplier(s, p.supplierId).leadDays + 2)))
      }
    }
  }
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
    for (const w of s.warehouses) warehouseDay(s, w)

    payHq(s)
    delegatePurchasing(s)
    if (s.loan > 0) s.cash -= (s.loan * effectiveLoanRate(s)) / 365
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
    dailySupply(s)
    dailyMessages(s)
    progress(s)
  })
}

// ---------- Actions du joueur ----------

export function openBusiness(state: GameState, sectorId: string, parcelId: string, name: string): GameState {
  const parcel = state.city.parcels.find((p) => p.id === parcelId)
  if (!parcel || !isFree(state, parcel) || !isSectorUnlocked(state, sectorId) || state.businesses.length >= maxBusinesses(state)) return state
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
      reputation: startingReputation(s),
      rentMult: 1,
      history: [],
      products: sector.products.map((p) => ({
        id: p.id,
        price: p.refPrice,
        batches: [],
        supplierId: defaultSupplier(s, sectorId).id,
        restockTarget: defaultTarget(traffic, sectorId, p.id),
        auto: true,
      })),
    }
    // Stock de départ, livré à l'ouverture.
    for (const p of b.products) {
      const c = p.restockTarget * unitCost(s, sectorId, p)
      if (s.cash >= c) {
        s.cash -= c
        p.avgCost = unitCost(s, sectorId, p)
        addBatch(sectorId, p, p.restockTarget, s.day)
      }
    }
    s.businesses.push(b)
    log(s, `${b.name} (${sector.name}) ouvre ses portes au ${parcel.address} ! Pensez à recruter du personnel.`, 'good')
    progress(s)
  })
}

/** Stock cible conseillé : un jour de ventes pour les produits frais, trois jours sinon. */
export function defaultTarget(traffic: number, sectorId: string, productId: string): number {
  const life = productDef(sectorId, productId).shelfLife
  return Math.max(1, Math.ceil(expectedDemand(traffic, sectorId, productId) * (life !== undefined && life <= 2 ? 1.05 : 3)))
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
    const e = employeeFromCandidate(s, c)
    b.employees.push(e)
    log(s, `${e.name} rejoint ${b.name}.`)
    progress(s)
  })
}

export const inTrial = (s: GameState, e: Employee) => s.day <= e.trialUntil

/** Indemnité de licenciement : un demi-mois de salaire, rien pendant la période d'essai. */
export function severance(e: Employee, s?: GameState): number {
  return s && inTrial(s, e) ? 0 : Math.round(e.salary / 2)
}

export function fire(state: GameState, businessId: string, employeeId: string): GameState {
  return withBusiness(state, businessId, (s, b) => {
    const e = b.employees.find((x) => x.id === employeeId)
    if (!e) return
    const trial = inTrial(s, e)
    s.cash -= severance(e, s)
    b.employees = b.employees.filter((x) => x.id !== employeeId)
    // Une fin de période d'essai ne choque pas l'équipe ; un licenciement, si.
    if (!trial) for (const other of b.employees) other.morale = clamp(other.morale - 4, 0, 100)
    log(s, trial ? `Fin de la période d'essai de ${e.name} chez ${b.name}.` : `${e.name} a été licencié(e) de ${b.name} (indemnité ${severance(e)} €).`)
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


/** Convertit une sauvegarde d'une version précédente au lieu de faire perdre la partie. */
export function migrate(raw: GameState): GameState | null {
  const s = raw as GameState & { version: number }
  if (s.version === 2) {
    s.inbox = []
    s.flags = { welcome: true }
    for (const b of s.businesses) b.rentMult = 1
    s.version = 3
  }
  if (s.version === 3) {
    s.stats = { totalProfit: 0, totalRevenue: 0 }
    for (const b of s.businesses)
      for (const r of b.history) {
        s.stats.totalProfit += r.profit
        s.stats.totalRevenue += r.revenue
      }
    s.unlockedSectors = [...new Set([...STARTING_SECTORS, ...s.businesses.map((b) => b.sectorId)])]
    s.objectivesDone = []
    s.celebrations = []
    // Partie déjà lancée : pas besoin du tutoriel.
    if (s.businesses.length) s.flags.tuto_done = true
    // Les objectifs déjà remplis sont validés d'office, sans avalanche de célébrations.
    progress(s)
    s.celebrations = []
    advisorMessage(s, [
      'Nouveau : l\'appli Objectifs est arrivée sur votre téléphone !',
      'Chaque rang atteint rapporte une prime et débloque de nouveaux secteurs. J\'ai déjà validé ce que vous avez accompli.',
    ])
    s.version = 4
  }
  if (s.version === 4) {
    // Arrivée des fournisseurs : le stock existant devient un lot, l'ancien niveau de gamme un fournisseur.
    generateSuppliers(s)
    s.orders = []
    s.orderHistory = []
    const tierOf: Record<string, string> = { eco: 'eco', standard: 'default', premium: 'premium' }
    for (const b of s.businesses) {
      for (const p of b.products as (ProductState & { stock?: number; supplier?: string })[]) {
        const tier = tierOf[p.supplier ?? 'standard'] ?? 'default'
        p.supplierId = (sectorSuppliers(s, b.sectorId).find((x) => x.tier === tier) ?? defaultSupplier(s, b.sectorId)).id
        p.batches = []
        p.auto = p.restockTarget > 0
        addBatch(b.sectorId, p, p.stock ?? 0, s.day)
        delete p.stock
        delete p.supplier
      }
    }
    advisorMessage(s, [
      "Nouveau : les fournisseurs ! Vos commandes sont maintenant livrées avec un délai, et les produits frais périment s'ils ne sont pas vendus à temps.",
      currentRank(s) >= SUPPLIERS_RANK
        ? "Votre rang vous donne déjà accès à l'appli Fournisseurs : comparez qualité, prix, délais et fiabilité, négociez, et passez vos propres commandes."
        : "L'appli Fournisseurs se débloque au rang 2. En attendant, le Grossiste du Coin vous livre chaque matin.",
    ])
    s.version = 5
  }
  if (s.version === 5) {
    s.hq = null
    refreshOfficeCandidates(s)
    if (s.businesses.length >= 3)
      advisorMessage(s, [
        'Nouveau : le siège social ! Sans siège, un groupe peut gérer 3 commerces au maximum.',
        'Dès le rang 3, installez votre siège sur un local libre de la carte : il augmente cette limite et accueille des employés de bureau qui profitent à tous vos commerces.',
      ])
    s.version = 6
  }
  if (s.version === 6) {
    s.warehouses = []
    s.version = 7
  }
  if (s.version === 7) {
    for (const b of s.businesses) for (const e of b.employees) migrateEmployee(s, e)
    s.candidates = []
    s.interviews = { day: 0, count: 0 }
    refreshCandidates(s)
    advisorMessage(s, [
      'Nouveau : vos employés ont désormais trois compétences (service, vente, qualité) et un caractère !',
      `Pour recruter, passez une annonce ou faites appel à un cabinet, et menez des entretiens pour découvrir le caractère des candidats. Chaque embauche commence par ${TRIAL_DAYS} jours d'essai.`,
    ])
    s.version = 8
  }
  return s.version === SAVE_VERSION ? s : null
}

export function dismissCelebration(state: GameState): GameState {
  if (!state.celebrations.length) return state
  return update(state, (s) => {
    s.celebrations.shift()
  })
}

export function setFlag(state: GameState, flag: string): GameState {
  if (state.flags[flag]) return state
  return update(state, (s) => {
    s.flags[flag] = true
  })
}
