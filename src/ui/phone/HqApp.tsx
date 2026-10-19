import { useState, type ReactNode } from 'react'
import { getDistrict } from '../../game/sectors'
import { getParcel } from '../../game/city'
import { effectiveLoanRate } from '../../game/engine'
import {
  HQ_LEVELS,
  OFFICE_ROLES,
  SHOPS_WITHOUT_HQ,
  canDelegate,
  fireOffice,
  hireOffice,
  hqLevel,
  hqMonthlyCost,
  hqRent,
  marketingBoost,
  maxBusinesses,
  purchasingRate,
  reliabilityBoost,
  setPolicy,
  startingReputation,
  upgradeHq,
} from '../../game/hq'
import { BENEFITS, benefitsPerEmployee, type BenefitId } from '../../game/staff'
import type { GameState, OfficeRole } from '../../game/types'
import { Meter, Section, Stat } from '../common'
import { eur } from '../format'
import { Icon } from '../icons'
import type { Act } from '../useGame'

const TABS = ['Aperçu', 'Équipe', 'Délégation'] as const
type Tab = (typeof TABS)[number]
const pct = (v: number) => `${Math.round(v * 100)} %`
const shops = (n: number) => (n === Infinity ? 'illimité' : `${n}`)

export function HqApp({ state, act, onFindLot }: { state: GameState; act: Act; onFindLot: () => void }) {
  const [tab, setTab] = useState<Tab>('Aperçu')
  if (!state.hq) return <NoHq state={state} onFindLot={onFindLot} />
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Aperçu' && <Overview state={state} act={act} />}
      {tab === 'Équipe' && <Staff state={state} act={act} />}
      {tab === 'Délégation' && <Delegation state={state} act={act} />}
    </>
  )
}

