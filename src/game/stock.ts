import { getSector } from './sectors'
import type { ProductDef, ProductState, StockBatch } from './types'

export function productDef(sectorId: string, productId: string): ProductDef {
  return getSector(sectorId).products.find((x) => x.id === productId)!
}

export function stockOf(p: ProductState): number {
  return p.batches.reduce((n, b) => n + b.qty, 0)
}

/** Unités qui seront jetées ce soir si elles ne sont pas vendues. */
export function expiringToday(p: ProductState, day: number): number {
  return p.batches.reduce((n, b) => n + (b.expiresDay !== null && b.expiresDay <= day ? b.qty : 0), 0)
}

/** Met à jour le coût moyen pondéré avant l'arrivée de `qty` unités payées `unitPaid` chacune. */
export function updateAvgCost(p: ProductState, qty: number, unitPaid: number) {
  if (qty <= 0) return
  const stock = stockOf(p)
  const prev = p.avgCost ?? unitPaid
  p.avgCost = (stock * prev + qty * unitPaid) / (stock + qty)
}

/** Ajoute un lot reçu le jour `day`, en fusionnant avec un lot de même date de péremption. */
export function addBatch(sectorId: string, p: ProductState, qty: number, day: number, extraLife = 0) {
  if (qty <= 0) return
  const life = productDef(sectorId, p.id).shelfLife
  const expiresDay = life ? day + life + extraLife - 1 : null
  const same = p.batches.find((b) => b.expiresDay === expiresDay)
  if (same) same.qty += qty
  else p.batches.push({ qty, expiresDay })
  // Les lots qui périment le plus tôt sont vendus en premier.
  p.batches.sort((a, b) => (a.expiresDay ?? Infinity) - (b.expiresDay ?? Infinity))
}

/** Retire jusqu'à `qty` unités, des plus anciennes aux plus récentes. Renvoie la quantité retirée. */
export function takeStock(p: ProductState, qty: number): number {
  let left = qty
  for (const b of p.batches) {
    const n = Math.min(b.qty, left)
    b.qty -= n
    left -= n
    if (!left) break
  }
  p.batches = p.batches.filter((b) => b.qty > 0)
  return qty - left
}

/** Jette les lots périmés en fin de journée. Renvoie le nombre d'unités jetées. */
export function expireStock(p: ProductState, day: number): number {
  const wasted = expiringToday(p, day)
  if (wasted) p.batches = p.batches.filter((b) => b.expiresDay === null || b.expiresDay > day)
  return wasted
}

/** Retire jusqu'à `qty` unités en conservant les dates de péremption (transfert d'un stock à un autre). */
export function takeBatches(p: ProductState, qty: number): StockBatch[] {
  const out: StockBatch[] = []
  let left = qty
  for (const b of p.batches) {
    const n = Math.min(b.qty, left)
    if (n) out.push({ qty: n, expiresDay: b.expiresDay })
    b.qty -= n
    left -= n
    if (!left) break
  }
  p.batches = p.batches.filter((b) => b.qty > 0)
  return out
}

/** Ajoute des lots tels quels (dates de péremption conservées). */
export function putBatches(p: ProductState, batches: StockBatch[]) {
  for (const b of batches) {
    const same = p.batches.find((x) => x.expiresDay === b.expiresDay)
    if (same) same.qty += b.qty
    else p.batches.push({ ...b })
  }
  p.batches.sort((a, b) => (a.expiresDay ?? Infinity) - (b.expiresDay ?? Infinity))
}
