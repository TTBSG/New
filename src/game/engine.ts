import { advisorMessage, dailyMessages, welcomeMessage } from './messages'
import { SLOTS, UTILITIES_RATE, payOf, placeNewcomer, planTeam, slotCapacity, slotShares } from './schedule'
import { attraction, competitionFactor, getBrand, rivalName, rivalPrice, rivalsDay, seedRivals, victimsOf } from './rivals'
import { autoReplace } from './replace'
import { benefitsPerEmployee, makeCandidate } from './staff'
import { employeeFromCandidate, employeesDay, fairSalary, migrateEmployee, refreshCandidates as refreshStaffCandidates, salesFactor, serviceQuality, TRIAL_DAYS } from './staff'
import { STARTING_SECTORS, checkObjectives, currentRank, isSectorUnlocked, sectorUnlockRank, setNetWorth } from './objectives'
import { buildCity, districtUnlocked, generateCity, getParcel, isFree, locationFit, parcelRent, parcelTraffic } from './city'
import { canDelegate, loanRateCut, marketingBoost, maxBusinesses, payHq, refreshOfficeCandidates, startingReputation } from './hq'
import { LOCAL_EVENTS, RANDOM_EVENTS, SECTORS, getDistrict, getSector } from './sectors'
import { WEATHER_NAMES, nextWeather, weatherMult } from './weather'
import { addBatch, productDef, stockOf, takeStock } from './stock'
import { warehouseDay } from './warehouse'
import { SUPPLIERS_RANK, canNegotiate, closeDay, costOf, dailySupply, defaultSupplier, getSupplier, tryNegotiate, generateSuppliers, productQuality, receiveDeliveries, sectorSuppliers, unitCost } from './supply'
import type { Business, DayReport, Employee, GameState, Parcel, ProductState } from './types'
import { clamp, log, newId, pick, rand, randRange, round2, update } from './util'

export { rand }
export { fairSalary, unitCost }

export const SAVE_VERSION = 13
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

/** Clients servables sur la journée (somme des créneaux ouverts). */
/** Attrait du commerce face à ses concurrents : réputation et prix ressentis par les clients. */
export function businessAttraction(s: GameState, b: Business): number {
  const sector = getSector(b.sectorId)
  let ratio = 0
  let shares = 0
  for (const p of b.products) {
    const share = sector.products.find((x) => x.id === p.id)!.baseShare
    ratio += (p.price / perceivedPrice(s, b.sectorId, p)) * share
    shares += share
  }
  return attraction(b.reputation, shares > 0 ? ratio / shares : 1)
}

export function serviceCapacity(b: Business): number {
  return slotCapacity(b).reduce((a, x) => a + x, 0)
}

