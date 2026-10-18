import { getParcel } from '../../game/city'
import { businessValue, hire, monthlyWages, netWorth, serviceCapacity } from '../../game/engine'
import { getSector } from '../../game/sectors'
import type { Business, GameState } from '../../game/types'
import { BarChart, Section, Stat } from '../common'
import { eur, num, signed } from '../format'
import { Icon, type IconName } from '../icons'
import type { Act } from '../useGame'

export function businessAlerts(b: Business): string[] {
  const sector = getSector(b.sectorId)
  const last = b.history.at(-1)
  const alerts = []
  if (!b.employees.some((e) => sector.roles.find((r) => r.id === e.roleId)!.capacity > 0)) alerts.push('Aucun employé')
  else if (last && last.lostToCapacity > last.demand * 0.1) alerts.push('Personnel débordé')
  if (last && last.lostToStockout > last.demand * 0.1) alerts.push('Ruptures de stock')
  return alerts
}

const sum30 = (b: Business, k: 'revenue' | 'profit') => b.history.slice(-30).reduce((a, r) => a + r[k], 0)

// ---------- Commerces ----------

export function CommercesApp({ state, onOpen, onFindLot }: { state: GameState; onOpen: (id: string) => void; onFindLot: () => void }) {
  return (
    <>
      <div className="list">
        {state.businesses.map((b) => {
          const sector = getSector(b.sectorId)
          const last = b.history.at(-1)
          const alerts = businessAlerts(b)
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
                <span className="muted small">hier</span>
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

// ---------- Compta ----------

export function ComptaApp({ state }: { state: GameState }) {
  const days = Math.min(30, ...state.businesses.map((b) => b.history.length).concat(30))
  const totals = Array.from({ length: days }, (_, i) =>
    state.businesses.reduce((sum, b) => sum + (b.history[b.history.length - days + i]?.profit ?? 0), 0),
  )
  const monthProfit = totals.reduce((a, x) => a + x, 0)
  const wages = state.businesses.reduce((a, b) => a + monthlyWages(b), 0)
  return (
    <>
      <div className="stats">
        <Stat label="Valeur nette" value={eur(netWorth(state))} />
        <Stat label="Bénéfice 30 j" value={signed(monthProfit)} tone={monthProfit >= 0 ? 'good' : 'bad'} />
        <Stat label="Dette" value={eur(state.loan)} />
        <Stat label="Salaires / mois" value={eur(wages)} />
      </div>
      {state.businesses.length > 0 && (
        <>
          <Section title="Bénéfice quotidien du groupe">
            <BarChart values={totals} labels={totals.map((_, i) => `Jour ${state.day - days + i + 1}`)} />
          </Section>
          <Section title="Par commerce (30 derniers jours)">
            <table className="table">
              <thead>
                <tr>
                  <td className="muted small">Commerce</td>
                  <td className="num muted small">CA</td>
                  <td className="num muted small">Résultat</td>
                </tr>
              </thead>
              <tbody>
                {state.businesses.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td className="num">{eur(sum30(b, 'revenue'))}</td>
                    <td className={`num ${sum30(b, 'profit') < 0 ? 'bad' : 'good'}`}>{signed(sum30(b, 'profit'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Valeur de revente totale : {eur(state.businesses.reduce((a, b) => a + businessValue(b), 0))}</p>
          </Section>
        </>
      )}
    </>
  )
}

// ---------- Recrut' ----------

export function RecrutApp({ state, act }: { state: GameState; act: Act }) {
  if (!state.businesses.length) return <p className="muted center">Ouvrez un commerce pour voir les candidats de son secteur.</p>
  return (
    <>
      <p className="muted small">Les candidats sont renouvelés chaque lundi. Un bon niveau coûte plus cher, mais sert plus de clients.</p>
      {state.businesses.map((b) => {
        const sector = getSector(b.sectorId)
        const last = b.history.at(-1)
        return (
          <Section
            key={b.id}
            title={b.name}
            right={
              <span className="muted small">
                capacité {num(serviceCapacity(b))}/j{last ? ` · demande ${num(last.demand)}` : ''}
              </span>
            }
          >
            {sector.roles.map((role) => (
              <div key={role.id}>
                <h4>{role.name}</h4>
                {state.candidates
                  .filter((c) => c.sectorId === b.sectorId && c.roleId === role.id)
                  .map((c) => (
                    <div key={c.id} className="candidate">
                      <span className="choice-main">
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
        )
      })}
    </>
  )
}

// ---------- Réglages ----------

export function SettingsApp({ onRestart }: { onRestart: () => void }) {
  return (
    <>
      <Section title="Partie">
        <p className="muted small">La partie est sauvegardée automatiquement sur cet appareil.</p>
        <button className="btn danger block" onClick={() => confirm('Recommencer une nouvelle partie ? La partie en cours sera perdue.') && onRestart()}>
          Nouvelle partie
        </button>
      </Section>
      <Section title="À propos">
        <p className="small">Business Empire — prototype en développement.</p>
      </Section>
    </>
  )
}
