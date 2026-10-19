import { canDelegate, recruitingBoost } from './hq'
import { FIRST_NAMES, LAST_NAMES, SECTORS, getSector } from './sectors'
import type { AbsenceReason, Business, Candidate, Employee, GameState, HiringSource, SkillId, Skills, TraitId } from './types'
import { clamp, log, newId, pick, rand, randRange, update } from './util'

// ---------- Traits de caractère ----------

export const TRAITS: Record<TraitId, { name: string; positive: boolean; text: string }> = {
  rapide: { name: 'Rapide', positive: true, text: 'Sert 15 % de clients en plus.' },
  souriant: { name: 'Souriant', positive: true, text: 'Les clients adorent : meilleure qualité de service.' },
  vendeur: { name: 'Vendeur né', positive: true, text: 'Fait grimper le panier moyen.' },
  fiable: { name: 'Fiable', positive: true, text: 'Moral solide, se plaint rarement.' },
  ambitieux: { name: 'Ambitieux', positive: true, text: 'Progresse deux fois plus vite, mais vise un meilleur salaire.' },
  mentor: { name: 'Mentor', positive: true, text: 'Ses collègues progressent 50 % plus vite.' },
  endurant: { name: 'Endurant', positive: true, text: 'Encaisse les heures sup : se fatigue deux fois moins.' },
  raleur: { name: 'Râleur', positive: false, text: "Plombe l'ambiance : le moral de l'équipe baisse." },
  distrait: { name: 'Tête en l\'air', positive: false, text: 'Plus lent et moins soigneux.' },
  paresseux: { name: 'Nonchalant', positive: false, text: 'Travaille au ralenti, mais demande un salaire modeste.' },
  fragile: { name: 'Fragile', positive: false, text: 'Se fatigue vite et tombe plus souvent malade.' },
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
  return { id: c.id, name: c.name, roleId: c.roleId, skills: { ...c.skills }, traits: [...c.traits], traitsKnown: c.traitsKnown, salary: c.salary, morale: 65, hiredDay: s.day, trialUntil: s.day + TRIAL_DAYS, shifts: [0, 1], fatigue: 0 }
}

// ---------- Bien-être ----------

export const ABSENCE_NAMES: Record<AbsenceReason, string> = { maladie: 'En arrêt maladie', formation: 'En formation', conges: 'En congés' }

/** Avantages sociaux : gérés par le responsable RH du siège, payés par employé et par mois. */
export const BENEFITS = {
  mutuelle: { name: 'Mutuelle santé', cost: 60, morale: 4, text: '+4 de moral et 40 % d\'arrêts maladie en moins.' },
  tickets: { name: 'Tickets restaurant', cost: 110, morale: 6, text: '+6 de moral pour tout le monde.' },
  prime: { name: 'Prime sur résultats', cost: 150, morale: 5, text: '+5 de moral dans les commerces rentables et deux fois moins de démissions.' },
} as const
export type BenefitId = keyof typeof BENEFITS

export const benefitOn = (s: GameState, k: BenefitId) => !!s.hq?.policies[k] && canDelegate(s, 'recruteur')
export const benefitsPerEmployee = (s: GameState) => (Object.keys(BENEFITS) as BenefitId[]).reduce((a, k) => a + (benefitOn(s, k) ? BENEFITS[k].cost : 0), 0)

const profitable = (b: Business) => b.history.slice(-30).reduce((a, r) => a + r.profit, 0) > 0

