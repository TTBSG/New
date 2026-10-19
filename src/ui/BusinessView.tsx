import { useState } from 'react'
import {
  businessValue,
  monthlyWages,
  perceivedPrice,
  sellBusiness,
  serviceCapacity,
  setMarketing,
  setPrice,
  setRestockTarget,
  stockValue,
} from '../game/engine'
import { expiringToday, productDef, stockOf } from '../game/stock'
import { autoTarget, costOf, getSupplier, pendingOrders, sectorSuppliers, setAuto, setProductSupplier, suppliersUnlocked, SUPPLIERS_RANK } from '../game/supply'
import { getParcel } from '../game/city'
import { diagnose } from '../game/diagnose'
import { getSector } from '../game/sectors'
import type { Business, GameState, ProductState } from '../game/types'
import { BarChart, Meter, NumberField, Section, Stat } from './common'
import { TIER_LABEL, dayLabel, eur, eurCents, num, signed } from './format'
import { Icon, type IconName } from './icons'
import { EmployeeCard, HiringPanel } from './staff'
import type { Act } from './useGame'

const TABS = ['Aperçu', 'Produits', 'Équipe', 'Marketing', 'Finances'] as const
type Tab = (typeof TABS)[number]

export function BusinessView({ state, business: b, act, onBack }: { state: GameState; business: Business; act: Act; onBack?: () => void }) {
  const [tab, setTab] = useState<Tab>('Aperçu')
  const sector = getSector(b.sectorId)
  return (
    <>
      <div className="biz-header">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="Retour">
            <Icon name="back" />
          </button>
        )}
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
      {tab === 'Produits' && <Products state={state} b={b} act={act} />}
      {tab === 'Équipe' && <Team state={state} b={b} act={act} />}
      {tab === 'Marketing' && <Marketing b={b} act={act} />}
      {tab === 'Finances' && <Finances b={b} />}
    </>
  )
}

