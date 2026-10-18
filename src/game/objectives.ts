import { getSector } from './sectors'
import type { GameState } from './types'
import { log } from './util'

/** Secteurs disponibles dès le début ; les autres se débloquent en montant de rang. */
export const STARTING_SECTORS = ['cafe', 'boulangerie', 'superette']

interface ObjectiveDef {
  id: string
  rank: number
  title: string
  /** Progression actuelle et cible, pour la barre d'avancement. */
  progress: (s: GameState) => [number, number]
  /** Prime versée à la réussite. */
  prime: number
}

export interface RankDef {
  rank: number
  title: string
  /** Récompenses du rang complété. */
  unlockSectors: string[]
  unlockApps: string[]
  prime: number
}

const serviceStaff = (s: GameState) =>
  s.businesses.reduce((n, b) => n + b.employees.filter((e) => getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!.capacity > 0).length, 0)
const staff = (s: GameState) => s.businesses.reduce((n, b) => n + b.employees.length, 0)
const bestReputation = (s: GameState) => Math.max(0, ...s.businesses.map((b) => Math.round(b.reputation)))
export const groupProfit30 = (s: GameState) => s.businesses.reduce((sum, b) => sum + b.history.slice(-30).reduce((a, r) => a + r.profit, 0), 0)
const sectorsOwned = (s: GameState) => new Set(s.businesses.map((b) => b.sectorId)).size

/** La valeur nette est fournie par le moteur pour éviter une dépendance circulaire. */
let netWorthOf: (s: GameState) => number = () => 0
export function setNetWorth(fn: (s: GameState) => number) {
  netWorthOf = fn
}

export const RANKS: RankDef[] = [
  { rank: 1, title: 'Premiers pas', unlockSectors: ['restaurant', 'vetements'], unlockApps: ['Fournisseurs'], prime: 3000 },
  { rank: 2, title: 'Boutique de quartier', unlockSectors: ['electronique'], unlockApps: ['Siège'], prime: 8000 },
  { rank: 3, title: 'Petite enseigne', unlockSectors: [], unlockApps: ['Logistique'], prime: 15000 },
  { rank: 4, title: 'Réseau local', unlockSectors: [], unlockApps: [], prime: 30000 },
  { rank: 5, title: 'Empire', unlockSectors: [], unlockApps: [], prime: 0 },
]

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'open_first', rank: 1, title: 'Ouvrir un premier commerce', progress: (s) => [Math.min(1, s.businesses.length), 1], prime: 0 },
  { id: 'hire_first', rank: 1, title: 'Embaucher un premier employé', progress: (s) => [Math.min(1, serviceStaff(s)), 1], prime: 500 },
  { id: 'first_sales', rank: 1, title: 'Gagner 2 000 € de bénéfice au total', progress: (s) => [Math.max(0, Math.round(s.stats.totalProfit)), 2000], prime: 1000 },

  { id: 'rep_60', rank: 2, title: 'Atteindre 60 de réputation', progress: (s) => [bestReputation(s), 60], prime: 2000 },
  { id: 'two_shops', rank: 2, title: 'Posséder 2 commerces', progress: (s) => [s.businesses.length, 2], prime: 2000 },
  { id: 'month_5k', rank: 2, title: 'Faire 5 000 € de bénéfice sur 30 jours', progress: (s) => [Math.max(0, Math.round(groupProfit30(s))), 5000], prime: 3000 },

  { id: 'staff_8', rank: 3, title: 'Avoir 8 employés', progress: (s) => [staff(s), 8], prime: 3000 },
  { id: 'three_shops', rank: 3, title: 'Posséder 3 commerces', progress: (s) => [s.businesses.length, 3], prime: 4000 },
  { id: 'networth_200k', rank: 3, title: 'Atteindre 200 000 € de valeur nette', progress: (s) => [Math.max(0, Math.round(netWorthOf(s))), 200000], prime: 5000 },

  { id: 'rep_80', rank: 4, title: 'Atteindre 80 de réputation', progress: (s) => [bestReputation(s), 80], prime: 5000 },
  { id: 'five_shops', rank: 4, title: 'Posséder 5 commerces', progress: (s) => [s.businesses.length, 5], prime: 8000 },
  { id: 'month_30k', rank: 4, title: 'Faire 30 000 € de bénéfice sur 30 jours', progress: (s) => [Math.max(0, Math.round(groupProfit30(s))), 30000], prime: 10000 },

  { id: 'all_sectors', rank: 5, title: 'Être présent dans les 6 secteurs', progress: (s) => [sectorsOwned(s), 6], prime: 20000 },
  { id: 'ten_shops', rank: 5, title: 'Posséder 10 commerces', progress: (s) => [s.businesses.length, 10], prime: 25000 },
  { id: 'millionaire', rank: 5, title: 'Devenir millionnaire (valeur nette)', progress: (s) => [Math.max(0, Math.round(netWorthOf(s))), 1000000], prime: 50000 },
]