/** Détail du moral visé par un employé : chaque ligne explique un bonus ou un malus. */
export function moraleFactors(s: GameState, b: Business, e: Employee, load: number): { label: string; value: number }[] {
  const sector = getSector(b.sectorId)
  const role = sector.roles.find((r) => r.id === e.roleId)!
  const out: { label: string; value: number }[] = [{ label: 'Base', value: 55 }]
  const add = (label: string, value: number) => Math.round(value) !== 0 && out.push({ label, value: Math.round(value) })
  add('Salaire', clamp((e.salary / fairSalary(role.baseSalary, level(e.skills)) - 1) * 150, -30, 30))
  add('Charge de travail', -Math.min(30, Math.max(0, load - 1) * 25))
  add('Fatigue', -Math.max(0, e.fatigue - 40) * 0.5)
  const team = b.employees.filter((x) => x.id !== e.id)
  if (team.some((x) => sector.roles.find((r) => r.id === x.roleId)!.capacity === 0)) add('Un manager encadre', 10)
  else if (team.some((x) => x.chef && x.shifts.some((sl) => e.shifts.includes(sl)))) add("Chef d'équipe présent", 5)
  if (e.chef) add('Fier de sa promotion', 5)
  if (has(e, 'fiable')) add('Caractère fiable', 5)
  add('Ambiance (râleurs)', -Math.min(12, team.filter((x) => has(x, 'raleur')).length * 6))
  for (const k of Object.keys(BENEFITS) as BenefitId[])
    if (benefitOn(s, k) && (k !== 'prime' || profitable(b))) add(BENEFITS[k].name, BENEFITS[k].morale)
  return out
}

export const moraleTarget = (factors: { value: number }[]) => clamp(factors.reduce((a, f) => a + f.value, 0), 0, 100)

/** Fatigue gagnée (ou récupérée) sur une journée de travail. */
export function fatigueDelta(e: Employee, load: number): number {
  if (e.absence) return e.absence.reason === 'formation' ? -5 : -15
  const base = [0, -10, -4, 6][e.shifts.length] + Math.max(0, load - 1) * 8
  if (base <= 0) return base
  return base * (has(e, 'endurant') ? 0.5 : 1) * (has(e, 'fragile') ? 1.5 : 1)
}

export function sickChance(s: GameState, e: Employee): number {
  return (0.0015 + Math.max(0, e.fatigue - 60) / 1500) * (has(e, 'fragile') ? 2 : 1) * (benefitOn(s, 'mutuelle') ? 0.6 : 1)
}

// ---------- Journée des employés ----------

/** Progression, moral, fatigue, absences et départs. Renvoie les employés qui démissionnent. */
export function employeesDay(s: GameState, b: Business, loadOf: (e: Employee) => number): Employee[] {
  const mentors = b.employees.filter((e) => has(e, 'mentor') && !e.absence)
  const quits: Employee[] = []
  const prime = benefitOn(s, 'prime')

  b.employees = b.employees.filter((e) => {
    const load = e.absence ? 0 : loadOf(e)
    // Progression avec l'expérience (pas pendant une absence).
    if (!e.absence) {
      const speed = (has(e, 'ambitieux') ? 2 : 1) * (mentors.some((m) => m.id !== e.id) ? 1.5 : 1)
      for (const k of ['service', 'vente', 'qualite'] as const) {
        const gain = (k === 'service' ? 0.04 : 0.03) * speed * (e.skills[k] > 70 ? 0.5 : 1)
        e.skills[k] = Math.min(100, e.skills[k] + gain)
      }
    }
    e.fatigue = clamp((e.fatigue ?? 0) + fatigueDelta(e, load), 0, 100)
    e.morale = clamp(e.morale + (moraleTarget(moraleFactors(s, b, e, load)) - e.morale) * 0.05, 0, 100)

    // Fin d'absence.
    if (e.absence && s.day >= e.absence.until) {
      if (e.absence.reason === 'formation' && e.absence.skill) {
        e.skills[e.absence.skill] = Math.min(100, e.skills[e.absence.skill] + TRAINING.gain)
        log(s, `${e.name} a terminé sa formation (${SKILL_LABELS[e.absence.skill].toLowerCase()} +${TRAINING.gain}).`, 'good')
      } else log(s, `${e.name} est de retour chez ${b.name}.`)
      e.absence = undefined
    } else if (!e.absence && rand(s) < sickChance(s, e)) {
      const days = 2 + Math.floor(rand(s) * 4)
      e.absence = { reason: 'maladie', until: s.day + days }
      log(s, `${e.name} (${b.name}) est en arrêt maladie pour ${days} jours${e.fatigue > 60 ? ' : trop de fatigue' : ''}.`, 'bad')
    }

    // On finit par connaître le caractère de chacun.
    if (!e.traitsKnown && s.day - e.hiredDay >= TRAITS_DISCOVERY_DAYS) {
      e.traitsKnown = true
      log(s, `Vous connaissez mieux ${e.name} (${b.name}) : ${e.traits.map((t) => TRAITS[t].name.toLowerCase()).join(' et ')}.`)
    }
    const quitChance = (has(e, 'fiable') ? 0.005 : 0.015) * (prime && profitable(b) ? 0.5 : 1)
    if (e.morale < 20 && rand(s) < quitChance) {
      log(s, `${e.name} a démissionné de ${b.name} (moral trop bas).`, 'bad')
      quits.push(e)
      return false
    }
    return true
  })
  return quits
}

