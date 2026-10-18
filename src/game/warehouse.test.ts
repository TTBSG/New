import { describe, expect, it } from 'vitest'
import { isFree } from './city'
import { hire, newGame, openBusiness, tick } from './engine'
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
function group(sectorId: string, n: number, seed = 8): GameState {
  let s = newGame(seed)
  s = { ...s, cash: 1_000_000, objectivesDone: RANK4, unlockedSectors: ['cafe', 'boulangerie', 'superette', 'restaurant', 'vetements', 'electronique'] }
  s = openHq(s, lots(s, 'affaires')[0].id)
  s = hireOffice(s, s.officeCandidates.find((c) => c.role === 'logisticien')!.id)
  for (let i = 0; i < n; i++) {
    s = openBusiness(s, sectorId, lots(s, i % 2 ? 'centre' : 'residentiel')[0].id, `M${i}`)
    const b = s.businesses.at(-1)!
    for (let k = 0; k < 2; k++) {
      const c = s.candidates.find((x) => x.sectorId === sectorId && x.roleId !== 'manager')
      if (c) s = hire(s, b.id, c.id)
    }
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

const profit = (s: GameState, days: number) => s.businesses.reduce((a, b) => a + b.history.slice(-days).reduce((x, r) => x + r.profit, 0), 0)
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
    const run = (sectorId: string, warehouse: boolean) => {
      let s = group(sectorId, 4, 12)
      if (warehouse) {
        s = withWarehouse(s, sectorId)
        const w = warehouseOf(s, sectorId)!
        // Fournisseur gros volume et une semaine de ventes en stock, comme le conseille l'appli.
        const bulk = sectorSuppliers(s, sectorId).find((x) => x.tier === 'bulk')!
        for (let i = 0; i < 14; i++) s = tick(s)
        for (const p of w.products) s = setWarehouseProduct(s, w.id, p.id, { supplierId: bulk.id, restockTarget: suggestedTarget(s, warehouseOf(s, sectorId)!, p.id) * 2 })
      } else for (let i = 0; i < 14; i++) s = tick(s)
      for (let i = 0; i < 60; i++) s = tick(s)
      return profit(s, 30) - logistics(s, 30)
    }
    const electroGain = run('electronique', true) - run('electronique', false)
    const superetteGain = run('superette', true) - run('superette', false)
    const cafeGain = run('cafe', true) - run('cafe', false)
    expect(electroGain).toBeGreaterThan(3000)
    expect(superetteGain).toBeGreaterThan(0)
    expect(cafeGain).toBeLessThan(0)
  })
})
