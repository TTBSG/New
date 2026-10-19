import { canDelegate, recruitingBoost } from './hq'
import { FIRST_NAMES, LAST_NAMES, SECTORS, getSector } from './sectors'
import type { Business, Candidate, Employee, GameState, HiringSource, Skills, TraitId } from './types'
import { clamp, log, newId, pick, rand, randRange, update } from './util'

// ---------- Traits de caractère ----------

export const TRAITS: Record<TraitId, { name: string; positive: boolean; text: string }> = {
  rapide: { name: 'Rapide', positive: true, text: 'Sert 15 % de clients en plus.' },
  souriant: { name: 'Souriant', positive: true, text: 'Les clients adorent : meilleure qualité de service.' },
  vendeur: { name: 'Vendeur né', positive: true, text: 'Fait grimper le panier moyen.' },
  fiable: { name: 'Fiable', positive: true, text: 'Moral solide, se plaint rarement.' },
  ambitieux: { name: 'Ambitieux', positive: true, text: 'Progresse deux fois plus vite, mais vise un meilleur salaire.' },
  mentor: { name: 'Mentor', positive: true, text: 'Ses collègues progressent 50 % plus vite.' },
  raleur: { name: 'Râleur', positive: false, text: "Plombe l'ambiance : le moral de l'équipe baisse." },
  distrait: { name: 'Tête en l\'air', positive: false, text: 'Plus lent et moins soigneux.' },
  paresseux: { name: 'Nonchalant', positive: false, text: 'Travaille au ralenti, mais demande un salaire modeste.' },
}
const POSITIVE = (Object.keys(TRAITS) as TraitId[]).filter((t) => TRAITS[t].positive)
const NEGATIVE = (Object.keys(TRAITS) as TraitId[]).filter((t) => !TRAITS[t].positive)

export const SKILL_LABELS: Record<keyof Skills, string> = { service: 'Service', vente: 'Vente', qualite: 'Qualité' }

/** Durée de la période d'essai (jours). */
export const TRIAL_DAYS = 14
/** Après ce délai, on connaît le caractère d'un employé même sans entretien. */
export const TRAITS_DISCOVERY_DAYS = 21
/** Entretiens possibles par jour pour le dirigeant (illimités avec un responsable RH au siège). */
export const INTERVIEWS_PER_DAY = 3
export const HIRING_CHANNELS: Record<Exclude<HiringSource, 'spontane'>, { name: string; cost: number; count: number; skills: [number, number]; text: string }> = {
  annonce: { name: 'Annonce', cost: 250, count: 4, skills: [20, 88], text: '4 candidats pendant une semaine.' },
  cabinet: { name: 'Cabinet de recrutement', cost: 1200, count: 3, skills: [55, 95], text: '3 profils solides, dossier complet (caractère connu).' },
}

export const has = (e: { traits: TraitId[] }, t: TraitId) => e.traits.includes(t)

export function level(skills: Skills): number {
  return Math.round((skills.service + skills.vente + skills.qualite) / 3)
}

/** Salaire attendu sur le marché pour un niveau de compétence donné. */
export function fairSalary(baseSalary: number, skill: number): number {
  return baseSalary * (0.8 + skill / 160)
}

// ---------- Effets sur le commerce ----------

export function capacityMult(e: Employee): number {
  return (has(e, 'rapide') ? 1.15 : 1) * (has(e, 'distrait') ? 0.9 : 1) * (has(e, 'paresseux') ? 0.85 : 1)
}

export const effectiveVente = (e: Employee) => clamp(e.skills.vente + (has(e, 'vendeur') ? 15 : 0), 0, 100)
export const effectiveQualite = (e: Employee) => clamp(e.skills.qualite + (has(e, 'souriant') ? 15 : 0) - (has(e, 'distrait') ? 10 : 0), 0, 100)

