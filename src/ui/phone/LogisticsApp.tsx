import { useState } from 'react'
import { getParcel } from '../../game/city'
import { canDelegate, OFFICE_ROLES } from '../../game/hq'
import { currentRank } from '../../game/objectives'
import { getSector } from '../../game/sectors'
import { productDef, stockOf } from '../../game/stock'
import { costOf, getSupplier, incoming, sectorSuppliers } from '../../game/supply'
import type { GameState, Warehouse } from '../../game/types'
import {
  COLD_ROOM,
  HANDLER,
  TRUCK,
  WAREHOUSE_LEVELS,
  WAREHOUSE_PRICE_CUT,
  WAREHOUSE_RANK,
  canStore,
  closeWarehouse,
  installColdRoom,
  servedShops,
  setShopSupply,
  setWarehouseProduct,
  setWarehouseStaff,
  suggestedTarget,
  upgradeWarehouse,
  warehouseLevel,
  warehouseMonthlyCost,
  warehouseRent,
  warehouseStock,
} from '../../game/warehouse'
import { Meter, NumberField, Section, Stat } from '../common'
import { TIER_LABEL, eur, num } from '../format'
import { Icon, type IconName } from '../icons'
import type { Act } from '../useGame'

const TABS = ['Aperçu', 'Stock', 'Boutiques'] as const
type Tab = (typeof TABS)[number]

export function LogisticsApp({
  state,
  act,
  warehouseId,
  onOpen,
  onFindLot,
}: {
  state: GameState
  act: Act
  warehouseId: string | null
  onOpen: (id: string | null) => void
  onFindLot: () => void
}) {
  const w = warehouseId ? state.warehouses.find((x) => x.id === warehouseId) : undefined
  if (w) return <WarehouseView state={state} act={act} w={w} />
  return (
    <>
      {state.warehouses.map((x) => (
        <button key={x.id} className="biz-card" onClick={() => onOpen(x.id)}>
          <span className="sector-badge" style={{ background: getSector(x.sectorId).color }}>
            <Icon name={x.sectorId as IconName} size={22} />
          </span>
          <span className="choice-main">
            <strong>Entrepôt {getSector(x.sectorId).name.toLowerCase()}</strong>
            <span className="muted small">
              {warehouseLevel(x).name} · {servedShops(state, x).length} boutique(s) livrée(s)
            </span>
            {(x.history.at(-1)?.unserved ?? 0) > 0 && (
              <span className="alert-inline">
                <Icon name="alert" size={13} /> Boutiques non livrées cette nuit
              </span>
            )}
          </span>
          <span className="biz-side">
            <span className="strong">{Math.round((warehouseStock(x) / warehouseLevel(x).capacity) * 100)} %</span>
            <span className="muted small">rempli</span>
          </span>
        </button>
      ))}
      <Requirements state={state} onFindLot={onFindLot} />
    </>
  )
}

