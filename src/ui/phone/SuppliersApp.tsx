import { useState } from 'react'
import { getSector } from '../../game/sectors'
import { productDef, stockOf } from '../../game/stock'
import {
  MAX_NEGOTIATED,
  NEGOTIATION_COOLDOWN,
  cancelOrder,
  getSupplier,
  incoming,
  loyalty,
  negotiate,
  placeOrder,
  quote,
  sectorSuppliers,
  setProductSupplier,
} from '../../game/supply'
import type { Business, GameState, Order, Supplier } from '../../game/types'
import { Meter, NumberField, Section } from '../common'
import { TIER_LABEL, dayLabel, eur, num } from '../format'
import { Icon, type IconName } from '../icons'
import type { Act } from '../useGame'

const TABS = ['Commandes', 'Annuaire', 'Commander'] as const
type Tab = (typeof TABS)[number]
const pct = (v: number) => `${Math.round(v * 100)} %`

export function SuppliersApp({ state, act }: { state: GameState; act: Act }) {
  const [tab, setTab] = useState<Tab>('Commandes')
  const [businessId, setBusinessId] = useState(state.businesses[0]?.id ?? '')
  const business = state.businesses.find((b) => b.id === businessId) ?? state.businesses[0]

  if (!business) return <p className="muted center">Ouvrez un commerce pour travailler avec des fournisseurs.</p>

  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Commandes' && <OrdersTab state={state} act={act} />}
      {tab !== 'Commandes' && state.businesses.length > 1 && <BusinessPicker state={state} value={business.id} onChange={setBusinessId} />}
      {tab === 'Annuaire' && <DirectoryTab state={state} act={act} b={business} onOrder={() => setTab('Commander')} />}
      {tab === 'Commander' && <NewOrderTab key={business.id} state={state} act={act} b={business} onDone={() => setTab('Commandes')} />}
    </>
  )
}

function BusinessPicker({ state, value, onChange }: { state: GameState; value: string; onChange: (id: string) => void }) {
  return (
    <div className="picker">
      {state.businesses.map((b) => (
        <button key={b.id} className={`chip ${b.id === value ? 'active' : ''}`} onClick={() => onChange(b.id)}>
          <Icon name={b.sectorId as IconName} size={14} /> {b.name}
        </button>
      ))}
    </div>
  )
}

function linesText(b: Business | undefined, o: Order) {
  if (!b) return ''
  return o.lines.map((l) => `${num(l.qty)} ${productDef(b.sectorId, l.productId).name.toLowerCase()}`).join(', ')
}

// ---------- Commandes en cours et historique ----------

function OrdersTab({ state, act }: { state: GameState; act: Act }) {
  const pending = [...state.orders].sort((a, b) => a.dueDay - b.dueDay)
  return (
    <>
      <Section title={`En cours (${pending.length})`}>
        {!pending.length && <p className="muted small">Aucune commande en cours.</p>}
        {pending.map((o) => {
          const b = state.businesses.find((x) => x.id === o.businessId)
          const days = o.dueDay - state.day
          return (
            <div key={o.id} className="order">
              <div className="order-top">
                <strong>{getSupplier(state, o.supplierId).name}</strong>
                <strong>{eur(o.total)}</strong>
              </div>
              <div className="small muted">
                {b?.name} · {o.auto ? 'automatique' : 'manuelle'}
              </div>
              <div className="small">{linesText(b, o)}</div>
              <div className="order-top">
                <span className={`small strong ${o.delayed ? 'bad' : 'good'}`}>
                  {o.delayed ? 'En retard · ' : ''}Livraison le {dayLabel(o.dueDay)} {days <= 0 ? '(ce matin)' : `(dans ${days} j)`}
                </span>
                <button className="btn small-btn danger" onClick={() => act(cancelOrder, o.id)}>
                  Annuler
                </button>
              </div>
            </div>
          )
        })}
        <p className="muted small">Le paiement a lieu à la livraison.</p>
      </Section>
      {state.orderHistory.length > 0 && (
        <Section title="Historique">
          {state.orderHistory.slice(0, 12).map((o) => {
            const b = state.businesses.find((x) => x.id === o.businessId)
            return (
              <div key={o.id + o.status} className="history-row">
                <span className="choice-main">
                  <span className="small strong">{getSupplier(state, o.supplierId).name}</span>
                  <span className="small muted ellipsis">
                    {b?.name ?? 'Commerce vendu'} · {linesText(b, o)}
                  </span>
                </span>
                <span className="biz-side">
                  <span className={`small strong ${o.status === 'annulée' ? 'muted' : ''}`}>{o.status === 'annulée' ? 'Annulée' : eur(o.total)}</span>
                  <span className="small muted">{dayLabel(o.closedDay)}</span>
                </span>
              </div>
            )
          })}
        </Section>
      )}
    </>
  )
}

// ---------- Annuaire des fournisseurs ----------

function DirectoryTab({ state, act, b, onOrder }: { state: GameState; act: Act; b: Business; onOrder: () => void }) {
  return (
    <>
      <p className="muted small">Fournisseurs du secteur {getSector(b.sectorId).name.toLowerCase()}. La qualité influence le prix que les clients jugent juste et la réputation.</p>
      {sectorSuppliers(state, b.sectorId).map((x) => (
        <SupplierCard key={x.id} state={state} act={act} b={b} x={x} onOrder={onOrder} />
      ))}
    </>
  )
}

