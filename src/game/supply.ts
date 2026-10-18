import { purchasingRate, reliabilityBoost } from './hq'
import { supplierMessage } from './messages'
import { currentRank } from './objectives'
import { SECTORS, SUPPLIER_NAMES, getSector } from './sectors'
import { addBatch, expireStock, productDef, stockOf } from './stock'
import type { Business, GameState, Order, OrderLine, ProductState, Supplier, SupplierTier } from './types'
import { clamp, log, newId, pick, rand, randRange, round2, update } from './util'

/** Rang à partir duquel l'appli Fournisseurs est disponible. */
export const SUPPLIERS_RANK = 2
export const suppliersUnlocked = (s: GameState) => currentRank(s) >= SUPPLIERS_RANK
const HISTORY_SIZE = 30

const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

// ---------- Création des fournisseurs ----------

function makeSupplier(s: GameState, sectorId: string, tier: SupplierTier, name: string): Supplier {
  // Les minimums de commande suivent le niveau de prix du secteur.
  const scale = getSector(sectorId).setupCost / 30000
  const base = { id: newId(s, 's'), name, sectorId, tier, active: true, spent: 0, negotiated: 0, negotiatedDay: -999 }
  switch (tier) {
    case 'default':
      return { ...base, quality: 60, priceMult: 1, leadDays: 1, reliability: 0.97, minOrder: 0, deliveryFee: 0 }
    case 'eco':
      return { ...base, quality: Math.round(randRange(s, 35, 45)), priceMult: round2(randRange(s, 0.68, 0.78)), leadDays: 2, reliability: round2(randRange(s, 0.8, 0.88)), minOrder: Math.round(250 * scale), deliveryFee: 25 }
    case 'premium':
      return { ...base, quality: Math.round(randRange(s, 82, 92)), priceMult: round2(randRange(s, 1.35, 1.55)), leadDays: 2, reliability: round2(randRange(s, 0.94, 0.99)), minOrder: Math.round(300 * scale), deliveryFee: 20 }
    case 'bulk':
      return { ...base, quality: Math.round(randRange(s, 56, 64)), priceMult: round2(randRange(s, 0.78, 0.85)), leadDays: Math.round(randRange(s, 5, 6)), reliability: round2(randRange(s, 0.92, 0.97)), minOrder: Math.round(1500 * scale), deliveryFee: 40 }
  }
}

export function generateSuppliers(s: GameState) {
  s.suppliers = []
  for (const sector of SECTORS) {
    const names = SUPPLIER_NAMES[sector.id]
    s.suppliers.push(makeSupplier(s, sector.id, 'default', 'Grossiste du Coin'))
    s.suppliers.push(makeSupplier(s, sector.id, 'premium', names.premium))
    s.suppliers.push(makeSupplier(s, sector.id, 'eco', names.eco))
    s.suppliers.push(makeSupplier(s, sector.id, 'bulk', names.bulk))
  }
}

export const getSupplier = (s: GameState, id: string) => s.suppliers.find((x) => x.id === id)!
export const sectorSuppliers = (s: GameState, sectorId: string) => s.suppliers.filter((x) => x.sectorId === sectorId && x.active)
export const defaultSupplier = (s: GameState, sectorId: string) => s.suppliers.find((x) => x.sectorId === sectorId && x.tier === 'default')!

// ---------- Prix et qualité ----------

export function unitCost(s: GameState, sectorId: string, p: ProductState): number {
  return productDef(sectorId, p.id).unitCost * getSupplier(s, p.supplierId).priceMult
}

export function productQuality(s: GameState, p: ProductState): number {
  return getSupplier(s, p.supplierId).quality
}

/** Remise de fidélité selon le total déjà acheté chez ce fournisseur. */
export function loyalty(spent: number): { label: string; rate: number; next: number | null } {
  if (spent >= 50000) return { label: 'Partenaire', rate: 0.06, next: null }
  if (spent >= 20000) return { label: 'Client fidèle', rate: 0.04, next: 50000 }
  if (spent >= 5000) return { label: 'Bon client', rate: 0.02, next: 20000 }
  return { label: 'Nouveau client', rate: 0, next: 5000 }
}

export function volumeRate(subtotal: number): number {
  return subtotal >= 5000 ? 0.08 : subtotal >= 2000 ? 0.05 : subtotal >= 500 ? 0.02 : 0
}

export interface Quote {
  subtotal: number
  discountRate: number
  discount: number
  fee: number
  total: number
}

/** `extraRate` : remise supplémentaire obtenue par les acheteurs du siège. */
export function quote(supplier: Supplier, sectorId: string, lines: OrderLine[], extraRate = 0): Quote {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * productDef(sectorId, l.productId).unitCost * supplier.priceMult, 0)
  const discountRate = volumeRate(subtotal) + loyalty(supplier.spent).rate + supplier.negotiated + extraRate
  const discount = subtotal * discountRate
  const fee = subtotal > 0 && subtotal - discount < supplier.minOrder ? supplier.deliveryFee : 0
  return { subtotal: round2(subtotal), discountRate, discount: round2(discount), fee, total: round2(subtotal - discount + fee) }
}

