import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { newGame, openBusiness, tick } from './engine'
import { hireStaff } from './testUtils'
import { hireOffice, openHq } from './hq'
import { stockOf } from './stock'
import { sectorSuppliers } from './supply'
import type { GameState } from './types'
import {
  WAREHOUSE_DISTRICT,
  canStore,
  installColdRoom,
  openWarehouse,
  setShopSupply,
  setWarehouseProduct,
  setWarehouseStaff,
  suggestedTarget,
  warehouseOf,
} from './warehouse'

const RANK4 = ['open_first', 'hire_first', 'first_sales', 'rep_60', 'two_shops', 'month_5k', 'staff_8', 'three_shops', 'networth_200k']
const lots = (s: GameState, d?: string) => s.city.parcels.filter((p) => p.kind === 'lot' && (!d || p.districtId === d) && isFree(s, p))

/** Groupe de `n` commerces d'un secteur, avec siège et directeur logistique. */
function group(sectorId: string, n: number, seed = 8, staff = 2): GameState {
  let s = newGame(seed)
  s = { ...s, cash: 1_000_000, objectivesDone: RANK4, unlockedSectors: ['cafe', 'boulangerie', 'superette', 'restaurant', 'vetements', 'electronique'] }
  s = openHq(s, lots(s, 'affaires')[0].id)
  s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'logisticien')!.id)
  for (let i = 0; i < n; i++) {
    s = openBusiness(s, sectorId, lots(s, i % 2 ? 'centre' : 'residentiel')[0].id, `M${i}`)
    s = hireStaff(s, s.businesses.at(-1)!.id, staff)
  }
  return s
}

function withWarehouse(s: GameState, sectorId: string) {
  s = openWarehouse(s, lots(s, WAREHOUSE_DISTRICT)[0].id, sectorId)
  const w = warehouseOf(s, sectorId)!
  s = setWarehouseStaff(s, w.id, 1, 1)
  for (const b of s.businesses) s = setShopSupply(s, b.id, true)
  return s
}

const logistics = (s: GameState, days: number) => s.warehouses.reduce((a, w) => a + w.history.slice(-days).reduce((x, r) => x + r.cost, 0), 0)

describe('entrepôts', () => {
  it('exige le rang 4, un directeur logistique et un local de la zone commerciale', () => {
    let s = newGame(3)
    s = { ...s, cash: 1_000_000 }
    expect(openWarehouse(s, lots(s, WAREHOUSE_DISTRICT)[0].id, 'cafe').warehouses).toHaveLength(0)
    s = group('cafe', 1)
    expect(openWarehouse(s, lots(s, 'residentiel')[0].id, 'cafe').warehouses).toHaveLength(0)
    expect(openWarehouse(s, lots(s, WAREHOUSE_DISTRICT)[0].id, 'cafe').warehouses).toHaveLength(1)
  })

  it('les produits frais ne passent par l\'entrepôt qu\'avec une chambre froide', () => {
    let s = withWarehouse(group('cafe', 1), 'cafe')
    const croissant = s.businesses[0].products.find((p) => p.id === 'croissant')!
    expect(croissant.fromWarehouse).toBe(false)
    expect(canStore(warehouseOf(s, 'cafe')!, 'espresso')).toBe(true)
    s = installColdRoom(s, warehouseOf(s, 'cafe')!.id)
    s = setShopSupply(s, s.businesses[0].id, true)
    expect(s.businesses[0].products.find((p) => p.id === 'croissant')!.fromWarehouse).toBe(true)
  })

  it('l\'entrepôt commande en gros, puis livre les boutiques chaque nuit', () => {
    let s = withWarehouse(group('superette', 2), 'superette')
    const w = warehouseOf(s, 'superette')!
    for (const p of w.products) s = setWarehouseProduct(s, w.id, p.id, { restockTarget: 6000 })
    for (let i = 0; i < 12; i++) s = tick(s)
    const ww = warehouseOf(s, 'superette')!
    expect(ww.history.some((d) => d.received > 0)).toBe(true)
    expect(ww.history.some((d) => d.shipped > 0)).toBe(true)
    // Une fois l'entrepôt rempli, les boutiques ne commandent plus elles-mêmes que les produits frais (pas de chambre froide).
    const before = new Set([...s.orderHistory, ...s.orders].map((o) => o.id))
    for (let i = 0; i < 10; i++) s = tick(s)
    const shopLines = [...s.orderHistory, ...s.orders]
      .filter((o) => !before.has(o.id) && s.businesses.some((b) => b.id === o.businessId))
      .flatMap((o) => o.lines.map((l) => l.productId))
    expect(new Set(shopLines)).toEqual(new Set(['frais']))
    expect(s.businesses.every((b) => b.products.every((p) => stockOf(p) > 0))).toBe(true)
    expect(suggestedTarget(s, ww, 'epicerie')).toBeGreaterThan(0)
  })

  it('sans assez de camions, certaines boutiques ne sont pas livrées', () => {
    let s = withWarehouse(group('superette', 3), 'superette')
    const w = warehouseOf(s, 'superette')!
    for (const p of w.products) s = setWarehouseProduct(s, w.id, p.id, { restockTarget: 3000 })
    s = setWarehouseStaff(s, w.id, 2, 0)
    for (let i = 0; i < 10; i++) s = tick(s)
    expect(warehouseOf(s, 'superette')!.history.some((d) => d.unserved > 0)).toBe(true)
  })

  it('économie : très rentable en électronique, rentable en supérette, pas pour des cafés', () => {
    // On compare la marge en % du chiffre d'affaires (indépendante des aléas de fréquentation) au coût logistique.
    const run = (sectorId: string, warehouse: boolean) => {
      let s = group(sectorId, 4, 12, 3)
      for (let i = 0; i < 14; i++) s = tick(s)
      if (warehouse) {
        s = withWarehouse(s, sectorId)
        const w = warehouseOf(s, sectorId)!
        const bulk = sectorSuppliers(s, sectorId).find((x) => x.tier === 'bulk')!
        // Fournisseur gros volume et deux semaines de ventes en stock.
        for (const p of w.products) s = setWarehouseProduct(s, w.id, p.id, { supplierId: bulk.id, restockTarget: suggestedTarget(s, warehouseOf(s, sectorId)!, p.id) * 2 })
      }
      for (let i = 0; i < 60; i++) s = tick(s)
      const days = s.businesses.flatMap((b) => b.history.slice(-30))
      const revenue = days.reduce((a, r) => a + r.revenue, 0)
      return { revenue, marginRate: days.reduce((a, r) => a + r.grossMargin, 0) / revenue, logistics: logistics(s, 30) }
    }
    const gain = (sectorId: string) => {
      const without = run(sectorId, false)
      const withW = run(sectorId, true)
      return (withW.marginRate - without.marginRate) * withW.revenue - withW.logistics
    }
    expect(gain('electronique')).toBeGreaterThan(3000)
    expect(gain('superette')).toBeGreaterThan(0)
    expect(gain('cafe')).toBeLessThan(0)
  })
})
