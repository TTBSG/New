import { useEffect, useRef, useState } from 'react'
import { dateOf, dismissCelebration, setFlag } from './game/engine'
import type { Conversation } from './game/types'
import { CityView } from './ui/CityView'
import { Icon, type IconName } from './ui/icons'
import { AnimatedCash, DailyDelta, ObjectiveBanner, RankUpModal, TutorialCard, tutorialStep } from './ui/Overlays'
import { Avatar } from './ui/phone/MessagesApp'
import { Phone, phoneBadges, type PhoneRoute } from './ui/phone/Phone'
import { useGame } from './ui/useGame'

/** Vibration courte (Android) ; ignorée tant que le joueur n'a pas touché l'écran, et sur iPhone. */
function vibrate(pattern: number | number[]) {
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pattern)
}

const SPEED_ICONS: IconName[] = ['pause', 'play', 'fast', 'fastest']
const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function App() {
  const { state, act, speed, setSpeed, restart, replace } = useGame()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [route, setRoute] = useState<PhoneRoute>({ app: null })
  const [toast, setToast] = useState<Conversation | null>(null)
  const [citySheetOpen, setCitySheetOpen] = useState(false)

  const openPhone = (r: PhoneRoute) => {
    setRoute(r)
    setPhoneOpen(true)
  }

  // Notification façon téléphone quand un nouveau message arrive.
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!seen.current) {
      // Au lancement, seul le message non lu le plus récent est notifié.
      const newest = state.inbox.find((c) => c.unread)
      seen.current = new Set(state.inbox.filter((c) => c !== newest).map((c) => c.id))
    }
    const fresh = state.inbox.find((c) => c.unread && !seen.current!.has(c.id))
    for (const c of state.inbox) seen.current.add(c.id)
    if (!fresh) return
    vibrate(30)
    // Une décision à prendre met le jeu en pause pour laisser le temps de répondre.
    if (fresh.choices.length > 0) setSpeed(0)
    if (!(phoneOpen && route.app === 'messages')) setToast(fresh)
  }, [state.inbox, phoneOpen, route.app, setSpeed])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  // Célébrations : bannière pour un objectif, fenêtre pour un nouveau rang.
  const celebration = state.celebrations[0] ?? null
  // L'objet change à chaque jour de jeu : on ne réagit qu'à un changement de célébration.
  const celebrationKey = celebration ? `${celebration.id}:${state.celebrations.length}` : null
  const celebrationIsRank = !!celebration?.rankUp
  useEffect(() => {
    if (!celebrationKey) return
    vibrate(celebrationIsRank ? [40, 60, 40] : 25)
    if (celebrationIsRank) {
      setSpeed(0)
      return
    }
    const id = setTimeout(() => act(dismissCelebration), 3200)
    return () => clearTimeout(id)
  }, [celebrationKey, celebrationIsRank, act, setSpeed])

  // Tutoriel : l'étape 3 est validée dès que le temps est lancé.
  const step = tutorialStep(state)
  useEffect(() => {
    if (speed > 0 && !state.flags.tuto_play && state.businesses.length) act(setFlag, 'tuto_play')
  }, [speed, state.flags.tuto_play, state.businesses.length, act])

  const badges = phoneBadges(state)
  const badgeTotal = (badges.messages ?? 0) + (badges.commerces ?? 0)

  return (
    <div className="app on-map">
      <header className="topbar">
        <div className={`chip-lg cash ${state.cash < 0 ? 'bad' : ''}`}>
          <span className="coin">
            <Icon name="coin" size={18} />
          </span>
          <AnimatedCash value={state.cash} />
          <DailyDelta day={state.day} cash={state.cash} />
        </div>
        <div className="chip-lg timebox">
          <span className="date">{dateFmt.format(dateOf(state.day))}</span>
          <div className={`speed ${step?.highlight === 'speed' ? 'pulse' : ''}`} role="group" aria-label="Vitesse du temps">
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

      <CityView
        state={state}
        act={act}
        onManage={(businessId) => openPhone({ app: 'commerces', businessId })}
        onHq={() => openPhone({ app: 'siege' })}
        onSheetChange={setCitySheetOpen}
      />

      {!phoneOpen && !citySheetOpen && (
        <button className="phone-button" onClick={() => openPhone(route.app ? route : { app: null })} aria-label="Ouvrir le téléphone">
          <Icon name="phone" size={28} />
          {badgeTotal > 0 && <span className="badge">{badgeTotal}</span>}
        </button>
      )}

      {step && !phoneOpen && !citySheetOpen && (
        <TutorialCard
          step={step}
          onSkip={() => act(setFlag, 'tuto_done')}
          onAction={() => {
            if (step.action === 'objectifs') act(setFlag, 'tuto_done')
            openPhone({ app: step.action! })
          }}
        />
      )}

      {celebration && !celebration.rankUp && <ObjectiveBanner key={celebration.id} c={celebration} inPhone={phoneOpen} />}
      {celebration?.rankUp && <RankUpModal c={celebration} onClose={() => act(dismissCelebration)} />}

      {toast && !phoneOpen && (
        <button
          className="toast"
          onClick={() => {
            openPhone({ app: 'messages', convId: toast.id })
            setToast(null)
          }}
        >
          <Avatar kind={toast.kind} size={36} />
          <span className="choice-main">
            <strong className="small">{toast.contact}</strong>
            <span className="small muted ellipsis">{toast.lines.at(-1)?.text}</span>
          </span>
        </button>
      )}

      {phoneOpen && (
        <Phone
          state={state}
          act={act}
          route={route}
          setRoute={setRoute}
          onClose={() => setPhoneOpen(false)}
          onFindLot={() => {
            setPhoneOpen(false)
            setRoute({ app: null })
          }}
          onImport={(loaded) => {
            seen.current = null
            replace(loaded)
            setPhoneOpen(false)
            setRoute({ app: null })
          }}
          onRestart={() => {
            seen.current = null
            restart()
            setPhoneOpen(false)
            setRoute({ app: null })
          }}
        />
      )}
    </div>
  )
}
