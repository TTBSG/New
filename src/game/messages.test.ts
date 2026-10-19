import { describe, expect, it } from 'vitest'
import { isVacant } from './city'
import { borrow, migrate, newGame, openBusiness, tick } from './engine'
import { hireStaff } from './testUtils'
import { answer } from './messages'
import { stockOf } from './stock'
import type { GameState } from './types'

function cafe(seed = 9): GameState {
  let s = newGame(seed)
  s = borrow(s, 40000)
  const lot = s.city.parcels.find((p) => p.districtId === 'centre' && isVacant(p, s.businesses))!.id
  s = openBusiness(s, 'cafe', lot, 'Test')
  return hireStaff(s, s.businesses[0].id, 3)
}

function runUntil(s: GameState, kind: string, max = 400) {
  for (let i = 0; i < max; i++) {
    s = tick(s)
    if (s.inbox.some((c) => c.kind === kind && c.choices.length)) break
  }
  return s
}

describe('messages', () => {
  it('une nouvelle partie commence par un message de bienvenue', () => {
    const s = newGame(1)
    expect(s.inbox[0].kind).toBe('advisor')
    expect(s.inbox[0].unread).toBe(true)
  })

  it('accepter une demande d\'augmentation change le salaire et remonte le moral', () => {
    // Des salaires en dessous du marché provoquent des demandes.
    let s = cafe()
    s = { ...s, businesses: s.businesses.map((b) => ({ ...b, employees: b.employees.map((e) => ({ ...e, salary: e.salary - 150 })) })) }
    s = runUntil(s, 'raise')
    const c = s.inbox.find((x) => x.kind === 'raise' && x.choices.length)!
    expect(c).toBeDefined()
    const before = s.businesses[0].employees.find((e) => e.id === c.employeeId)!
    s = answer(s, c.id, 'accept')
    const after = s.businesses[0].employees.find((e) => e.id === c.employeeId)!
    expect(after.salary).toBe(c.amount)
    expect(after.morale).toBeGreaterThan(before.morale)
    expect(s.inbox.find((x) => x.id === c.id)!.choices).toHaveLength(0)
  })

  it('une offre fournisseur acceptée ajoute du stock contre de l\'argent', () => {
    let s = runUntil(cafe(4), 'supplier')
    const c = s.inbox.find((x) => x.kind === 'supplier' && x.choices.length)!
    const p = () => stockOf(s.businesses[0].products.find((x) => x.id === c.productId)!)
    const stock = p()
    const cash = s.cash
    s = answer(s, c.id, 'accept')
    expect(p()).toBe(stock + c.quantity!)
    expect(s.cash).toBe(cash - c.amount!)
  })

  it('une offre sans réponse expire', () => {
    let s = runUntil(cafe(4), 'supplier')
    const id = s.inbox.find((x) => x.kind === 'supplier' && x.choices.length)!.id
    for (let i = 0; i < 5; i++) s = tick(s)
    expect(s.inbox.find((x) => x.id === id)!.choices).toHaveLength(0)
  })

  it('convertit une sauvegarde de la version 2 en conservant le stock', () => {
    const s = cafe()
    const stockBefore = s.businesses[0].products.map(stockOf)
    // Reconstitue le format de l'époque : stock simple, gamme de fournisseur, pas de messagerie ni de fournisseurs.
    const old = structuredClone(s) as unknown as Record<string, unknown> & { businesses: { products: Record<string, unknown>[] }[] }
    old.version = 2
    for (const k of ['inbox', 'flags', 'hq', 'officeCandidates', 'warehouses', 'suppliers', 'orders', 'orderHistory', 'stats', 'objectivesDone', 'unlockedSectors', 'celebrations']) delete old[k]
    for (const b of old.businesses as unknown as { employees: Record<string, unknown>[] }[])
      for (const e of b.employees) {
        e.skill = 60
        for (const k of ['skills', 'traits', 'traitsKnown', 'trialUntil', 'shifts']) delete e[k]
      }
    for (const b of old.businesses as unknown as Record<string, unknown>[]) delete b.hours
    for (const b of old.businesses)
      for (const p of b.products) {
        p.stock = stockOf(p as never)
        p.supplier = 'premium'
        delete p.batches
        delete p.supplierId
        delete p.auto
      }
    const migrated = migrate(old as unknown as GameState)!
    expect(migrated.version).toBe(9)
    expect(migrated.inbox).toHaveLength(4)
    expect(migrated.objectivesDone).toContain('open_first')
    expect(migrated.businesses[0].rentMult).toBe(1)
    expect(migrated.businesses[0].products.map(stockOf)).toEqual(stockBefore)
    const sup = migrated.suppliers.find((x) => x.id === migrated.businesses[0].products[0].supplierId)!
    expect(sup.tier).toBe('premium')
    const e = migrated.businesses[0].employees[0]
    expect(e.skills.service).toBe(60)
    expect(e.traits).toHaveLength(2)
    expect(e.shifts).toHaveLength(2)
    expect(migrated.businesses[0].hours).toEqual([true, true, true])
    expect(() => tick(migrated)).not.toThrow()
  })
})
