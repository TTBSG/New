import { hire } from './engine'
import { getSector } from './sectors'
import { level, postJob } from './staff'
import type { GameState } from './types'

/** Embauche `n` employés de service dans un commerce, en passant des annonces si besoin (pour les tests). */
export function hireStaff(s: GameState, businessId: string, n: number): GameState {
  const b = s.businesses.find((x) => x.id === businessId)!
  const role = getSector(b.sectorId).roles.find((r) => r.capacity > 0)!
  for (let i = 0; i < n; i++) {
    let c = s.candidates.filter((x) => x.sectorId === b.sectorId && x.roleId === role.id).sort((a, z) => level(z.skills) - level(a.skills))[0]
    if (!c) {
      s = postJob({ ...s, cash: s.cash + 250 }, b.sectorId, role.id, 'annonce')
      c = s.candidates.filter((x) => x.sectorId === b.sectorId && x.roleId === role.id)[0]
    }
    s = hire(s, businessId, c.id)
  }
  return s
}
