import { useState } from 'react'
import { businessValue, netWorth, openBusiness, openingCost } from '../game/engine'
import { LOCATIONS, SECTORS, getLocation, getSector } from '../game/sectors'
import type { GameState } from '../game/types'
import { BarChart, Section, Stat } from './common'
import { eur, num, signed } from './format'
import type { Act } from './useGame'

export function EmpireView({ state, act, onOpen }: { state: GameState; act: Act; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false)
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
              <span className="biz-emoji">{sector.emoji}</span>
              <span className="biz-main">
                <strong>{b.name}</strong>
                <span className="muted">
                  {sector.name} · {getLocation(b.locationId).name}
                </span>
                {alerts.length > 0 && <span className="alert-inline">⚠️ {alerts.join(' · ')}</span>}
              </span>
              <span className="biz-side">
                <span className={last && last.profit < 0 ? 'bad' : 'good'}>{last ? signed(last.profit) : '—'}</span>
                <span className="muted small">valeur {eur(businessValue(b))}</span>
              </span>
            </button>
          )
        })}
      </div>

      <button className="btn primary block" onClick={() => setCreating(true)}>
        ＋ Ouvrir une entreprise
      </button>

      {creating && (
        <NewBusinessSheet
          cash={state.cash}
          onClose={() => setCreating(false)}
          onCreate={(sectorId, locationId, name) => {
            act(openBusiness, sectorId, locationId, name)
            setCreating(false)
          }}
        />
      )}
    </>
  )
}

function NewBusinessSheet({
  cash,
  onClose,
  onCreate,
}: {
  cash: number
  onClose: () => void
  onCreate: (sectorId: string, locationId: string, name: string) => void
}) {
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const sector = sectorId ? getSector(sectorId) : null

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{!sector ? 'Choisir un secteur' : !locationId ? 'Choisir un emplacement' : 'Nommer votre entreprise'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {!sector &&
          SECTORS.map((s) => (
            <button key={s.id} className="choice" onClick={() => setSectorId(s.id)}>
              <span className="biz-emoji">{s.emoji}</span>
              <span className="biz-main">
                <strong>{s.name}</strong>
                <span className="muted small">{s.description}</span>
              </span>
              <span className="muted small">dès {eur(s.setupCost)}</span>
            </button>
          ))}

        {sector && !locationId && (
          <>
            {LOCATIONS.map((l) => {
              const cost = openingCost(sector.id, l.id)
              return (
                <button key={l.id} className="choice" disabled={cost > cash} onClick={() => setLocationId(l.id)}>
                  <span className="biz-main">
                    <strong>{l.name}</strong>
                    <span className="muted small">
                      {num(l.traffic)} passants/jour · loyer {eur(l.rentMonthly)}/mois
                    </span>
                  </span>
                  <span className={cost > cash ? 'bad small' : 'small'}>{eur(cost)}</span>
                </button>
              )
            })}
            <p className="muted small">Le coût inclut l'aménagement et deux mois de loyer en caution. Le stock de départ est acheté en plus.</p>
            <button className="btn" onClick={() => setSectorId(null)}>← Retour</button>
          </>
        )}

        {sector && locationId && (
          <>
            <input className="text-input" autoFocus placeholder={`${sector.name} ${getLocation(locationId).name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
            <p className="muted small">Coût d'ouverture : {eur(openingCost(sector.id, locationId))}</p>
            <div className="row">
              <button className="btn" onClick={() => setLocationId(null)}>← Retour</button>
              <button className="btn primary" onClick={() => onCreate(sector.id, locationId, name)}>Ouvrir</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