export function monthlyWages(b: Business): number {
  return b.employees.reduce((sum, e) => sum + payOf(e), 0)
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
    weather: 'nuages',
    city: { width: 0, height: 0, roadsI: [], roadsJ: [], parcels: [] },
    hq: null,
    officeCandidates: [],
    warehouses: [],
    suppliers: [],
    orders: [],
    orderHistory: [],
    businesses: [],
    rivals: [],
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
  seedRivals(s)
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

/** Événements qui touchent un commerce : ceux de son secteur (ou généraux) et ceux de son quartier. */
export function eventsFor(s: GameState, b: Business) {
  const districtId = getParcel(s.city, b.parcelId).districtId
  return s.events.filter((e) => (e.sectorId === null || e.sectorId === b.sectorId) && (!e.districtId || e.districtId === districtId))
}

function simulateBusiness(s: GameState, b: Business): DayReport {
  const sector = getSector(b.sectorId)
  const parcel = getParcel(s.city, b.parcelId)
  const purchases = receiveDeliveries(s, b)

  const eventMult = eventsFor(s, b).reduce((m, e) => m * e.demandMult, 1) * weatherMult(s.weather, b.sectorId)
  const marketingFactor = 1 + 0.5 * Math.log10(1 + b.marketingDaily / 10)
  const reputationFactor = 0.6 + b.reputation / 125
  // Les concurrents du même secteur installés à proximité détournent une partie des passants.
  const competition = competitionFactor(s, b, businessAttraction(s, b))
  const visitors = Math.round(
    competition *
      parcelTraffic(parcel) *
      // Clientèle du quartier et lieux remarquables voisins (gare, lycée…).
      locationFit(s.city, parcel, b.sectorId) *
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

  // Demande par produit selon le prix, la qualité perçue, le talent de vendeur de l'équipe et les horaires.
  const shares = slotShares(b)
  const openShare = shares.reduce((a, x) => a + x, 0)
  const upsell = salesFactor(b.employees.filter((e) => sector.roles.find((r) => r.id === e.roleId)!.capacity > 0))
  const demands = b.products.map((p) => {
    const def = sector.products.find((x) => x.id === p.id)!
    const ref = perceivedPrice(s, b.sectorId, p)
    const priceFactor = Math.min(2.5, (ref / Math.max(0.01, p.price)) ** sector.priceElasticity)
    return visitors * def.baseShare * priceFactor * upsell * openShare
  })
  const totalDemand = demands.reduce((a, x) => a + x, 0)
  // Service créneau par créneau : un rush du midi mal staffé perd des clients même si le matin est calme.
  const slotCap = slotCapacity(b)
  const slotDemand = SLOTS.map((slot) => (openShare > 0 ? (totalDemand * shares[slot]) / openShare : 0))
  const served = SLOTS.reduce<number>((a, slot) => a + Math.min(slotDemand[slot], slotCap[slot]), 0)
  const servedRatio = totalDemand > 0 ? served / totalDemand : 0
  // Un créneau ouvert sans personne ressemble à une porte fermée : ventes perdues, mais pas de file d'attente qui agace.
  const frustrated = SLOTS.reduce<number>((a, slot) => a + (slotCap[slot] > 0 ? Math.max(0, slotDemand[slot] - slotCap[slot]) : 0), 0)

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
      (frustrated / totalDemand) * 50 -
      (lostToStockout / totalDemand) * 50 +
      (quality - 50) * 0.25
    b.reputation = clamp(b.reputation + (clamp(target, 0, 100) - b.reputation) * 0.04, 0, 100)
  }

  s.cash += revenue

  // Fin de journée : produits périmés jetés, commandes automatiques.
  const { wasteValue, wasteByProduct } = closeDay(s, b, soldByProduct)

  // Salaires et avantages sociaux (mutuelle, tickets resto, prime) gérés par la RH.
  const wages = (monthlyWages(b) + b.employees.length * benefitsPerEmployee(s)) / 30
  const rent = (parcelRent(parcel) * b.rentMult) / 30
  const marketing = b.marketingDaily
  const utilities = round2(b.hours.filter(Boolean).length * sector.setupCost * UTILITIES_RATE)
  s.cash -= wages + rent + marketing + utilities

  // Évolution des employés : la charge ressentie dépend des créneaux de chacun.
  const slotLoad = SLOTS.map((slot) => (slotCap[slot] > 0 ? slotDemand[slot] / slotCap[slot] : 0))
  const quits = employeesDay(s, b, (e) => (e.shifts.length ? e.shifts.reduce<number>((a, slot) => a + slotLoad[slot], 0) / e.shifts.length : 0))
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
    profit: round2(grossMargin - wasteValue - wages - rent - marketing - utilities),
    reputation: round2(b.reputation),
    waste: wasteValue,
    wasteByProduct,
    soldByProduct,
    slotDemand: slotDemand.map(Math.round),
    slotCapacity: slotCap.map(Math.round),
    utilities,
    competition: round2(competition),
  }
  s.stats.totalProfit += report.profit
  s.stats.totalRevenue += report.revenue
  b.history.push(report)
  if (b.history.length > HISTORY_DAYS) b.history.splice(0, b.history.length - HISTORY_DAYS)
  return report
}

