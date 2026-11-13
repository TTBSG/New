import { districtUnlocked } from './city'
import { DISTRICTS, districtOfParcel } from './sectors'
import type { GameState } from './types'

/** Surcroît de passants dans un quartier dont vous êtes le leader : tout le monde connaît votre enseigne. */
export const LEADER_BONUS = 0.06
/** Il faut au moins deux commerces et la moitié des clients du quartier pour en être le leader. */
export const LEADER_SHOPS = 2
export const LEADER_SHARE = 0.5

export interface DistrictStat {
  id: string
  unlocked: boolean
  shops: number
  rivals: number
  /** Clients d'hier : les vôtres et ceux des enseignes concurrentes du quartier. */
  mine: number
  theirs: number
  /** Votre part des clients du quartier (0 à 1). */
  share: number
  leader: boolean
}

/** Rapport de forces quartier par quartier. */
export function districtStats(s: GameState): DistrictStat[] {
  return DISTRICTS.map((d) => {
    const shops = s.businesses.filter((b) => districtOfParcel(b.parcelId).id === d.id)
    const rivals = s.rivals.filter((r) => districtOfParcel(r.parcelId).id === d.id)
    const mine = shops.reduce((a, b) => a + (b.history.at(-1)?.visitors ?? 0), 0)
    const theirs = rivals.reduce((a, r) => a + r.customers, 0)
    const share = mine + theirs > 0 ? mine / (mine + theirs) : 0
    return { id: d.id, unlocked: districtUnlocked(s, d.id), shops: shops.length, rivals: rivals.length, mine, theirs, share, leader: shops.length >= LEADER_SHOPS && mine > 0 && share >= LEADER_SHARE }
  })
}

export const isLeader = (s: GameState, districtId: string) => s.leaders.includes(districtId)
