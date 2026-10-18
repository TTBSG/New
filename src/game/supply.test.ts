import { describe, expect, it } from 'vitest'
import { isVacant } from './city'
import { hire, newGame, openBusiness, setRestockTarget, tick } from './engine'
import { stockOf } from './stock'
import { cancelOrder, getSupplier, negotiate, placeOrder, quote, sectorSuppliers, setAuto, setProductSupplier } from './supply'
import type { GameState } from './types'

function cafe(seed = 21, rank2 = true): GameState {
  let s = newGame(seed)
  s = openBusiness(s, 'cafe', s.city.parcels.find((p) => p.districtId === 'residentiel' && isVacant(p, s.businesses))!.id, 'X')
  for (let i = 0; i < 2; i++) s = hire(s, s.businesses[0].id, s.candidates.find((c) => c.sectorId === 'cafe' && c.roleId === 'barista')!.id)
  // Rang 2 atteint artificiellement pour débloquer les fournisseurs.
  if (rank2) s = { ...s, objectivesDone: [...new Set([...s.objectivesDone, 'open_first', 'hire_first', 'first_sales'])] }
  return s
}
const bulk = (s: GameState) => sectorSuppliers(s, 'cafe').find((x) => x.tier === 'bulk')!
const product = (s: GameState, id: string) => s.businesses[0].products.find((p) => p.id === id)!

describe('fournisseurs', () => {
  it('chaque secteur a 4 fournisseurs aux profils différents', () => {
    const s = newGame(1)
    const list = sectorSuppliers(s, 'cafe')
    expect(list.map((x) => x.tier).sort()).toEqual(['bulk', 'default', 'eco', 'premium'])
    const by = Object.fromEntries(list.map((x) => [x.tier, x]))
    expect(by.premium.quality).toBeGreaterThan(by.default.quality)
    expect(by.eco.priceMult).toBeLessThan(by.default.priceMult)
    expect(by.bulk.leadDays).toBeGreaterThan(by.default.leadDays)
  })

  it('les produits frais invendus sont jetés et comptés en pertes', () => {
    let s = cafe()
    s = setRestockTarget(s, s.businesses[0].id, 'croissant', 400)
    for (let i = 0; i < 4; i++) s = tick(s)
    const waste = s.businesses[0].history.reduce((a, r) => a + (r.wasteByProduct?.croissant ?? 0), 0)
    expect(waste).toBeGreaterThan(100)
    expect(s.businesses[0].history.at(-1)!.waste).toBeGreaterThan(0)
  })

  it('une commande arrive après le délai du fournisseur et se paie à la livraison', () => {
    let s = cafe()
    const sup = bulk(s)
    s = setAuto(s, s.businesses[0].id, 'espresso', false)
    const before = stockOf(product(s, 'espresso'))
    const cash = s.cash
    s = placeOrder(s, s.businesses[0].id, sup.id, { espresso: 3000 })
    expect(s.orders).toHaveLength(1)
    expect(s.cash).toBe(cash) // pas encore payé
    const order = s.orders[0]
    for (let d = 1; d < sup.leadDays; d++) s = tick(s)
    expect(s.orders.some((o) => o.id === order.id)).toBe(true)
    for (let d = 0; d < 4 && s.orders.some((o) => o.id === order.id); d++) s = tick(s)
    expect(s.orderHistory.find((o) => o.id === order.id)!.status).toBe('livrée')
    expect(stockOf(product(s, 'espresso'))).toBeGreaterThan(before + 2000)
  })

  it('les grosses commandes et la fidélité donnent des remises ; les petites paient des frais', () => {
    const s = cafe()
    const sup = bulk(s)
    const small = quote(sup, 'cafe', [{ productId: 'espresso', qty: 10 }])
    expect(small.fee).toBe(sup.deliveryFee)
    const big = quote(sup, 'cafe', [{ productId: 'espresso', qty: 20000 }])
    expect(big.discountRate).toBeGreaterThan(0.07)
    const loyal = quote({ ...sup, spent: 60000 }, 'cafe', [{ productId: 'espresso', qty: 20000 }])
    expect(loyal.total).toBeLessThan(big.total)
  })

  it('une commande peut être annulée', () => {
    let s = cafe()
    s = placeOrder(s, s.businesses[0].id, bulk(s).id, { espresso: 2000 })
    s = cancelOrder(s, s.orders[0].id)
    expect(s.orders).toHaveLength(0)
    expect(s.orderHistory[0].status).toBe('annulée')
  })

  it('changer de fournisseur exige le rang 2', () => {
    let s = cafe(21, false)
    const premium = sectorSuppliers(s, 'cafe').find((x) => x.tier === 'premium')!
    expect(setProductSupplier(s, s.businesses[0].id, 'espresso', premium.id)).toBe(s)
    s = { ...s, objectivesDone: ['open_first', 'hire_first', 'first_sales'] }
    s = setProductSupplier(s, s.businesses[0].id, 'espresso', premium.id)
    expect(product(s, 'espresso').supplierId).toBe(premium.id)
  })

  it('les commandes automatiques regroupent les produits d\'un même fournisseur', () => {
    let s = cafe()
    for (let i = 0; i < 3; i++) s = tick(s)
    const autoOrders = s.orderHistory.filter((o) => o.auto && o.placedDay === s.orderHistory[0].placedDay)
    expect(autoOrders).toHaveLength(1)
    expect(autoOrders[0].lines.length).toBeGreaterThan(1)
  })

  it('négocier : au plus une tentative par mois', () => {
    let s = cafe()
    const id = bulk(s).id
    s = negotiate(s, id)
    const after = getSupplier(s, id).negotiated
    expect(negotiate(s, id)).toBe(s)
    for (let i = 0; i < 30; i++) s = tick(s)
    s = negotiate(s, id)
    expect(getSupplier(s, id).negotiated).toBeGreaterThanOrEqual(after)
  })
})