/** Délégation : le recruteur du siège remplace un employé parti par le meilleur candidat au prix du marché. */
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

  const weather = nextWeather(s, dateOf(s.day).getUTCMonth())
  if (weather !== s.weather && (weather === 'pluie' || weather === 'neige')) log(s, `Météo : ${WEATHER_NAMES[weather].toLowerCase()} sur la ville, moins de monde dans les rues.`)
  s.weather = weather

  // Événements de quartier : un seul à la fois par quartier.
  if (rand(s) < 1 / 9) {
    const tpl = pick(s, LOCAL_EVENTS)
    const districtId = pick(s, tpl.districts)
    if (districtUnlocked(s, districtId) && !s.events.some((e) => e.districtId === districtId)) {
      const mult = round2(randRange(s, tpl.mult[0], tpl.mult[1]))
      const duration = Math.round(randRange(s, tpl.days[0], tpl.days[1]))
      s.events.push({ id: newId(s, 'e'), title: tpl.title, description: tpl.description, sectorId: null, districtId, demandMult: mult, endsDay: s.day + duration - 1 })
      const mine = s.businesses.some((b) => getParcel(s.city, b.parcelId).districtId === districtId)
      log(s, `${tpl.title} (${getDistrict(districtId).name}) : ${tpl.description} ${mult > 1 ? '+' : ''}${Math.round((mult - 1) * 100)} % de passants pendant ${duration} j.`, !mine ? 'info' : mult > 1 ? 'good' : 'bad')
    }
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

/** Ouvertures et fermetures chez les concurrents, avec les annonces qui vont avec. */
function rivalsMove(s: GameState) {
  const { closed, opened } = rivalsDay(s, (b) => businessAttraction(s, b))
  for (const r of closed) {
    const beaten = victimsOf(s, r).length > 0
    log(s, `${rivalName(r)} ferme ses portes${beaten ? ' : vous avez gagné la bataille du quartier !' : '.'}`, beaten ? 'good' : 'info')
    if (beaten) s.celebrations.push({ id: `rival${r.id}`, title: `${getBrand(r.brandId).name} jette l'éponge`, prime: 0, rankUp: null, label: 'Concurrence' })
  }
  if (opened) {
    const parcel = getParcel(s.city, opened.parcelId)
    const victims = victimsOf(s, opened)
    log(s, `${rivalName(opened)} ouvre au ${parcel.address}${victims.length ? `, tout près de ${victims[0].name}` : ''}.`, victims.length ? 'bad' : 'info')
    if (victims.length && !s.flags.rival_hint) {
      s.flags.rival_hint = true
      advisorMessage(s, [
        `Attention, ${getBrand(opened.brandId).name} vient d'ouvrir près de ${victims[0].name} : vous allez vous partager les passants du quartier.`,
        "Pour garder vos clients, soignez votre réputation et surveillez vos prix. Touchez sa boutique sur la carte pour l'étudier… ou la racheter. L'appli Marché montre vos parts de marché.",
      ])
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
    rivalsMove(s)

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
    s.cash -= cost
    const b = createBusiness(s, sectorId, parcel, name, startingReputation(s))
    log(s, `${b.name} (${getSector(sectorId).name}) ouvre ses portes au ${parcel.address} ! Pensez à recruter du personnel.`, 'good')
    progress(s)
  })
}

/** Crée le commerce sur la parcelle et achète son stock de départ. */
function createBusiness(s: GameState, sectorId: string, parcel: Parcel, name: string, reputation: number): Business {
  const sector = getSector(sectorId)
  const traffic = parcelTraffic(parcel) * locationFit(s.city, parcel, sectorId)
  const b: Business = {
    id: newId(s, 'b'),
    name: name.trim() || `${sector.name} ${parcel.address}`,
    sectorId,
    parcelId: parcel.id,
    openedDay: s.day,
    employees: [],
    marketingDaily: 0,
    reputation,
    rentMult: 1,
    hours: [true, true, true],
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
  return b
}

/** Pourquoi le rachat d'un concurrent est impossible (null = possible). */
export function buyRivalBlock(s: GameState, rivalId: string): string | null {
  const r = s.rivals.find((x) => x.id === rivalId)
  if (!r) return 'Cette boutique a fermé'
  if (!isSectorUnlocked(s, r.sectorId)) return `Secteur pas encore débloqué (rang ${sectorUnlockRank(r.sectorId) + 1})`
  if (s.businesses.length >= maxBusinesses(s)) return 'Nombre maximum de commerces atteint'
  if (s.cash < rivalPrice(r)) return 'Trésorerie insuffisante'
  return null
}

/** Rachat d'une boutique concurrente : elle devient la vôtre, avec sa réputation et deux employés en place. */
export function buyRival(state: GameState, rivalId: string): GameState {
  if (buyRivalBlock(state, rivalId)) return state
  return update(state, (s) => {
    const r = s.rivals.find((x) => x.id === rivalId)!
    const parcel = getParcel(s.city, r.parcelId)
    const brand = getBrand(r.brandId)
    s.cash -= rivalPrice(r)
    s.rivals = s.rivals.filter((x) => x.id !== rivalId)
    const b = createBusiness(s, r.sectorId, parcel, `${getSector(r.sectorId).name} ${parcel.address}`, r.reputation)
    const role = getSector(r.sectorId).roles.find((x) => x.capacity > 0)!
    for (let i = 0; i < 2; i++) {
      const e = employeeFromCandidate(s, makeCandidate(s, r.sectorId, role.id, 'spontane'))
      e.trialUntil = 0
      placeNewcomer(b, e)
      b.employees.push(e)
    }
    log(s, `Vous rachetez la boutique ${brand.name} du ${parcel.address} : elle devient ${b.name}, avec son équipe.`, 'good')
    s.celebrations.push({ id: `buy${r.id}`, title: `${brand.name} racheté !`, prime: 0, rankUp: null, label: 'Concurrence' })
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
    placeNewcomer(b, e)
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
  if (s.version === 8) {
    for (const b of s.businesses) {
      b.hours = [true, true, true]
      for (const e of b.employees) e.shifts = [0, 1]
      planTeam(b)
    }
    if (s.businesses.some((b) => b.employees.length))
      advisorMessage(s, [
        'Nouveau : les horaires et le planning ! La journée se découpe en trois créneaux (matin, midi, soir) et chaque secteur a ses heures de pointe.',
        "Dans l'onglet Équipe de chaque commerce, choisissez vos créneaux d'ouverture et qui travaille quand : temps partiel (1 créneau, demi-salaire), temps plein (2) ou heures sup (3, mieux payées mais fatigantes). J'ai réparti vos équipes en temps plein.",
      ])
    s.version = 9
  }
  if (s.version === 9) {
    for (const b of s.businesses) for (const e of b.employees) e.fatigue = 0
    if (s.hq) Object.assign(s.hq.policies, { mutuelle: false, tickets: false, prime: false })
    if (s.businesses.some((b) => b.employees.length))
      advisorMessage(s, [
        'Nouveau : vos employés évoluent ! Formez-les (2 jours d\'absence, +10 dans une compétence) et promouvez les meilleurs chef d\'équipe ou manager.',
        'Surveillez aussi leur fatigue : les heures sup et les rushs les épuisent, et un employé épuisé finit en arrêt maladie. Avec un responsable RH au siège, vous pourrez offrir mutuelle, tickets restaurant et primes.',
      ])
    s.version = 10
  }
  if (s.version === 10) {
    s.rivals = []
    seedRivals(s)
    advisorMessage(s, [
      'Nouveau : vous n\'êtes plus seul en ville ! Des enseignes concurrentes ouvrent des boutiques, se partagent les passants avec les vôtres et cassent leurs prix si vous leur prenez des clients.',
      'Touchez une boutique concurrente sur la carte pour l\'étudier ou la racheter, et suivez vos parts de marché dans la nouvelle appli Marché.',
    ])
    s.version = 11
  }
  if (s.version === 11) {
    s.weather = 'nuages'
    s.version = 12
  }
  if (s.version === 12) {
    // La ville s'agrandit : nouvelles colonnes à l'est, et un lieu remarquable par quartier.
    const taken = [...s.businesses.map((b) => b.parcelId), ...s.rivals.map((r) => r.parcelId), ...s.warehouses.map((w) => w.parcelId), ...(s.hq ? [s.hq.parcelId] : [])]
    s.city = buildCity(() => rand(s), s.city.parcels, taken)
    advisorMessage(s, [
      'La ville s\'agrandit ! Deux nouveaux quartiers apparaissent à l\'est : le Campus (rang 3) et le Port (rang 4).',
      'Chaque quartier a désormais sa clientèle, et des lieux comme la gare, le lycée ou le stade attirent du monde autour d\'eux. Touchez un local à louer : la fiche indique les atouts de l\'emplacement pour chaque type de commerce.',
    ])
    s.version = 13
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
