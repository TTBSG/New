import { getParcel, isFree, parcelRent } from './city'
import { canDelegate } from './hq'
import { currentRank } from './objectives'
import { getSector } from './sectors'
import { expireStock, productDef, putBatches, stockOf, takeBatches, updateAvgCost } from './stock'
import { archive, autoTarget, costOf, createOrder, defaultSupplier, getSupplier, incoming, receiveInto, sectorSuppliers } from './supply'
import type { Business, GameState, ProductState, Warehouse } from './types'
import { log, newId, round2, update } from './util'

/** Rang nécessaire pour ouvrir un entrepôt (avec un directeur logistique au siège). */
export const WAREHOUSE_RANK = 4
/** Les entrepôts s'installent dans la zone commerciale, là où se trouve l'activité logistique. */
export const WAREHOUSE_DISTRICT = 'commercial'

export const WAREHOUSE_LEVELS = [
  { name: 'Petit entrepôt', cost: 30000, rentMult: 0.7, capacity: 20000, height: 22 },
  { name: 'Entrepôt', cost: 60000, rentMult: 1.4, capacity: 60000, height: 28 },
  { name: 'Plateforme logistique', cost: 120000, rentMult: 2.5, capacity: 200000, height: 34 },
]
export const COLD_ROOM = { cost: 15000, monthly: 400, extraLife: 2 }
export const HANDLER = { salary: 1800, unitsPerNight: 4000 }
export const TRUCK = { salary: 2100, lease: 300, shopsPerNight: 5, fuelPerStop: 8 }
/** Tarif grossiste : livrer un camion complet à un entrepôt coûte moins cher au fournisseur. */
export const WAREHOUSE_PRICE_CUT = 0.1
const HISTORY_DAYS = 30

export const warehouseLevel = (w: Warehouse) => WAREHOUSE_LEVELS[w.level - 1]
export const warehouseOf = (s: GameState, sectorId: string) => s.warehouses.find((w) => w.sectorId === sectorId)

export function warehousesUnlocked(s: GameState): boolean {
  return currentRank(s) >= WAREHOUSE_RANK && canDelegate(s, 'logisticien')
}

export const isPerishable = (sectorId: string, productId: string) => productDef(sectorId, productId).shelfLife !== undefined
/** Un produit frais ne peut transiter par l'entrepôt qu'avec une chambre froide. */
export const canStore = (w: Warehouse, productId: string) => w.cold || !isPerishable(w.sectorId, productId)

export const warehouseStock = (w: Warehouse) => w.products.reduce((n, p) => n + stockOf(p), 0)

export function warehouseRent(s: GameState, w: Warehouse): number {
  return parcelRent(getParcel(s.city, w.parcelId)) * warehouseLevel(w).rentMult
}

/** Coût mensuel fixe : loyer, salaires, location des camions, énergie de la chambre froide. */
export function warehouseMonthlyCost(s: GameState, w: Warehouse): number {
  return warehouseRent(s, w) + w.handlers * HANDLER.salary + w.trucks * (TRUCK.salary + TRUCK.lease) + (w.cold ? COLD_ROOM.monthly : 0)
}

/** Commerces du secteur rattachés à l'entrepôt (au moins un produit approvisionné par lui). */
export const servedShops = (s: GameState, w: Warehouse) => s.businesses.filter((b) => b.sectorId === w.sectorId && b.products.some((p) => p.fromWarehouse))

// ---------- Journée de l'entrepôt ----------

