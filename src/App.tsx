import { useState } from 'react'
import { dateOf } from './game/engine'
import { BusinessView } from './ui/BusinessView'
import { CityView } from './ui/CityView'
import { EmpireView } from './ui/EmpireView'
import { eur } from './ui/format'
import { Icon, type IconName } from './ui/icons'
import { BankView, InfosView } from './ui/OtherViews'
import { useGame } from './ui/useGame'

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'city', label: 'Ville', icon: 'map' },
  { id: 'empire', label: 'Empire', icon: 'empire' },
  { id: 'bank', label: 'Banque', icon: 'bank' },
  { id: 'infos', label: 'Infos', icon: 'news' },
]
type View = 'city' | 'empire' | 'bank' | 'infos'

const SPEED_ICONS: IconName[] = ['pause', 'play', 'fast', 'fastest']
const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function App() {
  const { state, act, speed, setSpeed, restart } = useGame()
  const [view, setView] = useState<View>('city')
  const [openId, setOpenId] = useState<string | null>(null)
  const business = state.businesses.find((b) => b.id === openId)
  const onMap = view === 'city' && !business

  return (
    <div className={`app ${onMap ? 'on-map' : ''}`}>
      <header className="topbar">
        <div className={`chip-lg cash ${state.cash < 0 ? 'bad' : ''}`}>
          <span className="coin">
            <Icon name="coin" size={18} />
          </span>
          {eur(state.cash)}
        </div>
        <div className="chip-lg timebox">
          <span className="date">{dateFmt.format(dateOf(state.day))}</span>
          <div className="speed" role="group" aria-label="Vitesse du temps">
            {SPEED_ICONS.map((icon, i) => (
              <button
                key={icon}
                className={speed === i ? 'active' : ''}
                onClick={() => setSpeed(i)}
                disabled={state.gameOver && i > 0}
                aria-label={i === 0 ? 'Pause' : `Vitesse ${i}`}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {(state.daysInDebt > 0 || state.gameOver) && (
        <div className="banner">
          <Icon name="alert" size={18} />
          {state.gameOver ? (
            <>
              Faillite !{' '}
              <button className="btn small-btn" onClick={restart}>
                Nouvelle partie
              </button>
            </>
          ) : (
            `Trésorerie négative depuis ${state.daysInDebt} j — faillite à 30 j.`
          )}
        </div>
      )}

      {onMap ? (
        <CityView state={state} act={act} onManage={setOpenId} />
      ) : (
        <main className="content">
          {business ? (
            <BusinessView state={state} business={business} act={act} onBack={() => setOpenId(null)} />
          ) : view === 'empire' ? (
            <EmpireView state={state} onOpen={setOpenId} onFindLot={() => setView('city')} />
          ) : view === 'bank' ? (
            <BankView state={state} act={act} />
          ) : (
            <InfosView state={state} onRestart={restart} />
          )}
        </main>
      )}

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
            <Icon name={n.icon} size={22} />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