function SupplierCard({ state, act, b, x, onOrder }: { state: GameState; act: Act; b: Business; x: Supplier; onOrder: () => void }) {
  const fid = loyalty(x.spent)
  const wait = NEGOTIATION_COOLDOWN - (state.day - x.negotiatedDay)
  const used = b.products.filter((p) => p.supplierId === x.id).length
  return (
    <div className="supplier-card">
      <div className="order-top">
        <strong>{x.name}</strong>
        <span className={`tier-badge ${x.tier}`}>{TIER_LABEL[x.tier]}</span>
      </div>
      <div className="supplier-stats">
        <span>Qualité</span>
        <Meter value={x.quality} label="Qualité" />
        <strong>{x.quality}</strong>
        <span>Fiabilité</span>
        <Meter value={x.reliability * 100} label="Fiabilité" />
        <strong>{pct(x.reliability)}</strong>
      </div>
      <div className="supplier-facts small">
        <span>
          Prix <strong>{x.priceMult >= 1 ? '+' : '−'}{Math.abs(Math.round((x.priceMult - 1) * 100))} %</strong>
        </span>
        <span>
          Livre en <strong>{x.leadDays} j</strong>
        </span>
        <span>{x.minOrder ? `Frais de ${eur(x.deliveryFee)} sous ${eur(x.minOrder)}` : 'Sans minimum'}</span>
      </div>
      <div className="small muted">
        {fid.label}
        {fid.rate > 0 && ` (−${pct(fid.rate)})`}
        {fid.next !== null && ` · ${eur(x.spent)} achetés, prochain palier à ${eur(fid.next)}`}
        {x.negotiated > 0 && ` · remise négociée −${pct(x.negotiated)}`}
      </div>
      <div className="row wrap">
        <button className="btn small-btn" onClick={() => b.products.forEach((p) => act(setProductSupplier, b.id, p.id, x.id))} disabled={used === b.products.length}>
          {used === b.products.length ? 'Fournit tout le commerce' : used ? `Fournit ${used} produit${used > 1 ? 's' : ''} · tout lui confier` : 'Tout lui confier'}
        </button>
        <button className="btn small-btn" disabled={wait > 0 || x.negotiated >= MAX_NEGOTIATED} onClick={() => act(negotiate, x.id)}>
          {x.negotiated >= MAX_NEGOTIATED ? 'Remise maximale' : wait > 0 ? `Négocier (dans ${wait} j)` : 'Négocier'}
        </button>
        <button className="btn small-btn" onClick={onOrder}>
          Commander
        </button>
      </div>
    </div>
  )
}

// ---------- Nouvelle commande ----------

function NewOrderTab({ state, act, b, onDone }: { state: GameState; act: Act; b: Business; onDone: () => void }) {
  const suppliers = sectorSuppliers(state, b.sectorId)
  const [supplierId, setSupplierId] = useState(suppliers.find((x) => x.tier !== 'default')?.id ?? suppliers[0].id)
  const [qty, setQty] = useState<Record<string, number>>({})
  const supplier = suppliers.find((x) => x.id === supplierId) ?? suppliers[0]
  const lines = b.products.map((p) => ({ productId: p.id, qty: qty[p.id] ?? 0 }))
  const q = quote(supplier, b.sectorId, lines)
  const affordable = state.cash >= q.total

  return (
    <>
      <Section title="Fournisseur">
        <div className="picker">
          {suppliers.map((x) => (
            <button key={x.id} className={`chip ${x.id === supplier.id ? 'active' : ''}`} onClick={() => setSupplierId(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
        <p className="small muted">
          {TIER_LABEL[supplier.tier]} · qualité {supplier.quality} · livraison prévue le {dayLabel(state.day + supplier.leadDays)} · fiable à {pct(supplier.reliability)}
        </p>
      </Section>

      <Section title="Quantités">
        {b.products.map((p) => {
          const def = productDef(b.sectorId, p.id)
          return (
            <div key={p.id} className="qty-row">
              <span className="choice-main">
                <strong className="small">{def.name}</strong>
                <span className="small muted">
                  {num(stockOf(p))} en rayon{incoming(state, b.id, p.id) ? ` · +${num(incoming(state, b.id, p.id))} attendus` : ''}
                  {def.shelfLife ? ` · se garde ${def.shelfLife} j` : ''}
                </span>
              </span>
              <NumberField value={qty[p.id] ?? 0} step={Math.max(10, Math.round(p.restockTarget / 5 / 10) * 10)} onChange={(v) => setQty({ ...qty, [p.id]: v })} />
            </div>
          )
        })}
      </Section>

      <Section title="Récapitulatif">
        <table className="table">
          <tbody>
            <tr>
              <td>Sous-total</td>
              <td className="num">{eur(q.subtotal)}</td>
            </tr>
            {q.discountRate > 0 && (
              <tr>
                <td>Remises (volume, fidélité, négociation)</td>
                <td className="num good">−{eur(q.discount)}</td>
              </tr>
            )}
            {q.fee > 0 && (
              <tr>
                <td>Frais de livraison (moins de {eur(supplier.minOrder)})</td>
                <td className="num bad">+{eur(q.fee)}</td>
              </tr>
            )}
            <tr className="total">
              <td>Total à la livraison</td>
              <td className="num">{eur(q.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted">Remise volume : −2 % dès 500 €, −5 % dès 2 000 €, −8 % dès 5 000 €.</p>
        {q.subtotal > 0 && !affordable && <p className="small bad">Trésorerie insuffisante pour cette commande.</p>}
        <button
          className="btn primary block"
          disabled={q.subtotal <= 0 || !affordable}
          onClick={() => {
            act(placeOrder, b.id, supplier.id, qty)
            setQty({})
            onDone()
          }}
        >
          Passer la commande
        </button>
      </Section>
    </>
  )
}
