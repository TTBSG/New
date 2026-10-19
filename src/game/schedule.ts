import { getSector } from './sectors'
import { capacityMult } from './staff'
import type { Business, Employee, GameState, Slot } from './types'
import { log, update } from './util'

export const SLOTS: Slot[] = [0, 1, 2]
export const SLOT_NAMES = ['Matin', 'Midi', 'Soir'] as const
export const SLOT_HOURS = ['7h – 11h', '11h – 16h', '16h – 21h'] as const

/** Part de la capacité journalière d'un rôle assurée sur un créneau. */
export const SLOT_CAPACITY = 0.6
/** Salaire versé selon le nombre de créneaux : temps partiel, temps plein, heures sup. */
export const PAY_FACTOR = [0, 0.5, 1, 1.6]
export const CONTRACT_NAMES = ['', 'Temps partiel', 'Temps plein', 'Heures sup']
/** Énergie et charges par créneau ouvert et par jour, en part du coût d'aménagement. */
export const UTILITIES_RATE = 0.0003

export const payOf = (e: Employee) => e.salary * PAY_FACTOR[e.shifts.length]
export const isManager = (b: Business, e: Employee) => getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!.capacity === 0

/** Clients servis par un employé sur un créneau. */
export function employeeSlotCapacity(b: Business, e: Employee): number {
  const role = getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!
  return role.capacity * SLOT_CAPACITY * (0.7 + e.skills.service / 170) * (0.8 + e.morale / 250) * capacityMult(e)
}

/** Capacité de service par créneau (0 si fermé). Un manager présent booste jusqu'à 5 employés du créneau. */
export function slotCapacity(b: Business): number[] {
  return SLOTS.map((slot) => {
    if (!b.hours[slot]) return 0
    const team = b.employees.filter((e) => e.shifts.includes(slot))
    const staff = team.filter((e) => !isManager(b, e))
    const managers = team.length - staff.length
    const cap = staff.reduce((a, e) => a + employeeSlotCapacity(b, e), 0)
    return cap * (1 + 0.12 * Math.min(managers, Math.ceil(staff.length / 5)))
  })
}

/** Répartition des clients sur les créneaux ouverts (les créneaux fermés perdent leurs clients). */
export function slotShares(b: Business): number[] {
  const share = getSector(b.sectorId).slotShare
  return SLOTS.map((slot) => (b.hours[slot] ? share[slot] : 0))
}

/** Place un employé sur ses n meilleurs créneaux, là où il manque le plus de monde. */
function assign(b: Business, e: Employee, n: number, demand: number) {
  const open = SLOTS.filter((slot) => b.hours[slot])
  e.shifts = []
  const cap = slotCapacity(b)
  const share = slotShares(b)
  const manager = isManager(b, e)
  const staffOn = (slot: Slot) => b.employees.filter((x) => x.shifts.includes(slot) && !isManager(b, x)).length
  const managersOn = (slot: Slot) => b.employees.filter((x) => x.shifts.includes(slot) && isManager(b, x)).length
  const need = (slot: Slot) => (manager ? staffOn(slot) - 5 * managersOn(slot) + share[slot] : share[slot] * demand - cap[slot])
  e.shifts = [...open]
    .sort((x, y) => need(y) - need(x))
    .slice(0, Math.min(n, open.length))
    .sort()
}

function demandEstimate(b: Business): number {
  const last = b.history.at(-1)
  if (last?.slotDemand) return last.slotDemand.reduce((a, x) => a + x, 0) / Math.max(0.01, slotShares(b).reduce((a, x) => a + x, 0))
  if (last) return last.demand
  return getSector(b.sectorId).roles[0].capacity * Math.max(1, b.employees.length)
}

/** Planning automatique : garde le contrat de chacun et répartit l'équipe selon l'affluence. */
export function planTeam(b: Business) {
  const demand = demandEstimate(b)
  const counts = new Map(b.employees.map((e) => [e.id, Math.max(1, e.shifts.length)]))
  for (const e of b.employees) e.shifts = []
  const order = [...b.employees].sort((x, y) => Number(isManager(b, x)) - Number(isManager(b, y)) || counts.get(y.id)! - counts.get(x.id)! || employeeSlotCapacity(b, y) - employeeSlotCapacity(b, x))
  for (const e of order) assign(b, e, counts.get(e.id)!, demand)
}

/** Créneaux d'un nouvel employé : temps plein, là où il manque du monde. */
export function placeNewcomer(b: Business, e: Employee, n = 2) {
  assign(b, e, n, demandEstimate(b))
}

// ---------- Actions du joueur ----------

function withBusiness(state: GameState, businessId: string, fn: (s: GameState, b: Business) => void): GameState {
  if (!state.businesses.some((b) => b.id === businessId)) return state
  return update(state, (s) => fn(s, s.businesses.find((b) => b.id === businessId)!))
}

export function setHours(state: GameState, businessId: string, slot: Slot, open: boolean): GameState {
  const b = state.businesses.find((x) => x.id === businessId)
  if (!b || b.hours[slot] === open || (!open && b.hours.filter(Boolean).length <= 1)) return state
  return withBusiness(state, businessId, (s, b) => {
    b.hours[slot] = open
    if (!open)
      for (const e of b.employees) {
        if (!e.shifts.includes(slot)) continue
        const n = e.shifts.length
        e.shifts = e.shifts.filter((x) => x !== slot)
        // Pas de chômage technique : on le replace sur un autre créneau ouvert s'il y en a un.
        const free = SLOTS.find((x) => b.hours[x] && !e.shifts.includes(x))
        if (free !== undefined && e.shifts.length < n) e.shifts = [...e.shifts, free].sort()
      }
    log(s, `${b.name} : ${open ? 'ouverture' : 'fermeture'} le ${SLOT_NAMES[slot].toLowerCase()}.`)
  })
}

export function toggleShift(state: GameState, businessId: string, employeeId: string, slot: Slot): GameState {
  return withBusiness(state, businessId, (_, b) => {
    const e = b.employees.find((x) => x.id === employeeId)
    if (!e || !b.hours[slot]) return
    if (e.shifts.includes(slot)) {
      if (e.shifts.length > 1) e.shifts = e.shifts.filter((x) => x !== slot)
    } else e.shifts = [...e.shifts, slot].sort()
  })
}

export function autoPlan(state: GameState, businessId: string): GameState {
  return withBusiness(state, businessId, (_, b) => planTeam(b))
}