// ---------- Formation et promotions ----------

export const TRAINING = { cost: 500, days: 2, gain: 10 }
export const CHEF = { level: 55, days: 45, raise: 0.15, boost: 0.08 }
export const MANAGER_PROMO = { level: 70, days: 90 }

const seniority = (s: GameState, e: Employee) => s.day - e.hiredDay

export function canTrain(s: GameState, e: Employee, skill: SkillId): string | null {
  if (e.absence) return 'Absent en ce moment'
  if (e.skills[skill] >= 95) return 'Déjà au top'
  if (s.cash < TRAINING.cost) return 'Trésorerie insuffisante'
  return null
}

/** Pourquoi la promotion n'est pas possible (null = possible). */
export function promotionBlock(s: GameState, b: Business, e: Employee, to: 'chef' | 'manager'): string | null {
  const sector = getSector(b.sectorId)
  if (sector.roles.find((r) => r.id === e.roleId)!.capacity === 0) return 'Déjà manager'
  if (to === 'chef' && e.chef) return "Déjà chef d'équipe"
  const need = to === 'chef' ? CHEF : MANAGER_PROMO
  if (level(e.skills) < need.level) return `Niveau ${need.level} requis`
  if (seniority(s, e) < need.days) return `${need.days} jours d'ancienneté requis`
  return null
}

export function train(state: GameState, businessId: string, employeeId: string, skill: SkillId): GameState {
  const e = state.businesses.find((b) => b.id === businessId)?.employees.find((x) => x.id === employeeId)
  if (!e || canTrain(state, e, skill)) return state
  return update(state, (s) => {
    const x = s.businesses.find((b) => b.id === businessId)!.employees.find((y) => y.id === employeeId)!
    s.cash -= TRAINING.cost
    x.absence = { reason: 'formation', until: s.day + TRAINING.days, skill }
    log(s, `${x.name} part ${TRAINING.days} jours en formation (${SKILL_LABELS[skill].toLowerCase()}).`)
  })
}

export function promote(state: GameState, businessId: string, employeeId: string, to: 'chef' | 'manager'): GameState {
  const b0 = state.businesses.find((b) => b.id === businessId)
  const e0 = b0?.employees.find((x) => x.id === employeeId)
  if (!b0 || !e0 || promotionBlock(state, b0, e0, to)) return state
  return update(state, (s) => {
    const b = s.businesses.find((x) => x.id === businessId)!
    applyPromotion(s, b, b.employees.find((x) => x.id === employeeId)!, to)
  })
}

export function applyPromotion(s: GameState, b: Business, e: Employee, to: 'chef' | 'manager') {
  if (to === 'chef') {
    e.chef = true
    e.salary = Math.round((e.salary * (1 + CHEF.raise)) / 10) * 10
    log(s, `${e.name} devient chef d'équipe chez ${b.name}.`, 'good')
  } else {
    const manager = getSector(b.sectorId).roles.find((r) => r.capacity === 0)!
    e.roleId = manager.id
    e.chef = false
    e.salary = Math.max(e.salary, Math.round(fairSalary(manager.baseSalary, level(e.skills)) / 10) * 10)
    log(s, `${e.name} est promu(e) manager de ${b.name}.`, 'good')
  }
  e.morale = clamp(e.morale + 20, 0, 100)
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
  e.fatigue = 0
  delete e.skill
}