function LevelsTable({ current }: { current?: number }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <td className="muted small">Niveau</td>
          <td className="num muted small">Commerces</td>
          <td className="num muted small">Bureaux</td>
          <td className="num muted small">Coût</td>
        </tr>
      </thead>
      <tbody>
        {HQ_LEVELS.map((l, i) => (
          <tr key={l.name} className={current === i + 1 ? 'strong' : undefined}>
            <td>
              {l.name}
              <div className="small muted">loyer ×{l.rentMult}</div>
            </td>
            <td className="num">{shops(l.maxShops)}</td>
            <td className="num">{l.desks}</td>
            <td className="num">{eur(l.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function NoHq({ state, onFindLot }: { state: GameState; onFindLot: () => void }) {
  return (
    <>
      <Section title="Votre futur siège social">
        <p className="small">
          Sans siège, vous ne pouvez pas gérer plus de <strong>{SHOPS_WITHOUT_HQ} commerces</strong> (vous en avez {state.businesses.length}). Le siège augmente cette limite et accueille des employés de bureau
          qui profitent à tout le groupe : acheteurs, recruteurs, marketing, logistique, contrôle de gestion.
        </p>
        <p className="small muted">Il s'installe sur un local libre de la carte. Un siège dans le quartier d'affaires est plus prestigieux : vos nouveaux commerces démarrent avec une meilleure réputation.</p>
        <button className="btn primary block" onClick={onFindLot}>
          <Icon name="map" size={18} /> Choisir un local sur la carte
        </button>
      </Section>
      <Section title="Les niveaux">
        <LevelsTable />
        <p className="small muted">Le coût d'installation s'ajoute à deux mois de loyer en caution. On peut agrandir le siège plus tard.</p>
      </Section>
    </>
  )
}

function Overview({ state, act }: { state: GameState; act: Act }) {
  const hq = state.hq!
  const level = hqLevel(hq)
  const next = HQ_LEVELS[hq.level]
  const parcel = getParcel(state.city, hq.parcelId)
  const limit = maxBusinesses(state)
  return (
    <>
      <div className="rank-card">
        <span className="rank-badge hq">
          <Icon name="tower" size={28} />
        </span>
        <div>
          <div className="info-title">SIÈGE SOCIAL</div>
          <strong className="rank-title">{level.name}</strong>
          <div className="small muted">
            {parcel.address} · {getDistrict(parcel.districtId).name}
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat label="Commerces" value={`${state.businesses.length} / ${shops(limit)}`} hint={limit !== Infinity ? <Meter value={state.businesses.length} max={limit} label="Commerces" /> : undefined} />
        <Stat label="Bureaux" value={`${hq.staff.length} / ${level.desks}`} />
        <Stat label="Loyer" value={`${eur(hqRent(state))}/mois`} />
        <Stat label="Coût total" value={`${eur(hqMonthlyCost(state))}/mois`} hint="loyer + salaires du siège" />
      </div>
      <Section title="Effets sur le groupe">
        <div className="effects">
          <span>Remise sur les achats</span>
          <strong>{purchasingRate(state) ? `−${(purchasingRate(state) * 100).toFixed(1)} %` : '—'}</strong>
          <span>Visiteurs dans vos commerces</span>
          <strong>{marketingBoost(state) ? `+${pct(marketingBoost(state))}` : '—'}</strong>
          <span>Fiabilité des livraisons</span>
          <strong>{reliabilityBoost(state) ? `+${Math.round(reliabilityBoost(state) * 100)} pts` : '—'}</strong>
          <span>Taux des prêts</span>
          <strong>{(effectiveLoanRate(state) * 100).toFixed(1)} %</strong>
          <span>Réputation d'un nouveau commerce</span>
          <strong>{startingReputation(state)}</strong>
        </div>
        <p className="small muted">Recrutez des employés de bureau dans l'onglet Équipe pour renforcer ces effets.</p>
      </Section>
      {next ? (
        <Section title={`Agrandir : ${next.name}`}>
          <p className="small">
            Jusqu'à <strong>{shops(next.maxShops)}</strong> commerces et <strong>{next.desks}</strong> bureaux. Loyer ×{next.rentMult}.
          </p>
          <button className="btn primary block" disabled={state.cash < next.cost} onClick={() => confirm(`Agrandir le siège pour ${eur(next.cost)} ?`) && act(upgradeHq)}>
            Agrandir pour {eur(next.cost)}
          </button>
        </Section>
      ) : (
        <p className="small muted center">Votre siège est au niveau maximum.</p>
      )}
      <Section title="Les niveaux">
        <LevelsTable current={hq.level} />
      </Section>
    </>
  )
}

function Staff({ state, act }: { state: GameState; act: Act }) {
  const hq = state.hq!
  const full = hq.staff.length >= hqLevel(hq).desks
  return (
    <>
      <Section title={`Au siège (${hq.staff.length}/${hqLevel(hq).desks} bureaux)`}>
        {!hq.staff.length && <p className="muted small">Personne pour l'instant.</p>}
        {hq.staff.map((e) => (
          <div key={e.id} className="person">
            <div className="person-head">
              <strong>{e.name}</strong>
              <span className="muted small">{OFFICE_ROLES[e.role].name}</span>
            </div>
            <div className="person-meters">
              <span className="small">Compétence {Math.round(e.skill)}</span>
              <Meter value={e.skill} label="Compétence" />
            </div>
            <div className="order-top">
              <span className="small muted">{eur(e.salary)}/mois</span>
              <button className="btn danger small-btn" onClick={() => confirm(`Se séparer de ${e.name} ? Indemnité : ${eur(e.salary / 2)}`) && act(fireOffice, e.id)}>
                Licencier
              </button>
            </div>
          </div>
        ))}
      </Section>
      <Section title="Recruter" right={<span className="muted small">renouvelés chaque lundi</span>}>
        {full && <p className="small warn">Tous les bureaux sont occupés : agrandissez le siège pour recruter.</p>}
        {(Object.keys(OFFICE_ROLES) as OfficeRole[]).map((role) => (
          <div key={role}>
            <h4>{OFFICE_ROLES[role].name}</h4>
            <p className="small muted">{OFFICE_ROLES[role].effect}</p>
            {state.officeCandidates
              .filter((c) => c.role === role)
              .map((c) => (
                <div key={c.id} className="candidate">
                  <span className="choice-main">
                    <strong>{c.name}</strong>
                    <span className="small muted">
                      compétence {c.skill} · {eur(c.salary)}/mois
                    </span>
                  </span>
                  <button className="btn small-btn" disabled={full} onClick={() => act(hireOffice, c.id)}>
                    Embaucher
                  </button>
                </div>
              ))}
          </div>
        ))}
      </Section>
    </>
  )
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} />
}

function Rule({ title, text, need, state, children }: { title: string; text: string; need: OfficeRole; state: GameState; children: ReactNode }) {
  const ok = canDelegate(state, need)
  return (
    <div className={`rule ${ok ? '' : 'disabled'}`}>
      <div className="rule-top">
        <strong>{title}</strong>
        {children}
      </div>
      <span className="small muted">{text}</span>
      {!ok && (
        <span className="small lock-note">
          <Icon name="lock" size={13} /> Nécessite un {OFFICE_ROLES[need].name.toLowerCase()} au siège
        </span>
      )}
    </div>
  )
}

function Delegation({ state, act }: { state: GameState; act: Act }) {
  const p = state.hq!.policies
  const staffTotal = state.businesses.reduce((n, b) => n + b.employees.length, 0)
  return (
    <>
      <p className="muted small">Confiez des tâches à votre siège pour vous concentrer sur l'essentiel. Chaque règle reste désactivable à tout moment.</p>
      <Section title="Personnel">
        <Rule state={state} need="recruteur" title="Remplacer les départs" text="Quand un employé démissionne, le siège embauche le meilleur candidat disponible au prix du marché.">
          <Toggle on={p.autoReplace} disabled={!canDelegate(state, 'recruteur')} onChange={(v) => act(setPolicy, 'autoReplace', v)} />
        </Rule>
        <Rule state={state} need="recruteur" title="Demandes d'augmentation" text="Le siège accepte seul les demandes raisonnables ; les autres vous sont transmises.">
          <span />
        </Rule>
        <div className="segmented three">
          {[0, 0.05, 0.1].map((v) => (
            <button key={v} className={p.raiseLimit === v ? 'active' : ''} disabled={!canDelegate(state, 'recruteur')} onClick={() => act(setPolicy, 'raiseLimit', v)}>
              {v === 0 ? 'Me demander' : `Jusqu'à +${pct(v)}`}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Avantages sociaux" right={<span className="muted small">{eur(benefitsPerEmployee(state) * staffTotal)}/mois</span>}>
        {(Object.keys(BENEFITS) as BenefitId[]).map((k) => (
          <Rule key={k} state={state} need="recruteur" title={`${BENEFITS[k].name} · ${eur(BENEFITS[k].cost)}/employé/mois`} text={BENEFITS[k].text}>
            <Toggle on={p[k]} disabled={!canDelegate(state, 'recruteur')} onChange={(v) => act(setPolicy, k, v)} />
          </Rule>
        ))}
        <p className="small muted">Pour vos {staffTotal} employés en boutique. Le coût est ajouté aux salaires de chaque commerce.</p>
      </Section>
      <Section title="Achats">
        <Rule state={state} need="acheteur" title="Négocier chaque mois" text="L'acheteur tente d'obtenir une remise auprès de chaque fournisseur que vous utilisez.">
          <Toggle on={p.autoNegotiate} disabled={!canDelegate(state, 'acheteur')} onChange={(v) => act(setPolicy, 'autoNegotiate', v)} />
        </Rule>
        <Rule
          state={state}
          need="acheteur"
          title="Ajuster les stocks cibles"
          text="Chaque lundi, le stock cible des produits qui ne périment pas est recalé sur les ventes de la semaine et le délai du fournisseur."
        >
          <Toggle on={p.autoStock} disabled={!canDelegate(state, 'acheteur')} onChange={(v) => act(setPolicy, 'autoStock', v)} />
        </Rule>
      </Section>
    </>
  )
}
