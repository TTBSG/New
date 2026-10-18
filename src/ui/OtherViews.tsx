import { useState } from 'react'
import { borrow, maxLoan, repay } from '../game/engine'
import { SECTORS, getSector } from '../game/sectors'
import type { GameState } from '../game/types'
import { Section, Stat } from './common'
import { eur } from './format'
import { Icon, type IconName } from './icons'
import type { Act } from './useGame'

export function BankView({ state, act }: { state: GameState; act: Act }) {
  const available = Math.max(0, maxLoan(state) - state.loan)
  return (
    <>
      <div className="stats">
        <Stat label="Dette" value={eur(state.loan)} tone={state.loan > 0 ? 'bad' : undefined} />
        <Stat label="Disponible" value={eur(available)} />
        <Stat label="Taux annuel" value={`${(state.loanRate * 100).toFixed(1)} %`} />
        <Stat label="Intérêts / mois" value={eur((state.loan * state.loanRate) / 12)} />
      </div>
      <Section title="Emprunter">
        <p className="muted small">Votre plafond dépend de la valeur de vos entreprises.</p>
        <div className="row wrap">
          {[10000, 25000, 50000].map((v) => (
            <button key={v} className="btn" disabled={available <= 0} onClick={() => act(borrow, v)}>
              +{eur(v)}
            </button>
          ))}
          <button className="btn" disabled={available <= 0} onClick={() => act(borrow, available)}>Maximum</button>
        </div>
      </Section>
      <Section title="Rembourser">
        <div className="row wrap">
          {[10000, 25000].map((v) => (
            <button key={v} className="btn" disabled={state.loan <= 0 || state.cash <= 0} onClick={() => act(repay, v)}>
              −{eur(v)}
            </button>
          ))}
          <button className="btn" disabled={state.loan <= 0 || state.cash <= 0} onClick={() => act(repay, state.loan)}>Tout</button>
        </div>
      </Section>
    </>
  )
}

const trendLabel = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)} %`

function MarketView({ state }: { state: GameState }) {
  return (
    <>
      <div className="stats">
        <Stat label="Conjoncture" value={trendLabel(state.economy)} tone={state.economy >= 1 ? 'good' : 'bad'} hint="effet sur toute la demande" />
      </div>
      <Section title="Tendances des secteurs">
        <table className="table">
          <tbody>
            {SECTORS.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="inline-icon" style={{ color: s.color }}>
                    <Icon name={s.id as IconName} size={16} />
                  </span>{' '}
                  {s.name}
                </td>
                <td className={`num ${state.sectorTrends[s.id] >= 1 ? 'good' : 'bad'}`}>{trendLabel(state.sectorTrends[s.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Événements en cours">
        {state.events.length === 0 && <p className="muted">Rien de particulier.</p>}
        {state.events.map((e) => (
          <p key={e.id} className="small">
            <strong>{e.title}</strong> ({e.sectorId ? getSector(e.sectorId).name : 'tous secteurs'}, {trendLabel(e.demandMult)}, encore {e.endsDay - state.day + 1} j)
            <br />
            <span className="muted">{e.description}</span>
          </p>
        ))}
      </Section>
    </>
  )
}

function JournalView({ state }: { state: GameState }) {
  return (
    <>
      <Section title="Journal">
        {state.log.map((l, i) => (
          <p key={i} className={`log ${l.tone}`}>
            <span className="muted small">J{l.day}</span> {l.text}
          </p>
        ))}
      </Section>
    </>
  )
}

export function InfosView({ state }: { state: GameState }) {
  const [tab, setTab] = useState<'marche' | 'journal'>('marche')
  return (
    <>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'marche'} className={tab === 'marche' ? 'active' : ''} onClick={() => setTab('marche')}>
          Marché
        </button>
        <button role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>
          Journal
        </button>
      </div>
      {tab === 'marche' ? <MarketView state={state} /> : <JournalView state={state} />}
    </>
  )
}
