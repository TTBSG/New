import { canDelegate } from './hq'
import { placeNewcomer } from './schedule'
import { getSector } from './sectors'
import { HIRING_CHANNELS, employeeFromCandidate, fairSalary, level, makeCandidate } from './staff'
import type { Business, Employee, GameState } from './types'
import { log } from './util'

/** Délégation : le responsable RH remplace un employé parti (démission ou débauchage). */
export function autoReplace(s: GameState, b: Business, gone: Employee) {
  if (!s.hq?.policies.autoReplace || !canDelegate(s, 'recruteur')) return
  const role = getSector(b.sectorId).roles.find((r) => r.id === gone.roleId)!
  const best = () =>
    s.candidates
      .filter((x) => x.sectorId === b.sectorId && x.roleId === gone.roleId && x.salary <= fairSalary(role.baseSalary, level(x.skills)) * 1.05)
      .sort((x, y) => level(y.skills) - level(x.skills))[0]
  let c = best()
  // Personne de convenable : la RH passe une annonce.
  if (!c && s.cash >= HIRING_CHANNELS.annonce.cost) {
    s.cash -= HIRING_CHANNELS.annonce.cost
    for (let i = 0; i < HIRING_CHANNELS.annonce.count; i++) s.candidates.push(makeCandidate(s, b.sectorId, gone.roleId, 'annonce'))
    c = best() ?? s.candidates.filter((x) => x.sectorId === b.sectorId && x.roleId === gone.roleId).sort((x, y) => level(y.skills) - level(x.skills))[0]
  }
  if (!c) return
  s.candidates = s.candidates.filter((x) => x.id !== c.id)
  const e = employeeFromCandidate(s, c)
  const shifts = gone.shifts.filter((slot) => b.hours[slot])
  if (shifts.length) e.shifts = shifts
  else placeNewcomer(b, e, gone.shifts.length)
  b.employees.push(e)
  log(s, `Le siège a recruté ${c.name} pour remplacer ${gone.name} chez ${b.name}.`)
}