/** Bonus de panier moyen apporté par l'équipe de vente (de −10 % à +10 %). */
export function salesFactor(team: Employee[]): number {
  if (!team.length) return 1
  const avg = team.reduce((a, e) => a + effectiveVente(e), 0) / team.length
  return 1 + (avg - 50) / 500
}

/** Qualité de service moyenne de l'équipe (sert à la réputation). */
export function serviceQuality(team: Employee[]): number {
  if (!team.length) return 0
  return team.reduce((a, e) => a + effectiveQualite(e), 0) / team.length
}

// ---------- Candidats ----------

function randomTraits(s: GameState): TraitId[] {
  const traits: TraitId[] = []
  while (traits.length < 2) {
    const t = pick(s, rand(s) < 0.7 ? POSITIVE : NEGATIVE)
    if (!traits.includes(t)) traits.push(t)
  }
  return traits
}

function randomSkills(s: GameState, min: number, max: number, boost: number): Skills {
  const base = randRange(s, min, max)
  const one = () => Math.round(clamp(base + randRange(s, -12, 12) + boost, 5, 100))
  return { service: one(), vente: one(), qualite: one() }
}

export function makeCandidate(s: GameState, sectorId: string, roleId: string, source: HiringSource): Candidate {
  const role = getSector(sectorId).roles.find((r) => r.id === roleId)!
  const range: [number, number] = source === 'spontane' ? [10, 72] : HIRING_CHANNELS[source].skills
  const skills = randomSkills(s, range[0], range[1], recruitingBoost(s))
  const traits = randomTraits(s)
  // Le caractère se devine dans les prétentions salariales.
  const expectation = (traits.includes('ambitieux') ? 1.08 : 1) * (traits.includes('paresseux') ? 0.9 : 1)
  return {
    id: newId(s, 'c'),
    name: `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`,
    sectorId,
    roleId,
    skills,
    traits,
    // Un cabinet fournit un dossier complet ; un responsable RH mène les entretiens à votre place.
    traitsKnown: source === 'cabinet' || canDelegate(s, 'recruteur'),
    salary: Math.round((fairSalary(role.baseSalary, level(skills)) * expectation * randRange(s, 0.95, 1.05)) / 10) * 10,
    source,
    expiresDay: s.day + 7,
  }
}

/** Chaque lundi : nouvelles candidatures spontanées ; les candidats des annonces restent jusqu'à leur échéance. */
export function refreshCandidates(s: GameState) {
  s.candidates = s.candidates.filter((c) => c.source !== 'spontane' && c.expiresDay >= s.day)
  for (const sector of SECTORS) {
    for (const role of sector.roles) {
      const count = role.capacity > 0 ? 2 : 1
      for (let i = 0; i < count; i++) s.candidates.push(makeCandidate(s, sector.id, role.id, 'spontane'))
    }
  }
}

export function interviewsLeft(s: GameState): number {
  if (canDelegate(s, 'recruteur')) return Infinity
  return s.interviews.day === s.day ? Math.max(0, INTERVIEWS_PER_DAY - s.interviews.count) : INTERVIEWS_PER_DAY
}

export function employeeFromCandidate(s: GameState, c: Candidate): Employee {
  return { id: c.id, name: c.name, roleId: c.roleId, skills: { ...c.skills }, traits: [...c.traits], traitsKnown: c.traitsKnown, salary: c.salary, morale: 65, hiredDay: s.day, trialUntil: s.day + TRIAL_DAYS, shifts: [0, 1] }
}

// ---------- Journée des employés ----------