/** Réception, péremption, livraison des boutiques puis commandes aux fournisseurs. */
export function warehouseDay(s: GameState, w: Warehouse) {
  const extraLife = w.cold ? COLD_ROOM.extraLife : 0
  const received = receiveInto(s, w.id, `Entrepôt ${getSector(w.sectorId).name.toLowerCase()}`, w.sectorId, w.products, extraLife)

  let waste = 0
  for (const p of w.products) {
    const n = expireStock(p, s.day)
    if (n) waste += n * costOf(s, w.sectorId, p)
  }

  // Tournées de nuit : les boutiques qui en ont le plus besoin passent en premier.
  let unitsLeft = w.handlers * HANDLER.unitsPerNight
  let stopsLeft = w.trucks * TRUCK.shopsPerNight
  let shipped = 0
  let stops = 0
  let unserved = 0
  const needs = servedShops(s, w)
    .map((b) => ({ b, lines: shopNeeds(s, w, b) }))
    .filter((x) => x.lines.length)
    .sort((x, y) => y.lines.reduce((a, l) => a + l.qty, 0) - x.lines.reduce((a, l) => a + l.qty, 0))
  for (const { lines } of needs) {
    if (stopsLeft <= 0 || unitsLeft <= 0) {
      unserved++
      continue
    }
    let delivered = 0
    for (const { p, wp, qty } of lines) {
      const n = Math.min(qty, unitsLeft)
      if (n <= 0) break
      const batches = takeBatches(wp, n)
      const moved = batches.reduce((a, x) => a + x.qty, 0)
      updateAvgCost(p, moved, costOf(s, w.sectorId, wp))
      putBatches(p, batches)
      // Le coût et la qualité suivent le fournisseur de l'entrepôt.
      p.supplierId = wp.supplierId
      unitsLeft -= moved
      delivered += moved
    }
    if (delivered) {
      stopsLeft--
      stops++
      shipped += delivered
    }
  }
  if (unserved) log(s, `Entrepôt ${getSector(w.sectorId).name.toLowerCase()} : ${unserved} boutique${unserved > 1 ? 's' : ''} non livrée${unserved > 1 ? 's' : ''} cette nuit (camions ou magasiniers insuffisants).`, 'bad')

  // Réassort de l'entrepôt : on recommande sous la moitié de la cible, en regroupant par fournisseur.
  const position = (p: ProductState) => stockOf(p) + incoming(s, w.id, p.id)
  const orderable = (p: ProductState) => p.auto && p.restockTarget > 0 && canStore(w, p.id)
  const triggered = new Set(w.products.filter((p) => orderable(p) && position(p) < p.restockTarget * 0.5).map((p) => p.supplierId))
  for (const supplierId of triggered) {
    const lines = w.products.filter((p) => orderable(p) && p.supplierId === supplierId).map((p) => ({ productId: p.id, qty: Math.max(0, Math.ceil(p.restockTarget - position(p))) }))
    if (!createOrder(s, w, getSupplier(s, supplierId), lines, true, WAREHOUSE_PRICE_CUT)) log(s, `Entrepôt : commande chez ${getSupplier(s, supplierId).name} impossible, trésorerie insuffisante.`, 'bad')
  }

  const cost = warehouseMonthlyCost(s, w) / 30 + stops * TRUCK.fuelPerStop
  s.cash -= cost
  w.history.push({ day: s.day, received: round2(received), shipped, waste: round2(waste), cost: round2(cost), unserved })
  if (w.history.length > HISTORY_DAYS) w.history.splice(0, w.history.length - HISTORY_DAYS)
}

/** Ce qu'il faut livrer cette nuit à une boutique pour atteindre ses stocks cibles. */
function shopNeeds(s: GameState, w: Warehouse, b: Business) {
  const out: { p: ProductState; wp: ProductState; qty: number }[] = []
  for (const p of b.products) {
    if (!p.fromWarehouse || !p.auto) continue
    const wp = w.products.find((x) => x.id === p.id)
    if (!wp || !canStore(w, p.id)) continue
    const need = Math.ceil(autoTarget(b, p) - stockOf(p) - incoming(s, b.id, p.id))
    const qty = Math.min(need, stockOf(wp))
    if (qty > 0) out.push({ p, wp, qty })
  }
  return out
}

// ---------- Actions du joueur ----------

const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

export function warehouseOpeningCost(s: GameState, parcelId: string): number {
  return WAREHOUSE_LEVELS[0].cost + parcelRent(getParcel(s.city, parcelId)) * 2
}

export function canOpenWarehouseHere(s: GameState, parcelId: string): boolean {
  const p = s.city.parcels.find((x) => x.id === parcelId)
  return !!p && p.kind === 'lot' && p.districtId === WAREHOUSE_DISTRICT && isFree(s, p) && warehousesUnlocked(s)
}

export function openWarehouse(state: GameState, parcelId: string, sectorId: string): GameState {
  if (!canOpenWarehouseHere(state, parcelId) || warehouseOf(state, sectorId)) return state
  const cost = warehouseOpeningCost(state, parcelId)
  if (state.cash < cost) return state
  return update(state, (s) => {
    s.cash -= cost
    const sector = getSector(sectorId)
    // Par défaut, le fournisseur « gros volume » : c'est tout l'intérêt d'un entrepôt.
    const bulk = sectorSuppliers(s, sectorId).find((x) => x.tier === 'bulk') ?? defaultSupplier(s, sectorId)
    s.warehouses.push({
      id: newId(s, 'w'),
      parcelId,
      sectorId,
      level: 1,
      cold: false,
      handlers: 1,
      trucks: 1,
      products: sector.products.map((p) => ({ id: p.id, price: 0, batches: [], supplierId: bulk.id, restockTarget: 0, auto: true })),
      history: [],
      openedDay: s.day,
    })
    log(s, `Nouvel entrepôt ${sector.name.toLowerCase()} au ${getParcel(s.city, parcelId).address}.`, 'good')
  })
}

