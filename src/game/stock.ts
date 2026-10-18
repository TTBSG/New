import { getSector } from './sectors'
import type { ProductDef, ProductState } from './types'

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

/** Ajoute un lot reçu le jour `day`, en fusionnant avec un lot de même date de péremption. */
export function addBatch(sectorId: string, p: ProductState, qty: number, day: number) {
  if (qty <= 0) return
  const life = productDef(sectorId, p.id).shelfLife
  const expiresDay = life ? day + life - 1 : null
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