function Requirements({ state, onFindLot }: { state: GameState; onFindLot: () => void }) {
  const rankOk = currentRank(state) >= WAREHOUSE_RANK
  const staffOk = canDelegate(state, 'logisticien')
  return (
    <Section title={state.warehouses.length ? 'Ouvrir un autre entrepôt' : 'Vos entrepôts'}>
      <p className="small">
        Un entrepôt achète en gros (fournisseur « gros volume » et −{Math.round(WAREHOUSE_PRICE_CUT * 100)} % de tarif grossiste), stocke, puis livre chaque nuit vos boutiques du secteur avec vos camions. Plus de
        frais de livraison boutique par boutique, et une réserve en cas de retard.
      </p>
      <p className="small muted">
        Rentable surtout quand la marchandise pèse lourd dans le chiffre d'affaires (électronique, supérette, vêtements) et à partir de 3 ou 4 boutiques. Pour des cafés, c'est rarement intéressant.
      </p>
      <div className="checklist">
        <span className={rankOk ? 'good' : 'muted'}>
          <Icon name={rankOk ? 'check' : 'lock'} size={14} /> Rang {WAREHOUSE_RANK}
        </span>
        <span className={staffOk ? 'good' : 'muted'}>
          <Icon name={staffOk ? 'check' : 'lock'} size={14} /> Un {OFFICE_ROLES.logisticien.name.toLowerCase()} au siège
        </span>
        <span className="muted">
          <Icon name="map" size={14} /> Un local libre de la zone commerciale
        </span>
      </div>
      <button className="btn primary block" disabled={!rankOk || !staffOk} onClick={onFindLot}>
        <Icon name="map" size={18} /> Choisir un local sur la carte
      </button>
      <table className="table">
        <thead>
          <tr>
            <td className="muted small">Niveau</td>
            <td className="num muted small">Capacité</td>
            <td className="num muted small">Coût</td>
          </tr>
        </thead>
        <tbody>
          {WAREHOUSE_LEVELS.map((l) => (
            <tr key={l.name}>
              <td>{l.name}</td>
              <td className="num">{num(l.capacity)} u.</td>
              <td className="num">{eur(l.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function WarehouseView({ state, act, w }: { state: GameState; act: Act; w: Warehouse }) {
  const [tab, setTab] = useState<Tab>('Aperçu')
  const sector = getSector(w.sectorId)
  return (
    <>
      <div className="biz-header">
        <span className="sector-badge" style={{ background: sector.color }}>
          <Icon name="truck" size={22} />
        </span>
        <div>
          <h2>Entrepôt {sector.name.toLowerCase()}</h2>
          <span className="muted small">
            {warehouseLevel(w).name} · {getParcel(state.city, w.parcelId).address}
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
      {tab === 'Aperçu' && <Overview state={state} act={act} w={w} />}
      {tab === 'Stock' && <StockTab state={state} act={act} w={w} />}
      {tab === 'Boutiques' && <ShopsTab state={state} act={act} w={w} />}
    </>
  )
}

function Overview({ state, act, w }: { state: GameState; act: Act; w: Warehouse }) {
  const level = warehouseLevel(w)
  const next = WAREHOUSE_LEVELS[w.level]
  const last = w.history.at(-1)
  const month = w.history.reduce((a, d) => a + d.cost, 0)
  const shops = servedShops(state, w).length
  return (
    <>
      <div className="stats">
        <Stat label="Remplissage" value={`${num(warehouseStock(w))} / ${num(level.capacity)}`} hint={<Meter value={warehouseStock(w)} max={level.capacity} label="Remplissage" />} />
        <Stat label="Expédié cette nuit" value={`${num(last?.shipped ?? 0)} u.`} hint={last?.unserved ? `${last.unserved} boutique(s) non livrée(s)` : undefined} />
        <Stat label="Coût fixe" value={`${eur(warehouseMonthlyCost(state, w))}/mois`} hint={`dont loyer ${eur(warehouseRent(state, w))}`} />
        <Stat label="Coût réel" value={`${eur(month)}`} hint={`sur ${w.history.length} jours, carburant compris`} />
      </div>
      {!!last?.unserved && (
        <div className="alert">
          <Icon name="alert" size={18} /> <span>Des boutiques n'ont pas été livrées cette nuit : ajoutez des camions ou des magasiniers.</span>
        </div>
      )}
      <Section title="Équipe et camions">
        <div className="field">
          <label>
            Magasiniers · {num(HANDLER.unitsPerNight)} unités par nuit chacun · {eur(HANDLER.salary)}/mois
          </label>
          <NumberField value={w.handlers} step={1} onChange={(v) => act(setWarehouseStaff, w.id, v, w.trucks)} />
        </div>
        <div className="field">
          <label>
            Camions avec chauffeur · {TRUCK.shopsPerNight} boutiques par nuit chacun · {eur(TRUCK.salary + TRUCK.lease)}/mois
          </label>
          <NumberField value={w.trucks} step={1} onChange={(v) => act(setWarehouseStaff, w.id, w.handlers, v)} />
        </div>
        <p className="small muted">
          Capacité de livraison : {num(w.handlers * HANDLER.unitsPerNight)} unités et {w.trucks * TRUCK.shopsPerNight} boutiques par nuit, pour {shops} boutique(s) rattachée(s). Carburant : {eur(TRUCK.fuelPerStop)} par arrêt.
        </p>
      </Section>
      <Section title="Chambre froide">
        {w.cold ? (
          <p className="small good strong">
            <Icon name="check" size={14} /> Installée : les produits frais peuvent passer par l'entrepôt et se gardent {COLD_ROOM.extraLife} jours de plus.
          </p>
        ) : (
          <>
            <p className="small">Indispensable pour stocker les produits qui périment. Elle les conserve aussi {COLD_ROOM.extraLife} jours de plus.</p>
            <button className="btn block" disabled={state.cash < COLD_ROOM.cost} onClick={() => act(installColdRoom, w.id)}>
              Installer · {eur(COLD_ROOM.cost)} + {eur(COLD_ROOM.monthly)}/mois
            </button>
          </>
        )}
      </Section>
      {next && (
        <Section title={`Agrandir : ${next.name}`}>
          <p className="small">
            Capacité {num(next.capacity)} unités · loyer ×{next.rentMult}
          </p>
          <button className="btn primary block" disabled={state.cash < next.cost} onClick={() => confirm(`Agrandir l'entrepôt pour ${eur(next.cost)} ?`) && act(upgradeWarehouse, w.id)}>
            Agrandir pour {eur(next.cost)}
          </button>
        </Section>
      )}
      <button className="btn danger block" onClick={() => confirm('Fermer cet entrepôt ? Le stock restant sera perdu et les commandes annulées.') && act(closeWarehouse, w.id)}>
        Fermer l'entrepôt
      </button>
    </>
  )
}

function StockTab({ state, act, w }: { state: GameState; act: Act; w: Warehouse }) {
  const suppliers = sectorSuppliers(state, w.sectorId)
  return (
    <>
      <p className="small muted">
        L'entrepôt recommande un produit quand son stock (commandes en cours comprises) passe sous la moitié de la cible. Avec un fournisseur lent, prévoyez une cible plus haute.
      </p>
      {w.products.map((p) => {
        const def = productDef(w.sectorId, p.id)
        const storable = canStore(w, p.id)
        const suggested = suggestedTarget(state, w, p.id)
        const sup = getSupplier(state, p.supplierId)
        return (
          <Section key={p.id} title={def.name} right={<span className="muted small">{num(stockOf(p))} en stock</span>}>
            {!storable ? (
              <p className="small warn">Produit frais : installez une chambre froide pour le faire passer par l'entrepôt.</p>
            ) : (
              <>
                <div className="stock-line">
                  {incoming(state, w.id, p.id) > 0 && <span className="good">+{num(incoming(state, w.id, p.id))} commandés</span>}
                  {p.avgCost !== undefined && stockOf(p) > 0 && <span>coût moyen {costOf(state, w.sectorId, p).toFixed(2).replace('.', ',')} €</span>}
                </div>
                <div className="field">
                  <label>Fournisseur</label>
                  <div className="picker">
                    {suppliers.map((x) => (
                      <button key={x.id} className={`chip ${x.id === p.supplierId ? 'active' : ''}`} onClick={() => act(setWarehouseProduct, w.id, p.id, { supplierId: x.id })}>
                        {x.name}
                      </button>
                    ))}
                  </div>
                  <span className="small muted">
                    {TIER_LABEL[sup.tier]} · qualité {sup.quality} · livre en {sup.leadDays} j
                  </span>
                </div>
                <div className="field">
                  <label>Stock cible{suggested ? ` (conseil : ${num(suggested)}, une semaine de ventes)` : ''}</label>
                  <NumberField value={p.restockTarget} step={Math.max(10, Math.round(p.restockTarget / 10 / 10) * 10)} onChange={(v) => act(setWarehouseProduct, w.id, p.id, { restockTarget: v })} />
                </div>
                {suggested > 0 && p.restockTarget === 0 && (
                  <button className="btn small-btn" onClick={() => act(setWarehouseProduct, w.id, p.id, { restockTarget: suggested })}>
                    Appliquer le conseil
                  </button>
                )}
              </>
            )}
          </Section>
        )
      })}
    </>
  )
}

function ShopsTab({ state, act, w }: { state: GameState; act: Act; w: Warehouse }) {
  const shops = state.businesses.filter((b) => b.sectorId === w.sectorId)
  return (
    <>
      <p className="small muted">Les boutiques rattachées sont livrées chaque nuit. Si l'entrepôt manque d'un produit, la boutique le commande elle-même à son fournisseur, en secours.</p>
      {shops.map((b) => {
        const on = b.products.some((p) => p.fromWarehouse)
        return (
          <div key={b.id} className="rule shop-rule">
            <div className="rule-top">
              <span className="choice-main">
                <strong>{b.name}</strong>
                <span className="small muted">{getParcel(state.city, b.parcelId).address}</span>
              </span>
              <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => act(setShopSupply, b.id, !on)} />
            </div>
            {on && (
              <span className="small muted">
                Produits livrés : {b.products.filter((p) => p.fromWarehouse).map((p) => productDef(b.sectorId, p.id).name.toLowerCase()).join(', ')}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