/** Progression, moral et départs. Renvoie les employés qui démissionnent. */
export function employeesDay(s: GameState, b: Business, loadOf: (e: Employee) => number): Employee[] {
  const sector = getSector(b.sectorId)
  const roleOf = (e: Employee) => sector.roles.find((r) => r.id === e.roleId)!
  const hasManager = b.employees.some((e) => roleOf(e).capacity === 0)
  const mentors = b.employees.filter((e) => has(e, 'mentor'))
  const grumpy = b.employees.filter((e) => has(e, 'raleur'))
  const quits: Employee[] = []

  b.employees = b.employees.filter((e) => {
    const role = roleOf(e)
    // Progression avec l'expérience.
    const speed = (has(e, 'ambitieux') ? 2 : 1) * (mentors.some((m) => m.id !== e.id) ? 1.5 : 1)
    for (const k of ['service', 'vente', 'qualite'] as const) {
      const gain = (k === 'service' ? 0.04 : 0.03) * speed * (e.skills[k] > 70 ? 0.5 : 1)
      e.skills[k] = Math.min(100, e.skills[k] + gain)
    }
    // Moral : salaire, charge de travail, manager, ambiance.
    const others = grumpy.filter((g) => g.id !== e.id).length
    const moraleTarget = clamp(
      55 +
        (e.salary / fairSalary(role.baseSalary, level(e.skills)) - 1) * 150 -
        Math.min(30, Math.max(0, loadOf(e) - 1) * 25) -
        // Les heures sup fatiguent.
        (e.shifts.length >= 3 ? 12 : 0) +
        (hasManager ? 10 : 0) +
        (has(e, 'fiable') ? 5 : 0) -
        Math.min(12, others * 6),
      0,
      100,
    )
    e.morale = clamp(e.morale + (moraleTarget - e.morale) * 0.05, 0, 100)
    // On finit par connaître le caractère de chacun.
    if (!e.traitsKnown && s.day - e.hiredDay >= TRAITS_DISCOVERY_DAYS) {
      e.traitsKnown = true
      log(s, `Vous connaissez mieux ${e.name} (${b.name}) : ${e.traits.map((t) => TRAITS[t].name.toLowerCase()).join(' et ')}.`)
    }
    if (e.morale < 20 && rand(s) < (has(e, 'fiable') ? 0.005 : 0.015)) {
      log(s, `${e.name} a démissionné de ${b.name} (moral trop bas).`, 'bad')
      quits.push(e)
      return false
    }
    return true
  })
  return quits
}

// ---------- Actions du joueur ----------

export function postJob(state: GameState, sectorId: string, roleId: string, channel: Exclude<HiringSource, 'spontane'>): GameState {
  const cfg = HIRING_CHANNELS[channel]
  if (state.cash < cfg.cost || !getSector(sectorId).roles.some((r) => r.id === roleId)) return state
  return update(state, (s) => {
    s.cash -= cfg.cost
    for (let i = 0; i < cfg.count; i++) s.candidates.push(makeCandidate(s, sectorId, roleId, channel))
    const role = getSector(sectorId).roles.find((r) => r.id === roleId)!
    log(s, `${cfg.name} publiée pour un poste de ${role.name.toLowerCase()} : ${cfg.count} candidats.`)
  })
}

export function interview(state: GameState, candidateId: string): GameState {
  const c = state.candidates.find((x) => x.id === candidateId)
  if (!c || c.traitsKnown || interviewsLeft(state) <= 0) return state
  return update(state, (s) => {
    s.candidates.find((x) => x.id === candidateId)!.traitsKnown = true
    s.interviews = s.interviews.day === s.day ? { day: s.day, count: s.interviews.count + 1 } : { day: s.day, count: 1 }
  })
}

/** Nouveau caractère pour un employé d'une ancienne sauvegarde. */
export function migrateEmployee(s: GameState, e: Employee & { skill?: number }) {
  const base = e.skill ?? 50
  e.skills = { service: Math.round(base), vente: Math.round(clamp(base + randRange(s, -10, 10), 5, 100)), qualite: Math.round(clamp(base + randRange(s, -10, 10), 5, 100)) }
  e.traits = randomTraits(s)
  e.traitsKnown = true
  e.trialUntil = 0
  e.shifts = [0, 1]
  delete e.skill
}
