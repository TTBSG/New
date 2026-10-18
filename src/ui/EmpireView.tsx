import { getParcel } from '../game/city'
import { businessValue, netWorth } from '../game/engine'
import { getSector } from '../game/sectors'
import type { GameState } from '../game/types'
import { BarChart, Section, Stat } from './common'
import { eur, signed } from './format'
import { Icon, type IconName } from './icons'

export function EmpireView({ state, onOpen, onFindLot }: { state: GameState; onOpen: (id: string) => void; onFindLot: () => void }) {
  const days = Math.min(30, ...state.businesses.map((b) => b.history.length).concat(30))
  const totals = Array.from({ length: days }, (_, i) =>
    state.businesses.reduce((sum, b) => sum + (b.history[b.history.length - days + i]?.profit ?? 0), 0),
  )
  const monthProfit = totals.reduce((a, x) => a + x, 0)

  return (
    <>
      <div className="stats">
        <Stat label="Valeur nette" value={eur(netWorth(state))} />
        <Stat label="Bénéfice 30 j" value={signed(monthProfit)} tone={monthProfit >= 0 ? 'good' : 'bad'} />
      </div>

      {state.businesses.length > 0 && (
        <Section title="Bénéfice quotidien du groupe">
          <BarChart values={totals} labels={totals.map((_, i) => `Jour ${state.day - days + i + 1}`)} />
        </Section>
      )}

      <div className="list">
        {state.businesses.map((b) => {
          const sector = getSector(b.sectorId)
          const last = b.history.at(-1)
          const alerts = []
          if (!b.employees.some((e) => sector.roles.find((r) => r.id === e.roleId)!.capacity > 0)) alerts.push('Aucun employé')
          else if (last && last.lostToCapacity > last.demand * 0.1) alerts.push('Personnel débordé')
          if (last && last.lostToStockout > last.demand * 0.1) alerts.push('Ruptures de stock')
          return (
            <button key={b.id} className="biz-card" onClick={() => onOpen(b.id)}>
              <span className="sector-badge" style={{ background: sector.color }}>
                <Icon name={b.sectorId as IconName} size={22} />
              </span>
              <span className="choice-main">
                <strong>{b.name}</strong>
                <span className="muted small">
                  {sector.name} · {getParcel(state.city, b.parcelId).address}
                </span>
                {alerts.length > 0 && (
                  <span className="alert-inline">
                    <Icon name="alert" size={13} /> {alerts.join(' · ')}
                  </span>
                )}
              </span>
              <span className="biz-side">
                <span className={`strong ${last && last.profit < 0 ? 'bad' : 'good'}`}>{last ? signed(last.profit) : '—'}</span>
                <span className="muted small">valeur {eur(businessValue(b))}</span>
              </span>
            </button>
          )
        })}
      </div>

      {state.businesses.length === 0 && <p className="muted center">Vous n'avez pas encore de commerce.</p>}
      <button className="btn primary block" onClick={onFindLot}>
        <Icon name="map" size={18} /> Trouver un local sur la carte
      </button>
    </>
  )
}