/** Rang actuel : le premier dont tous les objectifs ne sont pas encore atteints (6 = tout est fini). */
export function currentRank(s: GameState): number {
  for (const r of RANKS) if (OBJECTIVES.some((o) => o.rank === r.rank && !s.objectivesDone.includes(o.id))) return r.rank
  return RANKS.length + 1
}

export function rankTitle(rank: number): string {
  return RANKS.find((r) => r.rank === rank)?.title ?? 'Légende des affaires'
}

export function activeObjectives(s: GameState) {
  const rank = currentRank(s)
  return OBJECTIVES.filter((o) => o.rank === rank).map((o) => {
    const [cur, target] = o.progress(s)
    return { ...o, current: Math.min(cur, target), target, done: s.objectivesDone.includes(o.id) }
  })
}

export const isSectorUnlocked = (s: GameState, sectorId: string) => s.unlockedSectors.includes(sectorId)

/** Rang nécessaire pour débloquer un secteur (0 s'il est disponible d'emblée). */
export function sectorUnlockRank(sectorId: string): number {
  return RANKS.find((r) => r.unlockSectors.includes(sectorId))?.rank ?? 0
}

const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

/**
 * Valide les objectifs atteints et verse les récompenses.
 * Renvoie les messages à envoyer par la conseillère (le moteur s'en charge pour éviter une dépendance circulaire).
 */
export function checkObjectives(s: GameState): string[][] {
  const notes: string[][] = []
  for (let guard = 0; guard < OBJECTIVES.length; guard++) {
    const rank = currentRank(s)
    const reached = OBJECTIVES.filter((o) => o.rank === rank && !s.objectivesDone.includes(o.id) && o.progress(s)[0] >= o.progress(s)[1])
    if (!reached.length) break
    for (const o of reached) {
      s.objectivesDone.push(o.id)
      s.cash += o.prime
      log(s, `Objectif atteint : ${o.title}${o.prime ? ` (prime ${eur(o.prime)})` : ''}.`, 'good')
      s.celebrations.push({ id: o.id, title: o.title, prime: o.prime, rankUp: null })
    }
    // Rang complété ?
    if (currentRank(s) > rank) {
      const r = RANKS.find((x) => x.rank === rank)!
      s.cash += r.prime
      for (const id of r.unlockSectors) if (!s.unlockedSectors.includes(id)) s.unlockedSectors.push(id)
      const unlocked = r.unlockSectors.map((id) => getSector(id).name.toLowerCase())
      s.celebrations.push({ id: `rank${rank}`, title: rankTitle(rank + 1), prime: r.prime, rankUp: rank + 1 })
      log(s, `Nouveau rang : ${rankTitle(rank + 1)} !`, 'good')
      notes.push([
        `Bravo, vous passez au rang « ${rankTitle(rank + 1)} » ! 🎉`,
        [
          r.prime ? `Une prime de ${eur(r.prime)} vous est versée.` : '',
          unlocked.length ? `Vous pouvez désormais ouvrir : ${unlocked.join(', ')}.` : '',
          r.unlockApps.includes('Fournisseurs') ? 'Nouvelle appli sur votre téléphone : Fournisseurs. Choisissez vos fournisseurs, comparez qualité, prix et délais, et passez vos propres commandes.' : '',
          r.unlockApps.includes('Logistique') ? 'Nouvelle appli : Logistique. Avec un directeur logistique au siège, ouvrez des entrepôts dans la zone commerciale pour acheter en gros et livrer vos boutiques chaque nuit.' : '',
          r.unlockApps.includes('Siège') ? 'Vous pouvez désormais installer votre siège social sur un local libre : il permet de dépasser 3 commerces et d\'embaucher des employés de bureau. Tout se gère dans la nouvelle appli Siège.' : '',
          'Vos nouveaux objectifs sont dans l\'appli Objectifs.',
        ]
          .filter(Boolean)
          .join(' '),
      ])
    }
  }
  return notes
}