function withWarehouse(state: GameState, id: string, fn: (s: GameState, w: Warehouse) => void): GameState {
  if (!state.warehouses.some((w) => w.id === id)) return state
  return update(state, (s) => fn(s, s.warehouses.find((w) => w.id === id)!))
}

export function upgradeWarehouse(state: GameState, id: string): GameState {
  const w = state.warehouses.find((x) => x.id === id)
  const next = w && WAREHOUSE_LEVELS[w.level]
  if (!w || !next || state.cash < next.cost) return state
  return withWarehouse(state, id, (s, ww) => {
    s.cash -= next.cost
    ww.level++
    log(s, `L'entrepôt passe au niveau « ${next.name} » (${next.capacity.toLocaleString('fr-FR')} unités).`, 'good')
  })
}

export function installColdRoom(state: GameState, id: string): GameState {
  const w = state.warehouses.find((x) => x.id === id)
  if (!w || w.cold || state.cash < COLD_ROOM.cost) return state
  return withWarehouse(state, id, (s, ww) => {
    s.cash -= COLD_ROOM.cost
    ww.cold = true
    log(s, `Chambre froide installée (${eur(COLD_ROOM.cost)}) : l'entrepôt peut stocker les produits frais.`, 'good')
  })
}

export function setWarehouseStaff(state: GameState, id: string, handlers: number, trucks: number): GameState {
  return withWarehouse(state, id, (_, w) => {
    w.handlers = Math.max(0, Math.min(20, Math.round(handlers)))
    w.trucks = Math.max(0, Math.min(20, Math.round(trucks)))
  })
}

export function setWarehouseProduct(state: GameState, id: string, productId: string, changes: Partial<Pick<ProductState, 'supplierId' | 'restockTarget' | 'auto'>>): GameState {
  return withWarehouse(state, id, (s, w) => {
    const p = w.products.find((x) => x.id === productId)
    if (!p) return
    if (changes.supplierId) {
      const sup = s.suppliers.find((x) => x.id === changes.supplierId)
      if (sup && sup.active && sup.sectorId === w.sectorId) p.supplierId = sup.id
    }
    if (changes.restockTarget !== undefined) {
      // La cible ne peut pas dépasser la capacité restante de l'entrepôt.
      const others = w.products.filter((x) => x.id !== productId).reduce((a, x) => a + x.restockTarget, 0)
      p.restockTarget = Math.max(0, Math.min(Math.round(changes.restockTarget), warehouseLevel(w).capacity - others))
    }
    if (changes.auto !== undefined) p.auto = changes.auto
  })
}

/** Rattache (ou détache) tous les produits stockables d'une boutique à l'entrepôt de son secteur. */
export function setShopSupply(state: GameState, businessId: string, fromWarehouse: boolean): GameState {
  const b = state.businesses.find((x) => x.id === businessId)
  const w = b && warehouseOf(state, b.sectorId)
  if (!b || !w) return state
  return update(state, (s) => {
    const bb = s.businesses.find((x) => x.id === businessId)!
    for (const p of bb.products) p.fromWarehouse = fromWarehouse && canStore(w, p.id)
  })
}

/** Ferme un entrepôt : le stock restant est réparti dans les boutiques, les commandes en cours sont annulées. */
export function closeWarehouse(state: GameState, id: string): GameState {
  return withWarehouse(state, id, (s, w) => {
    for (const o of s.orders.filter((x) => x.businessId === w.id)) archive(s, o, 'annulée')
    for (const b of s.businesses.filter((x) => x.sectorId === w.sectorId))
      for (const p of b.products) p.fromWarehouse = false
    s.warehouses = s.warehouses.filter((x) => x.id !== id)
    log(s, `L'entrepôt ${getSector(w.sectorId).name.toLowerCase()} est fermé.`)
  })
}

/** Remplissage conseillé : une semaine de ventes des boutiques rattachées. */
export function suggestedTarget(s: GameState, w: Warehouse, productId: string): number {
  if (!canStore(w, productId)) return 0
  const weekly = servedShops(s, w).reduce((sum, b) => {
    const days = b.history.slice(-7)
    return sum + (days.reduce((a, r) => a + (r.soldByProduct?.[productId] ?? 0), 0) / Math.max(1, days.length)) * 7
  }, 0)
  return Math.ceil(weekly * (isPerishable(w.sectorId, productId) ? 0.4 : 1))
}
