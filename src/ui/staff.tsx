import { fire, hire, inTrial, setSalary, severance } from '../game/engine'
import { getSector } from '../game/sectors'
import { CONTRACT_NAMES, PAY_FACTOR, SLOTS, SLOT_HOURS, SLOT_NAMES, autoPlan, payOf, setHours, slotCapacity, toggleShift } from '../game/schedule'
import { HIRING_CHANNELS, SKILL_LABELS, TRAITS, fairSalary, interview, interviewsLeft, level, postJob } from '../game/staff'
import type { Business, Candidate, Employee, GameState, Skills, Slot, TraitId } from '../game/types'
import { Meter, NumberField, Section } from './common'
import { dayLabel, eur } from './format'
import { Icon } from './icons'
import type { Act } from './useGame'

const AVATAR_COLORS = ['#e8743b', '#3987e5', '#4cb86b', '#a36ee0', '#e85d8a', '#f2b134', '#2fa58f', '#8a6142']

export function PersonAvatar({ name }: { name: string }) {
  const hash = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
  return (
    <span className="person-avatar" style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}>
      {initials}
    </span>
  )
}

export function SkillBars({ skills }: { skills: Skills }) {
  return (
    <div className="skill-bars">
      {(Object.keys(SKILL_LABELS) as (keyof Skills)[]).map((k) => (
        <div key={k} className="skill-bar">
          <span className="small">{SKILL_LABELS[k]}</span>
          <Meter value={skills[k]} label={SKILL_LABELS[k]} />
          <span className="small strong">{Math.round(skills[k])}</span>
        </div>
      ))}
    </div>
  )
}