// ---------- Commandes ----------

export const pendingOrders = (s: GameState, businessId: string) => s.orders.filter((o) => o.businessId === businessId)

/** Quantité déjà commandée et pas encore livrée. */
export function incoming(s: GameState, businessId: string, productId: string): number {
  return pendingOrders(s, businessId).reduce((n, o) => n + o.lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0), 0)
}

function createOrder(s: GameState, b: Business, supplier: Supplier, lines: OrderLine[], auto: boolean): Order | null {
  lines = lines.filter((l) => l.qty > 0)
  if (!lines.length) return null
  const q = quote(supplier, b.sectorId, lines, purchasingRate(s))
  // Le fournisseur vérifie la solvabilité au moment de la commande ; le paiement a lieu à la livraison.
  if (s.cash < q.total) return null
  const order: Order = { id: newId(s, 'o'), businessId: b.id, supplierId: supplier.id, lines, total: q.total, placedDay: s.day, dueDay: s.day + supplier.leadDays, auto, delayed: false }
  s.orders.push(order)
  return order
}

function archive(s: GameState, o: Order, status: 'livrée' | 'annulée') {
  s.orders = s.orders.filter((x) => x.id !== o.id)
  s.orderHistory.unshift({ ...o, status, closedDay: s.day })
  if (s.orderHistory.length > HISTORY_SIZE) s.orderHistory.length = HISTORY_SIZE
}

/** Livraisons du matin. Renvoie le montant payé. */
export function receiveDeliveries(s: GameState, b: Business): number {
  let paid = 0
  for (const o of pendingOrders(s, b.id).filter((x) => x.dueDay <= s.day)) {
    const supplier = getSupplier(s, o.supplierId)
    if (!o.delayed && rand(s) > Math.min(0.995, supplier.reliability + reliabilityBoost(s))) {
      const delay = 1 + Math.floor(rand(s) * 3)
      o.delayed = true
      o.dueDay += delay
      supplierMessage(s, supplier.name, `Fournisseur · ${b.name}`, [`Désolés, votre livraison est retardée de ${delay} jour${delay > 1 ? 's' : ''} (problème de transport).`])
      continue
    }
    for (const l of o.lines) {
      const p = b.products.find((x) => x.id === l.productId)
      if (p) addBatch(b.sectorId, p, l.qty, s.day)
    }
    s.cash -= o.total
    paid += o.total
    supplier.spent += o.total
    archive(s, o, 'livrée')
  }
  return paid
}

/** Seuil de recommande : les produits très frais sont complétés chaque soir, les autres sous 70 % de la cible. */
function reorderThreshold(sectorId: string, p: ProductState): number {
  const life = productDef(sectorId, p.id).shelfLife
  return life !== undefined && life <= 2 ? 1 : 0.7
}

/** Fin de journée : produits périmés jetés, puis commandes automatiques. */
/**
 * Quantité à avoir en rayon pour un produit en commande automatique.
 * Pour les produits qui périment, on ne dépasse pas ce qui se vendra avant péremption (ventes récentes + 15 %) :
 * inutile de commander ce qui finira à la poubelle.
 */
export function autoTarget(b: Business, p: ProductState, soldToday: Record<string, number> = {}): number {
  const life = productDef(b.sectorId, p.id).shelfLife
  if (life === undefined) return p.restockTarget
  const days = [...b.history.slice(-6).map((r) => r.soldByProduct?.[p.id]), soldToday[p.id]].filter((n): n is number => n !== undefined)
  if (days.length < 3) return p.restockTarget
  const avg = days.reduce((a, n) => a + n, 0) / days.length
  const cover = life <= 2 ? 1 : life - 1
  return Math.min(p.restockTarget, Math.ceil(avg * cover * 1.15) + 1)
}

export function closeDay(s: GameState, b: Business, soldToday: Record<string, number> = {}): { wasteValue: number; wasteByProduct: Record<string, number> } {
  let wasteValue = 0
  const wasteByProduct: Record<string, number> = {}
  for (const p of b.products) {
    const n = expireStock(p, s.day)
    if (n) {
      wasteByProduct[p.id] = n
      wasteValue += n * unitCost(s, b.sectorId, p)
    }
  }

  // Un produit sous son seuil déclenche une commande ; on complète alors tous les produits du même fournisseur.
  const position = (p: ProductState) => stockOf(p) + incoming(s, b.id, p.id)
  const target = (p: ProductState) => autoTarget(b, p, soldToday)
  const triggered = new Set(b.products.filter((p) => p.auto && target(p) > 0 && position(p) < target(p) * reorderThreshold(b.sectorId, p)).map((p) => p.supplierId))
  for (const supplierId of triggered) {
    const supplier = getSupplier(s, supplierId)
    const lines = b.products
      .filter((p) => p.auto && p.supplierId === supplierId)
      .map((p) => ({ productId: p.id, qty: Math.max(0, Math.ceil(target(p) - position(p))) }))
    if (!createOrder(s, b, supplier, lines, true)) log(s, `${b.name} : commande automatique chez ${supplier.name} impossible, trésorerie insuffisante.`, 'bad')
  }
  return { wasteValue: round2(wasteValue), wasteByProduct }
}

