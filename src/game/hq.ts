import { getParcel, isFree, parcelRent } from './city'
import { currentRank } from './objectives'
import { FIRST_NAMES, LAST_NAMES } from './sectors'
import type { GameState, Headquarters, OfficeRole } from './types'
import { clamp, log, newId, pick, randRange, update } from './util'

/** Rang à partir duquel on peut installer un siège social. */
export const HQ_RANK = 3
/** Nombre de commerces gérables sans siège. */
export const SHOPS_WITHOUT_HQ = 3

export const HQ_LEVELS = [
  { name: 'Petit bureau', cost: 20000, rentMult: 1, desks: 3, maxShops: 6, height: 52 },
  { name: 'Plateau de bureaux', cost: 45000, rentMult: 2, desks: 6, maxShops: 12, height: 80 },
  { name: 'Tour de bureaux', cost: 120000, rentMult: 4, desks: 12, maxShops: Infinity, height: 118 },
]

export const OFFICE_ROLES: Record<OfficeRole, { name: string; baseSalary: number; effect: string }> = {
  acheteur: { name: 'Acheteur', baseSalary: 3200, effect: 'Remise sur toutes les commandes fournisseurs (jusqu\'à −3 % chacun, 2 au maximum).' },
  recruteur: { name: 'Responsable RH', baseSalary: 3000, effect: 'Mène tous les entretiens, accorde les congés, gère les avantages sociaux et attire de meilleurs candidats (+6 de compétence chacun, 2 au maximum).' },
  marketing: { name: 'Responsable marketing', baseSalary: 3400, effect: '+4 % de visiteurs dans tous vos commerces (3 au maximum).' },
  logisticien: { name: 'Directeur logistique', baseSalary: 3600, effect: 'Livraisons plus fiables (+3 points chacun, 2 au maximum). Indispensable pour les entrepôts.' },
  comptable: { name: 'Contrôleur de gestion', baseSalary: 3000, effect: 'Taux de vos prêts réduit d\'un point chacun (2 au maximum).' },
}

export const hqUnlocked = (s: GameState) => currentRank(s) >= HQ_RANK
export const hqLevel = (hq: Headquarters) => HQ_LEVELS[hq.level - 1]

export function maxBusinesses(s: GameState): number {
  return s.hq ? hqLevel(s.hq).maxShops : SHOPS_WITHOUT_HQ
}

export function hqRent(s: GameState): number {
  return s.hq ? parcelRent(getParcel(s.city, s.hq.parcelId)) * hqLevel(s.hq).rentMult : 0
}

export function hqMonthlyCost(s: GameState): number {
  return s.hq ? hqRent(s) + s.hq.staff.reduce((a, e) => a + e.salary, 0) : 0
}

/** Nombre d'employés d'un rôle, plafonné. */
export function staffCount(s: GameState, role: OfficeRole, cap: number): number {
  return Math.min(cap, s.hq?.staff.filter((e) => e.role === role).length ?? 0)
}

// ---------- Effets du siège sur le reste du jeu ----------

/** Remise des acheteurs : de 1 à 3 % chacun selon la compétence. */
export function purchasingRate(s: GameState): number {
  const buyers = (s.hq?.staff.filter((e) => e.role === 'acheteur') ?? []).sort((a, b) => b.skill - a.skill).slice(0, 2)
  return buyers.reduce((r, e) => r + 0.01 + (e.skill / 100) * 0.02, 0)
}
export const recruitingBoost = (s: GameState) => 6 * staffCount(s, 'recruteur', 2)
export const marketingBoost = (s: GameState) => 0.04 * staffCount(s, 'marketing', 3)
export const reliabilityBoost = (s: GameState) => 0.03 * staffCount(s, 'logisticien', 2)
export const loanRateCut = (s: GameState) => 0.01 * staffCount(s, 'comptable', 2)

/** Réputation de départ d'un nouveau commerce : la marque compte. */
export function startingReputation(s: GameState): number {
  if (!s.hq) return 50
  const prestige = getParcel(s.city, s.hq.parcelId).districtId === 'affaires' ? 5 : 0
  return clamp(50 + 3 + prestige + 3 * staffCount(s, 'marketing', 3), 0, 100)
}

