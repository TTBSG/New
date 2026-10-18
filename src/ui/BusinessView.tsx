import { useState } from 'react'
import {
  businessValue,
  fairSalary,
  fire,
  hire,
  monthlyWages,
  perceivedPrice,
  sellBusiness,
  serviceCapacity,
  setMarketing,
  setPrice,
  setRestockTarget,
  setSalary,
  setSupplier,
  severance,
  stockValue,
  unitCost,
} from '../game/engine'
import { getParcel } from '../game/city'
import { SUPPLIERS, getSector } from '../game/sectors'
import type { Business, GameState, SupplierTier } from '../game/types'
import { BarChart, Meter, NumberField, Section, Stat } from './common'
import { eur, eurCents, num, signed } from './format'
import { Icon, type IconName } from './icons'
import type { Act } from './useGame'

const TABS = ['Aperçu', 'Produits', 'Équipe', 'Marketing', 'Finances'] as const
type Tab = (typeof TABS)[number]

export function BusinessView({ state, business: b, act, onBack }: { state: GameState; business: Business; act: Act; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('Aperçu')
  const sector = getSector(b.sectorId)
  return (
    <>
      <div className="biz-header">
        <button className="icon-btn" onClick={onBack} aria-label="Retour">
          <Icon name="back" />
        </button>
        <span className="sector-badge" style={{ background: sector.color }}>
          <Icon name={b.sectorId as IconName} size={22} />
        </span>
        <div>
          <h2>{b.name}</h2>
          <span className="muted small">
            {sector.name} · {getParcel(state.city, b.parcelId).address}
          </span>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Aperçu' && <Overview state={state} b={b} act={act} onBack={onBack} />}
      {tab === 'Produits' && <Products b={b} act={act} />}
      {tab === 'Équipe' && <Team state={state} b={b} act={act} />}
      {tab === 'Marketing' && <Marketing b={b} act={act} />}
      {tab === 'Finances' && <Finances b={b} />}
    </>
  )
}

function Overview({ state, b, act, onBack }: { state: GameState; b: Business; act: Act; onBack: () => void }) {
  const last = b.history.at(-1)
  const capacity = serviceCapacity(b)
  const alerts: string[] = []
  if (capacity === 0) alerts.push("Aucun employé : l'entreprise ne peut servir personne. Recrutez dans l'onglet Équipe.")
  if (last && capacity > 0 && last.lostToCapacity > last.demand * 0.05)
    alerts.push(`${num(last.lostToCapacity)} ventes perdues hier faute de personnel. Recrutez ou améliorez le moral.`)
  if (last && last.lostToStockout > last.demand * 0.05)
    alerts.push(`${num(last.lostToStockout)} ventes perdues hier par rupture de stock. Augmentez le stock cible.`)
  const unhappy = b.employees.filter((e) => e.morale < 35)
  if (unhappy.length) alerts.push(`${unhappy.length} employé(s) démotivé(s), risque de démission.`)

  const recent = b.history.slice(-30)
  return (
    <>
      {alerts.map((a) => (
        <div key={a} className="alert">
          <Icon name="alert" size={18} /> <span>{a}</span>
        </div>
      ))}
      <div className="stats">
        <Stat label="Réputation" value={`${Math.round(b.reputation)}/100`} hint={<Meter value={b.reputation} label="Réputation" />} />
        <Stat label="Visiteurs hier" value={last ? num(last.visitors) : '—'} />
        <Stat label="Ventes hier" value={last ? num(last.unitsSold) : '—'} hint={last ? `demande ${num(last.demand)}` : undefined} />
        <Stat label="Capacité de service" value={`${num(capacity)}/j`} />
        <Stat label="CA hier" value={last ? eur(last.revenue) : '—'} />
        <Stat label="Bénéfice hier" value={last ? signed(last.profit) : '—'} tone={last && last.profit < 0 ? 'bad' : 'good'} />
      </div>
      <Section title="Bénéfice quotidien (30 j)">
        <BarChart values={recent.map((r) => r.profit)} labels={recent.map((r) => `Jour ${r.day}`)} />
      </Section>
      <Section title="Céder l'entreprise">
        <p className="muted small">Valeur estimée : {eur(businessValue(b))} (équipement, stock et rentabilité récente).</p>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Vendre ${b.name} pour ${eur(businessValue(b))} ?`)) {
              act(sellBusiness, b.id)
              onBack()
            }
          }}
        >
          Vendre
        </button>
      </Section>
      {state.events.some((e) => e.sectorId === b.sectorId) && (
        <Section title="Actualité du secteur">
          {state.events
            .filter((e) => e.sectorId === b.sectorId)
            .map((e) => (
              <p key={e.id} className="small">
                <strong>{e.title}</strong> — {e.description}
              </p>
            ))}
        </Section>
      )}
    </>
  )
}

function Products({ b, act }: { b: Business; act: Act }) {
  const sector = getSector(b.sectorId)
  return (
    <>
      <p className="muted small">
        Stock total : {eur(stockValue(b))}. Le stock est réapprovisionné chaque soir jusqu'au stock cible, si la trésorerie le permet.
      </p>
      {b.products.map((p) => {
        const def = sector.products.find((x) => x.id === p.id)!
        const cost = unitCost(b.sectorId, p)
        const margin = p.price > 0 ? ((p.price - cost) / p.price) * 100 : 0
        const fair = perceivedPrice(b.sectorId, p)
        const ratio = p.price / fair
        return (
          <Section key={p.id} title={def.name} right={<span className={p.stock === 0 ? 'bad small' : 'muted small'}>stock {num(p.stock)}</span>}>
            <div className="field">
              <label>Prix de vente</label>
              <NumberField value={p.price} decimals={2} step={def.refPrice >= 50 ? 5 : 0.1} min={0.01} suffix="€" onChange={(v) => act(setPrice, b.id, p.id, v)} />
            </div>
            <p className="small muted">
              Prix jugé juste : {eurCents(fair)} ·{' '}
              <span className={ratio > 1.15 ? 'bad' : ratio < 0.9 ? 'warn' : 'good'}>
                {ratio > 1.15 ? 'trop cher' : ratio < 0.9 ? 'bradé' : 'bien placé'}
              </span>{' '}
              · coût {eurCents(cost)} · marge {Math.round(margin)} %
            </p>
            <div className="field">
              <label>Fournisseur</label>
              <div className="segmented">
                {(Object.keys(SUPPLIERS) as SupplierTier[]).map((t) => (
                  <button key={t} className={p.supplier === t ? 'active' : ''} onClick={() => act(setSupplier, b.id, p.id, t)}>
                    {SUPPLIERS[t].name}
                    <span className="small muted">qualité {SUPPLIERS[t].quality}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Stock cible</label>
              <NumberField value={p.restockTarget} step={Math.max(1, Math.round(p.restockTarget / 10))} onChange={(v) => act(setRestockTarget, b.id, p.id, v)} />
            </div>
          </Section>
        )
      })}
    </>
  )
}

function Team({ state, b, act }: { state: GameState; b: Business; act: Act }) {
  const sector = getSector(b.sectorId)
  const last = b.history.at(-1)
  const candidates = state.candidates.filter((c) => c.sectorId === b.sectorId)
  return (
    <>
      <div className="stats">
        <Stat label="Capacité" value={`${num(serviceCapacity(b))}/j`} hint={last ? `demande hier ${num(last.demand)}` : undefined} />
        <Stat label="Masse salariale" value={`${eur(monthlyWages(b))}/mois`} />
      </div>
      <Section title={`Employés (${b.employees.length})`}>
        {b.employees.length === 0 && <p className="muted">Personne pour l'instant.</p>}
        {b.employees.map((e) => {
          const role = sector.roles.find((r) => r.id === e.roleId)!
          const fair = fairSalary(role.baseSalary, e.skill)
          return (
            <div key={e.id} className="person">
              <div className="person-head">
                <strong>{e.name}</strong>
                <span className="muted small">{role.name}</span>
              </div>
              <div className="person-meters">
                <span className="small">Compétence {Math.round(e.skill)}</span>
                <Meter value={e.skill} label="Compétence" />
                <span className="small">Moral {Math.round(e.morale)}</span>
                <Meter value={e.morale} label="Moral" />
              </div>
              <div className="field">
                <label>Salaire mensuel (marché ~{eur(fair)})</label>
                <NumberField value={e.salary} step={50} suffix="€" onChange={(v) => act(setSalary, b.id, e.id, v)} />
              </div>
              <button
                className="btn danger small-btn"
                onClick={() => confirm(`Licencier ${e.name} ? Indemnité : ${eur(severance(e))}`) && act(fire, b.id, e.id)}
              >
                Licencier
              </button>
            </div>
          )
        })}
      </Section>
      <Section title="Candidats" right={<span className="muted small">renouvelés chaque lundi</span>}>
        {sector.roles.map((role) => (
          <div key={role.id}>
            <h4>
              {role.name} <span className="muted small">{role.capacity > 0 ? `sert ~${role.capacity} clients/j` : '+12 % d\'efficacité pour 5 employés, + moral'}</span>
            </h4>
            {candidates
              .filter((c) => c.roleId === role.id)
              .map((c) => (
                <div key={c.id} className="candidate">
                  <span className="biz-main">
                    <strong>{c.name}</strong>
                    <span className="small muted">
                      compétence {c.skill} · {eur(c.salary)}/mois
                    </span>
                  </span>
                  <button className="btn small-btn" onClick={() => act(hire, b.id, c.id)}>
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

function Marketing({ b, act }: { b: Business; act: Act }) {
  const boost = Math.round(50 * Math.log10(1 + b.marketingDaily / 10))
  return (
    <Section title="Budget publicitaire">
      <div className="field">
        <label>Dépense par jour</label>
        <NumberField value={b.marketingDaily} step={10} suffix="€/j" onChange={(v) => act(setMarketing, b.id, v)} />
      </div>
      <input type="range" min={0} max={1000} step={10} value={b.marketingDaily} onChange={(e) => act(setMarketing, b.id, Number(e.target.value))} aria-label="Budget marketing" />
      <p className="small">
        Effet : <strong>+{boost} %</strong> de visiteurs · coût {eur(b.marketingDaily * 30)}/mois
      </p>
      <p className="muted small">Les rendements sont décroissants : doubler le budget ne double pas les clients. Inutile de faire venir du monde si l'équipe ne peut pas suivre.</p>
    </Section>
  )
}

function Finances({ b }: { b: Business }) {
  const recent = b.history.slice(-30)
  const sum = (k: 'revenue' | 'grossMargin' | 'wages' | 'rent' | 'marketing' | 'profit' | 'purchases') => recent.reduce((a, r) => a + r[k], 0)
  const revenue = sum('revenue')
  const rows: [string, number][] = [
    ["Chiffre d'affaires", revenue],
    ['Coût des marchandises vendues', -(revenue - sum('grossMargin'))],
    ['Salaires', -sum('wages')],
    ['Loyer', -sum('rent')],
    ['Marketing', -sum('marketing')],
  ]
  return (
    <>
      <Section title={`Compte de résultat (${recent.length} derniers jours)`}>
        <table className="table">
          <tbody>
            {rows.map(([label, v]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{eur(v)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Résultat</td>
              <td className={`num ${sum('profit') < 0 ? 'bad' : 'good'}`}>{signed(sum('profit'))}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Marge brute {revenue > 0 ? Math.round((sum('grossMargin') / revenue) * 100) : 0} % · achats de stock {eur(sum('purchases'))}
        </p>
      </Section>
      <Section title="Chiffre d'affaires quotidien">
        <BarChart values={recent.map((r) => r.revenue)} labels={recent.map((r) => `Jour ${r.day}`)} />
      </Section>
    </>
  )
}