export function TraitBadges({ traits, known, detailed }: { traits: TraitId[]; known: boolean; detailed?: boolean }) {
  if (!known)
    return (
      <div className="traits">
        <span className="trait unknown">? Caractère inconnu</span>
      </div>
    )
  return (
    <>
      <div className="traits">
        {traits.map((t) => (
          <span key={t} className={`trait ${TRAITS[t].positive ? 'good' : 'bad'}`} title={TRAITS[t].text}>
            {TRAITS[t].name}
          </span>
        ))}
      </div>
      {detailed && (
        <ul className="trait-notes">
          {traits.map((t) => (
            <li key={t} className="small muted">
              <strong>{TRAITS[t].name} :</strong> {TRAITS[t].text}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function EmployeeCard({ state, b, e, act }: { state: GameState; b: Business; e: Employee; act: Act }) {
  const role = getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!
  const fair = fairSalary(role.baseSalary, level(e.skills))
  const trial = inTrial(state, e)
  return (
    <div className="person">
      <div className="person-top">
        <PersonAvatar name={e.name} />
        <div className="choice-main">
          <strong>{e.name}</strong>
          <span className="muted small">
            {role.name} · niveau {level(e.skills)}
          </span>
          <span className="small">
            {CONTRACT_NAMES[e.shifts.length]} · {e.shifts.map((x) => SLOT_NAMES[x].toLowerCase()).join(', ')} · <strong>{eur(payOf(e))}/mois</strong>
          </span>
          {trial && <span className="pill soft trial-pill">Essai jusqu'au {dayLabel(e.trialUntil)}</span>}
        </div>
      </div>
      <TraitBadges traits={e.traits} known={e.traitsKnown} detailed />
      {!e.traitsKnown && <p className="small muted">Vous découvrirez son caractère après quelques semaines de travail.</p>}
      <SkillBars skills={e.skills} />
      <div className="skill-bar">
        <span className="small">Moral</span>
        <Meter value={e.morale} label="Moral" />
        <span className="small strong">{Math.round(e.morale)}</span>
      </div>
      <div className="field">
        <label>Salaire temps plein (marché ~{eur(fair)})</label>
        <NumberField value={e.salary} step={50} suffix="€" onChange={(v) => act(setSalary, b.id, e.id, v)} />
      </div>
      <button
        className="btn danger small-btn"
        onClick={() =>
          confirm(trial ? `Mettre fin à la période d'essai de ${e.name} ? (gratuit)` : `Licencier ${e.name} ? Indemnité : ${eur(severance(e))}`) && act(fire, b.id, e.id)
        }
      >
        {trial ? "Mettre fin à l'essai" : 'Licencier'}
      </button>
    </div>
  )
}

export function CandidateCard({ state, c, businessId, act }: { state: GameState; c: Candidate; businessId: string; act: Act }) {
  const left = interviewsLeft(state)
  return (
    <div className="candidate-card">
      <div className="person-top">
        <PersonAvatar name={c.name} />
        <div className="choice-main">
          <strong>{c.name}</strong>
          <span className="small muted">
            niveau {level(c.skills)} · demande {eur(c.salary)}/mois
          </span>
        </div>
        <span className={`pill soft source-${c.source}`}>{c.source === 'spontane' ? 'Spontané' : c.source === 'annonce' ? 'Annonce' : 'Cabinet'}</span>
      </div>
      <SkillBars skills={c.skills} />
      <TraitBadges traits={c.traits} known={c.traitsKnown} />
      <div className="row">
        {!c.traitsKnown && (
          <button className="btn small-btn" disabled={left <= 0} onClick={() => act(interview, c.id)}>
            Entretien{left !== Infinity ? ` (${left} restant${left > 1 ? 's' : ''} aujourd'hui)` : ''}
          </button>
        )}
        <button className="btn small-btn primary" onClick={() => act(hire, businessId, c.id)}>
          Embaucher
        </button>
      </div>
      <span className="small muted">Disponible jusqu'au {dayLabel(c.expiresDay)}</span>
    </div>
  )
}

/** Candidats d'un poste avec les moyens de recrutement (annonce, cabinet). */
export function HiringPanel({ state, b, act }: { state: GameState; b: Business; act: Act }) {
  const sector = getSector(b.sectorId)
  return (
    <>
      {sector.roles.map((role) => {
        const list = state.candidates.filter((c) => c.sectorId === b.sectorId && c.roleId === role.id)
        return (
          <div key={role.id} className="hiring-role">
            <h4>
              {role.name}{' '}
              <span className="muted small">{role.capacity > 0 ? `sert ~${role.capacity} clients/j` : "+12 % d'efficacité pour 5 employés, + moral"}</span>
            </h4>
            {!list.length && <p className="small muted">Aucun candidat pour le moment.</p>}
            {list.map((c) => (
              <CandidateCard key={c.id} state={state} c={c} businessId={b.id} act={act} />
            ))}
            <div className="row wrap">
              {(Object.keys(HIRING_CHANNELS) as (keyof typeof HIRING_CHANNELS)[]).map((ch) => (
                <button key={ch} className="btn small-btn" disabled={state.cash < HIRING_CHANNELS[ch].cost} onClick={() => act(postJob, b.sectorId, role.id, ch)}>
                  <Icon name={ch === 'annonce' ? 'megaphone' : 'users'} size={14} /> {HIRING_CHANNELS[ch].name} · {eur(HIRING_CHANNELS[ch].cost)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <p className="small muted">
        Candidatures spontanées chaque lundi. Une annonce attire {HIRING_CHANNELS.annonce.count} candidats ; un cabinet {HIRING_CHANNELS.cabinet.count} profils solides au caractère déjà connu. Chaque embauche commence par
        une période d'essai.
      </p>
    </>
  )
}

/** Horaires d'ouverture et planning de l'équipe par créneau. */
export function PlanningPanel({ b, act }: { b: Business; act: Act }) {
  const share = getSector(b.sectorId).slotShare
  const cap = slotCapacity(b)
  const last = b.history.at(-1)
  const openShare = SLOTS.reduce<number>((a, x) => a + (b.hours[x] ? share[x] : 0), 0)
  const demandOf = (slot: Slot) => last?.slotDemand?.[slot] ?? (last && b.hours[slot] ? Math.round((last.demand * share[slot]) / openShare) : null)
  return (
    <Section
      title="Horaires et planning"
      right={
        b.employees.length > 1 && (
          <button className="btn small-btn" onClick={() => act(autoPlan, b.id)}>
            Planning auto
          </button>
        )
      }
    >
      <div className="hours-row">
        {SLOTS.map((slot) => (
          <button key={slot} className={`slot-chip ${b.hours[slot] ? 'on' : ''}`} aria-pressed={b.hours[slot]} onClick={() => act(setHours, b.id, slot, !b.hours[slot])}>
            <strong>{SLOT_NAMES[slot]}</strong>
            <span className="small">{SLOT_HOURS[slot]}</span>
            <span className="small">{Math.round(share[slot] * 100)} % clients</span>
            <span className="small strong">{b.hours[slot] ? 'Ouvert' : 'Fermé'}</span>
          </button>
        ))}
      </div>
      {b.employees.length > 0 && (
        <table className="planning">
          <thead>
            <tr>
              <th />
              {SLOTS.map((slot) => (
                <th key={slot}>{SLOT_NAMES[slot]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong className="small">{e.name.split(' ')[0]}</strong>
                  <span className="small muted">{CONTRACT_NAMES[e.shifts.length]}</span>
                </td>
                {SLOTS.map((slot) => {
                  const on = e.shifts.includes(slot)
                  return (
                    <td key={slot}>
                      <button
                        className={`shift-cell ${on ? 'on' : ''}`}
                        disabled={!b.hours[slot] || (on && e.shifts.length === 1)}
                        aria-pressed={on}
                        aria-label={`${e.name} · ${SLOT_NAMES[slot]}`}
                        onClick={() => act(toggleShift, b.id, e.id, slot)}
                      >
                        {on && <Icon name="check" size={14} />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="coverage">
              <td className="small muted">Servis / clients</td>
              {SLOTS.map((slot) => {
                const d = demandOf(slot)
                const c = Math.round(cap[slot])
                const tone = !b.hours[slot] ? '' : d === null ? '' : c >= d ? 'good' : c >= d * 0.85 ? 'warn' : 'bad'
                return (
                  <td key={slot} className={`small strong ${tone}`}>
                    {b.hours[slot] ? `${c} / ${d ?? '?'}` : 'Fermé'}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      )}
      <p className="small muted">
        Touchez une case pour changer le planning. 1 créneau = temps partiel (salaire ×{PAY_FACTOR[1].toLocaleString('fr-FR')}), 2 = temps plein, 3 = heures sup (salaire ×{PAY_FACTOR[3].toLocaleString('fr-FR')}, fatigue). Un créneau fermé fait perdre ses clients mais économise l'énergie.
      </p>
    </Section>
  )
}