export const canDelegate = (s: GameState, role: OfficeRole) => staffCount(s, role, 1) > 0

// ---------- Candidats de bureau ----------

export function officeFairSalary(role: OfficeRole, skill: number): number {
  return OFFICE_ROLES[role].baseSalary * (0.8 + skill / 160)
}

export function refreshOfficeCandidates(s: GameState) {
  s.officeCandidates = []
  for (const role of Object.keys(OFFICE_ROLES) as OfficeRole[]) {
    for (let i = 0; i < 2; i++) {
      const skill = Math.round(randRange(s, 25, 95))
      s.officeCandidates.push({
        id: newId(s, 'oc'),
        name: `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`,
        role,
        skill,
        salary: Math.round((officeFairSalary(role, skill) * randRange(s, 0.95, 1.05)) / 10) * 10,
        hiredDay: 0,
      })
    }
  }
}

/** Loyer + salaires du siège, prélevés chaque jour. Renvoie le montant. */
export function payHq(s: GameState): number {
  if (!s.hq) return 0
  const cost = hqMonthlyCost(s) / 30
  s.cash -= cost
  for (const e of s.hq.staff) e.skill = Math.min(100, e.skill + 0.03)
  return cost
}

// ---------- Actions du joueur ----------

const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

export function openHq(state: GameState, parcelId: string): GameState {
  const parcel = state.city.parcels.find((p) => p.id === parcelId)
  if (state.hq || !parcel || parcel.kind !== 'lot' || !isFree(state, parcel) || !hqUnlocked(state)) return state
  const cost = HQ_LEVELS[0].cost + parcelRent(parcel) * 2
  if (state.cash < cost) return state
  return update(state, (s) => {
    s.cash -= cost
    s.hq = {
      parcelId,
      level: 1,
      staff: [],
      policies: { autoReplace: false, raiseLimit: 0, autoNegotiate: false, autoStock: false, mutuelle: false, tickets: false, prime: false },
      openedDay: s.day,
    }
    log(s, `Votre siège social s'installe au ${parcel.address} !`, 'good')
  })
}

export function hqOpeningCost(state: GameState, parcelId: string): number {
  return HQ_LEVELS[0].cost + parcelRent(getParcel(state.city, parcelId)) * 2
}

export function upgradeHq(state: GameState): GameState {
  const hq = state.hq
  if (!hq || hq.level >= HQ_LEVELS.length) return state
  const next = HQ_LEVELS[hq.level]
  if (state.cash < next.cost) return state
  return update(state, (s) => {
    s.cash -= next.cost
    s.hq!.level++
    log(s, `Le siège passe au niveau « ${next.name} » : jusqu'à ${next.maxShops === Infinity ? 'un nombre illimité de' : next.maxShops} commerces.`, 'good')
  })
}

export function hireOffice(state: GameState, candidateId: string): GameState {
  const c = state.officeCandidates.find((x) => x.id === candidateId)
  if (!state.hq || !c || state.hq.staff.length >= hqLevel(state.hq).desks) return state
  return update(state, (s) => {
    s.officeCandidates = s.officeCandidates.filter((x) => x.id !== candidateId)
    s.hq!.staff.push({ ...c, hiredDay: s.day })
    log(s, `${c.name} rejoint le siège (${OFFICE_ROLES[c.role].name}).`)
  })
}

export function fireOffice(state: GameState, employeeId: string): GameState {
  const e = state.hq?.staff.find((x) => x.id === employeeId)
  if (!e) return state
  return update(state, (s) => {
    s.cash -= Math.round(e.salary / 2)
    s.hq!.staff = s.hq!.staff.filter((x) => x.id !== employeeId)
    log(s, `${e.name} quitte le siège (indemnité ${eur(e.salary / 2)}).`)
  })
}

export function setPolicy<K extends keyof Headquarters['policies']>(state: GameState, key: K, value: Headquarters['policies'][K]): GameState {
  if (!state.hq) return state
  return update(state, (s) => {
    s.hq!.policies[key] = value
  })
}