/** Événements du marché des fournisseurs (faillites rares). */
export function dailySupply(s: GameState) {
  if (rand(s) > 1 / 400) return
  const candidates = s.suppliers.filter((x) => x.active && x.tier !== 'default')
  if (!candidates.length) return
  const sup = pick(s, candidates)
  sup.active = false
  const fallback = defaultSupplier(s, sup.sectorId)
  let affected = false
  for (const o of s.orders.filter((x) => x.supplierId === sup.id)) archive(s, o, 'annulée')
  for (const b of s.businesses)
    for (const p of b.products)
      if (p.supplierId === sup.id) {
        p.supplierId = fallback.id
        affected = true
      }
  log(s, `Le fournisseur ${sup.name} a fait faillite.`, 'bad')
  if (affected || sup.spent > 0)
    supplierMessage(s, 'Grossiste du Coin', 'Fournisseur', [
      `Nous avons appris la faillite de ${sup.name}. Vos commandes en cours chez eux sont annulées.`,
      'Nous reprenons l\'approvisionnement des produits concernés en attendant que vous choisissiez un autre fournisseur.',
    ])
}

// ---------- Actions du joueur ----------

function withBusiness(state: GameState, businessId: string, fn: (s: GameState, b: Business) => void): GameState {
  if (!state.businesses.some((b) => b.id === businessId)) return state
  return update(state, (s) => fn(s, s.businesses.find((b) => b.id === businessId)!))
}

export function placeOrder(state: GameState, businessId: string, supplierId: string, quantities: Record<string, number>): GameState {
  const supplier = state.suppliers.find((x) => x.id === supplierId)
  const b = state.businesses.find((x) => x.id === businessId)
  if (!supplier || !b || !supplier.active || supplier.sectorId !== b.sectorId || !suppliersUnlocked(state)) return state
  const lines = Object.entries(quantities).map(([productId, qty]) => ({ productId, qty: Math.max(0, Math.round(qty)) }))
  if (state.cash < quote(supplier, b.sectorId, lines, purchasingRate(state)).total) return state
  return withBusiness(state, businessId, (s, bb) => {
    const o = createOrder(s, bb, getSupplier(s, supplierId), lines, false)
    if (o) log(s, `Commande passée chez ${supplier.name} pour ${bb.name} : ${eur(o.total)}, livraison prévue dans ${supplier.leadDays} j.`)
  })
}

export function cancelOrder(state: GameState, orderId: string): GameState {
  if (!state.orders.some((o) => o.id === orderId)) return state
  return update(state, (s) => {
    archive(s, s.orders.find((o) => o.id === orderId)!, 'annulée')
  })
}

export function setProductSupplier(state: GameState, businessId: string, productId: string, supplierId: string): GameState {
  const sup = state.suppliers.find((x) => x.id === supplierId)
  const b = state.businesses.find((x) => x.id === businessId)
  if (!sup || !b || !sup.active || sup.sectorId !== b.sectorId) return state
  if (sup.tier !== 'default' && !suppliersUnlocked(state)) return state
  return withBusiness(state, businessId, (_, bb) => {
    const p = bb.products.find((x) => x.id === productId)
    if (p) p.supplierId = supplierId
  })
}

export function setAuto(state: GameState, businessId: string, productId: string, auto: boolean): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const p = b.products.find((x) => x.id === productId)
    if (p) p.auto = auto
  })
}

export const NEGOTIATION_COOLDOWN = 30
export const MAX_NEGOTIATED = 0.09

/** Tentative de négociation (par le joueur ou par un acheteur du siège). Renvoie vrai si la remise augmente. */
export function tryNegotiate(s: GameState, x: Supplier): boolean {
  x.negotiatedDay = s.day
  // Être un bon client aide à négocier.
  const chance = clamp(0.55 - x.negotiated * 4 + loyalty(x.spent).rate * 3, 0.15, 0.8)
  if (rand(s) < chance) {
    x.negotiated = Math.min(MAX_NEGOTIATED, round2(x.negotiated + 0.03))
    return true
  }
  return false
}

export const canNegotiate = (s: GameState, x: Supplier) => x.active && s.day - x.negotiatedDay >= NEGOTIATION_COOLDOWN && x.negotiated < MAX_NEGOTIATED

/** Tenter d'obtenir une remise : plus elle est déjà élevée, plus c'est difficile. */
export function negotiate(state: GameState, supplierId: string): GameState {
  const sup = state.suppliers.find((x) => x.id === supplierId)
  if (!sup || !canNegotiate(state, sup)) return state
  return update(state, (s) => {
    const x = getSupplier(s, supplierId)
    if (tryNegotiate(s, x)) log(s, `Négociation réussie avec ${x.name} : remise portée à ${Math.round(x.negotiated * 100)} %.`, 'good')
    else log(s, `${x.name} refuse de baisser ses prix pour le moment.`, 'bad')
  })
}