function Overview({ state, b, act, onBack }: { state: GameState; b: Business; act: Act; onBack?: () => void }) {
  const last = b.history.at(-1)
  const capacity = serviceCapacity(b)
  const insights = diagnose(state, b)

  const recent = b.history.slice(-30)
  return (
    <>
      <Section title="Diagnostic">
        {insights.map((i) => (
          <div key={i.text} className={`insight ${i.tone}`}>
            <Icon name={i.tone === 'good' ? 'check' : 'alert'} size={16} />
            <span>{i.text}</span>
          </div>
        ))}
      </Section>
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
              onBack?.()
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

function Products({ state, b, act }: { state: GameState; b: Business; act: Act }) {
  const pending = pendingOrders(state, b.id)
  return (
    <>
      <p className="muted small">
        Valeur du stock : {eur(stockValue(b))} · {pending.length ? `${pending.length} commande${pending.length > 1 ? 's' : ''} en cours` : 'aucune commande en cours'}.
        {suppliersUnlocked(state) ? " Les commandes manuelles se passent dans l'appli Fournisseurs." : ''}
      </p>
      {b.products.map((p) => (
        <ProductCard key={p.id} state={state} b={b} p={p} act={act} />
      ))}
    </>
  )
}

function ProductCard({ state, b, p, act }: { state: GameState; b: Business; p: ProductState; act: Act }) {
  const [choosing, setChoosing] = useState(false)
  const def = productDef(b.sectorId, p.id)
  const supplier = getSupplier(state, p.supplierId)
  const cost = costOf(state, b.sectorId, p)
  const margin = p.price > 0 ? ((p.price - cost) / p.price) * 100 : 0
  const fair = perceivedPrice(state, b.sectorId, p)
  const ratio = p.price / fair
  const stock = stockOf(p)
  const expiring = expiringToday(p, state.day)
  const deliveries = pendingOrders(state, b.id)
    .map((o) => ({ order: o, qty: o.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0) }))
    .filter((d) => d.qty > 0)
    .sort((x, y) => x.order.dueDay - y.order.dueDay)
  const smart = autoTarget(b, p)
  const unlocked = suppliersUnlocked(state)

  return (
    <Section title={def.name} right={<span className={stock === 0 ? 'bad small strong' : 'muted small'}>{num(stock)} en rayon</span>}>
      <div className="field">
        <label>Prix de vente</label>
        <NumberField value={p.price} decimals={2} step={def.refPrice >= 50 ? 5 : 0.1} min={0.01} suffix="€" onChange={(v) => act(setPrice, b.id, p.id, v)} />
      </div>
      <p className="small muted">
        Prix jugé juste : {eurCents(fair)} ·{' '}
        <span className={ratio > 1.15 ? 'bad' : ratio < 0.9 ? 'warn' : 'good'}>{ratio > 1.15 ? 'trop cher' : ratio < 0.9 ? 'bradé' : 'bien placé'}</span> · coût{' '}
        {eurCents(cost)} · marge {Math.round(margin)} %
      </p>

      <div className="stock-line">
        <span>
          <Icon name="box" size={14} /> {def.shelfLife ? `Se garde ${def.shelfLife} jour${def.shelfLife > 1 ? 's' : ''}` : 'Ne périme pas'}
        </span>
        {expiring > 0 && <span className="warn">{num(expiring)} à vendre avant ce soir</span>}
        {deliveries.slice(0, 3).map(({ order, qty }) => (
          <span key={order.id} className={order.delayed ? 'bad' : 'good'}>
            +{num(qty)} {order.delayed ? 'en retard, ' : ''}le {dayLabel(order.dueDay)}
          </span>
        ))}
      </div>

      {p.fromWarehouse ? (
        <div className="field">
          <label>Approvisionnement</label>
          <div className="supplier-row">
            <span className="choice-main">
              <strong>
                <Icon name="truck" size={14} /> Livré chaque nuit par votre entrepôt
              </strong>
              <span className="small muted">
                Acheté chez {supplier.name} · coût moyen {eurCents(cost)} · à régler dans l'appli Logistique
              </span>
            </span>
          </div>
        </div>
      ) : (
      <div className="field">
        <label>Fournisseur</label>
        <button className="supplier-row" onClick={() => unlocked && setChoosing(!choosing)}>
          <span className="choice-main">
            <strong>{supplier.name}</strong>
            <span className="small muted">
              {TIER_LABEL[supplier.tier]} · qualité {supplier.quality} · livre en {supplier.leadDays} j
            </span>
          </span>
          {unlocked ? <span className="small strong accent">{choosing ? 'Fermer' : 'Changer'}</span> : <span className="small muted lock-note"><Icon name="lock" size={13} /> Rang {SUPPLIERS_RANK}</span>}
        </button>
        {choosing && (
          <div className="supplier-choices">
            {sectorSuppliers(state, b.sectorId).map((x) => (
              <button
                key={x.id}
                className={`supplier-option ${x.id === p.supplierId ? 'active' : ''}`}
                onClick={() => {
                  act(setProductSupplier, b.id, p.id, x.id)
                  setChoosing(false)
                }}
              >
                <strong>{x.name}</strong>
                <span className="small muted">
                  {TIER_LABEL[x.tier]} · qualité {x.quality} · {x.priceMult >= 1 ? '+' : '−'}
                  {Math.abs(Math.round((x.priceMult - 1) * 100))} % · {x.leadDays} j · fiable à {Math.round(x.reliability * 100)} %
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="field">
        <label>Réapprovisionnement</label>
        <div className="segmented two">
          <button className={p.auto ? 'active' : ''} onClick={() => act(setAuto, b.id, p.id, true)}>
            Automatique
          </button>
          <button className={!p.auto ? 'active' : ''} disabled={!unlocked} onClick={() => act(setAuto, b.id, p.id, false)}>
            Manuel{!unlocked && <span className="small muted">rang {SUPPLIERS_RANK}</span>}
          </button>
        </div>
      </div>
      {p.auto ? (
        <>
          <div className="field">
            <label>Stock cible</label>
            <NumberField value={p.restockTarget} step={Math.max(1, Math.round(p.restockTarget / 10))} onChange={(v) => act(setRestockTarget, b.id, p.id, v)} />
          </div>
          <p className="small muted">
            {def.shelfLife && def.shelfLife <= 2 ? 'Complété chaque soir' : 'Recommandé quand le stock passe sous 70 % de la cible'}
            {def.shelfLife && smart < p.restockTarget ? `, limité à ${num(smart)} d'après vos ventes récentes pour éviter le gaspillage.` : '.'}
          </p>
        </>
      ) : (
        <p className="small muted">Aucune commande automatique : pensez à commander dans l'appli Fournisseurs.</p>
      )}
    </Section>
  )
}

function Team({ state, b, act }: { state: GameState; b: Business; act: Act }) {
  const last = b.history.at(-1)
  return (
    <>
      <div className="stats">
        <Stat label="Capacité" value={`${num(serviceCapacity(b))}/j`} hint={last ? `demande hier ${num(last.demand)}` : undefined} />
        <Stat label="Masse salariale" value={`${eur(monthlyWages(b))}/mois`} />
      </div>
      <Section title={`Employés (${b.employees.length})`}>
        {b.employees.length === 0 && <p className="muted">Personne pour l'instant.</p>}
        {b.employees.map((e) => (
          <EmployeeCard key={e.id} state={state} b={b} e={e} act={act} />
        ))}
      </Section>
      <Section title="Recruter">
        <HiringPanel state={state} b={b} act={act} />
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
  const sum = (k: 'revenue' | 'grossMargin' | 'wages' | 'rent' | 'marketing' | 'profit' | 'purchases' | 'waste') => recent.reduce((a, r) => a + (r[k] ?? 0), 0)
  const revenue = sum('revenue')
  const rows: [string, number][] = [
    ["Chiffre d'affaires", revenue],
    ['Coût des marchandises vendues', -(revenue - sum('grossMargin'))],
    ['Produits périmés jetés', -sum('waste')],
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
