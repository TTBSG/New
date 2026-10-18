import { useState } from 'react'
import { dateOf } from './game/engine'
import { BusinessView } from './ui/BusinessView'
import { eur } from './ui/format'
import { EmpireView } from './ui/EmpireView'
import { BankView, JournalView, MarketView } from './ui/OtherViews'
import { useGame } from './ui/useGame'

const NAV = [
  { id: 'empire', label: 'Empire', icon: '🏢' },
  { id: 'market', label: 'Marché', icon: '📈' },
  { id: 'bank', label: 'Banque', icon: '🏦' },
  { id: 'journal', label: 'Journal', icon: '📰' },
] as const
type View = (typeof NAV)[number]['id']

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function App() {
  const { state, act, speed, setSpeed, restart } = useGame()
  const [view, setView] = useState<View>('empire')
  const [openId, setOpenId] = useState<string | null>(null)
  const business = state.businesses.find((b) => b.id === openId)

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="date">{dateFmt.format(dateOf(state.day))}</div>
          <div className={`cash ${state.cash < 0 ? 'bad' : ''}`}>{eur(state.cash)}</div>
        </div>
        <div className="speed" role="group" aria-label="Vitesse">
          {['⏸', '▶', '⏩', '⏭'].map((icon, i) => (
            <button key={i} className={speed === i ? 'active' : ''} onClick={() => setSpeed(i)} disabled={state.gameOver && i > 0} aria-label={i === 0 ? 'Pause' : `Vitesse ${i}`}>
              {icon}
            </button>
          ))}
        </div>
      </header>

      {state.daysInDebt > 0 && !state.gameOver && <div className="banner bad">⚠️ Trésorerie négative depuis {state.daysInDebt} j — faillite à 30 j.</div>}
      {state.gameOver && (
        <div className="banner bad">
          💀 Faillite ! <button className="btn small-btn" onClick={restart}>Nouvelle partie</button>
        </div>
      )}

      <main className="content">
        {business ? (
          <BusinessView state={state} business={business} act={act} onBack={() => setOpenId(null)} />
        ) : view === 'empire' ? (
          <EmpireView state={state} act={act} onOpen={setOpenId} />
        ) : view === 'market' ? (
          <MarketView state={state} />
        ) : view === 'bank' ? (
          <BankView state={state} act={act} />
        ) : (
          <JournalView state={state} onRestart={restart} />
        )}
      </main>

      <nav className="bottomnav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={view === n.id && !business ? 'active' : ''}
            onClick={() => {
              setView(n.id)
              setOpenId(null)
            }}
          >
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
