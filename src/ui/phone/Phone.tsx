import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { dateOf } from '../../game/engine'
import type { GameState } from '../../game/types'
import { BusinessView } from '../BusinessView'
import { eur, signed } from '../format'
import { Icon, type IconName } from '../icons'
import { BankView, InfosView } from '../OtherViews'
import type { Act } from '../useGame'
import { CommercesApp, ComptaApp, RecrutApp, SettingsApp, businessAlerts } from './apps'
import { Avatar, MessagesApp, needsAttention } from './MessagesApp'
import { ObjectivesApp } from './ObjectivesApp'
import { activeObjectives, currentRank, rankTitle } from '../../game/objectives'
import { Meter } from '../common'

export type AppId = 'messages' | 'commerces' | 'banque' | 'compta' | 'recrut' | 'actus' | 'reglages' | 'objectifs' | 'avenir'

export interface PhoneRoute {
  app: AppId | null
  businessId?: string
  convId?: string
}

interface AppDef {
  id: AppId
  name: string
  icon: IconName
  color: string
}

const APPS: Record<AppId, AppDef> = {
  messages: { id: 'messages', name: 'Messages', icon: 'chat', color: '#4cb86b' },
  commerces: { id: 'commerces', name: 'Commerces', icon: 'empire', color: '#e8743b' },
  banque: { id: 'banque', name: 'Banque', icon: 'bank', color: '#3987e5' },
  compta: { id: 'compta', name: 'Compta', icon: 'chart', color: '#2fa58f' },
  recrut: { id: 'recrut', name: "Recrut'", icon: 'people', color: '#f2b134' },
  actus: { id: 'actus', name: 'Actus', icon: 'news', color: '#4cb8c4' },
  reglages: { id: 'reglages', name: 'Réglages', icon: 'gear', color: '#8a8f99' },
  objectifs: { id: 'objectifs', name: 'Objectifs', icon: 'trophy', color: '#e0a21b' },
  avenir: { id: 'avenir', name: 'À venir', icon: 'lock', color: '#b08f80' },
}
const GRID: AppId[] = ['objectifs', 'compta', 'recrut', 'actus', 'reglages']
const DOCK: AppId[] = ['messages', 'commerces', 'banque']
/** Applis des prochaines mises à jour, affichées verrouillées pour montrer la progression. */
const LOCKED: { name: string; icon: IconName; rank: number; text: string }[] = [
  { name: 'Fournisseurs', icon: 'box', rank: 3, text: 'Comparez les fournisseurs, négociez les prix, gérez les délais de livraison et les produits frais qui périment.' },
  { name: 'Immo', icon: 'key', rank: 4, text: 'Achetez les murs de vos boutiques au lieu de payer un loyer, et louez des locaux à d\'autres.' },
  { name: 'Logistique', icon: 'truck', rank: 4, text: 'Entrepôts et livraisons pour approvisionner plusieurs boutiques à moindre coût.' },
  { name: 'Bourse', icon: 'trendUp', rank: 5, text: 'Investissez, rachetez des concurrents ou faites entrer votre groupe en bourse.' },
]

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export function phoneBadges(state: GameState): Partial<Record<AppId, number>> {
  return {
    messages: state.inbox.filter(needsAttention).length,
    commerces: state.businesses.filter((b) => businessAlerts(b).length > 0).length,
  }
}

function AppIcon({ app, badge, onClick }: { app: AppDef; badge?: number; onClick: () => void }) {
  return (
    <button className="app-icon" onClick={onClick}>
      <span className="app-tile" style={{ background: app.color }}>
        <Icon name={app.icon} size={28} />
      </span>
      {!!badge && <span className="badge">{badge}</span>}
      <span className="app-name">{app.name}</span>
    </button>
  )
}

export function Phone({
  state,
  act,
  route,
  setRoute,
  onClose,
  onFindLot,
  onRestart,
  onImport,
}: {
  state: GameState
  act: Act
  route: PhoneRoute
  setRoute: (r: PhoneRoute) => void
  onClose: () => void
  onFindLot: () => void
  onRestart: () => void
  onImport: (s: GameState) => void
}) {
  const badges = phoneBadges(state)
  const { dragY, closing, close, dragHandlers } = useSwipeToClose(onClose)
  const app = route.app ? APPS[route.app] : null
  const business = route.businessId ? state.businesses.find((b) => b.id === route.businessId) : undefined

  const back = () => {
    if (route.app === 'commerces' && route.businessId) setRoute({ app: 'commerces' })
    else if (route.app === 'messages' && route.convId) setRoute({ app: 'messages' })
    else setRoute({ app: null })
  }

  let content: ReactNode = null
  switch (route.app) {
    case 'messages':
      content = <MessagesApp state={state} act={act} openId={route.convId ?? null} onOpen={(id) => setRoute({ app: 'messages', convId: id ?? undefined })} />
      break
    case 'commerces':
      content = business ? (
        <BusinessView state={state} business={business} act={act} />
      ) : (
        <CommercesApp state={state} onOpen={(id) => setRoute({ app: 'commerces', businessId: id })} onFindLot={() => close(onFindLot)} />
      )
      break
    case 'banque':
      content = <BankView state={state} act={act} />
      break
    case 'compta':
      content = <ComptaApp state={state} />
      break
    case 'recrut':
      content = <RecrutApp state={state} act={act} />
      break
    case 'actus':
      content = <InfosView state={state} />
      break
    case 'reglages':
      content = <SettingsApp state={state} onRestart={onRestart} onImport={onImport} />
      break
    case 'objectifs':
      content = <ObjectivesApp state={state} />
      break
    case 'avenir':
      content = <ComingSoon rank={currentRank(state)} />
      break
  }

  return (
    <div className={`phone-layer ${closing ? 'closing' : ''}`}>
      <div className="phone-backdrop" onClick={() => close()} style={{ opacity: dragY ? Math.max(0, 1 - dragY / 400) : undefined }} />
      <div
        className={`phone ${app ? 'in-app' : ''} ${dragY ? 'dragging' : ''}`}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-label="Téléphone"
      >
        {/* Toute la barre du haut sert de poignée : on peut faire glisser le téléphone vers le bas pour le fermer. */}
        <div className="phone-top" {...dragHandlers}>
          <div className="phone-grab" aria-hidden="true">
            <span />
          </div>
          {app ? (
            <div className="app-bar">
              <button className="app-back" onClick={back} aria-label="Retour">
                <Icon name="back" size={22} />
              </button>
              <span className="app-bar-tile" style={{ background: app.color }}>
                <Icon name={app.icon} size={16} />
              </span>
              <strong>{app.name}</strong>
            </div>
          ) : (
            <div className="status-line">{dateFmt.format(dateOf(state.day))}</div>
          )}
        </div>

        {app ? <div className="app-body">{content}</div> : <Home state={state} badges={badges} setRoute={setRoute} onMap={() => close()} />}
      </div>
    </div>
  )
}

/** Glisser la barre du haut vers le bas ferme le téléphone ; il suit le doigt et revient en place si le geste est trop court. */
function useSwipeToClose(onClose: () => void) {
  const [dragY, setDragY] = useState(0)
  const [closing, setClosing] = useState(false)
  const start = useRef<{ y: number; t: number; id: number; captured: boolean } | null>(null)
  const after = useRef<() => void>(onClose)

  const close = (then: () => void = onClose) => {
    after.current = then
    setDragY(0)
    setClosing(true)
  }

  // La fermeture attend la fin de l'animation de descente.
  useEffect(() => {
    if (!closing) return
    const id = setTimeout(() => after.current(), 260)
    return () => clearTimeout(id)
  }, [closing])

  const dragHandlers = {
    onPointerDown: (e: RPointerEvent) => {
      start.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId, captured: false }
    },
    onPointerMove: (e: RPointerEvent) => {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const dy = e.clientY - s.y
      // On ne capture le doigt qu'une fois le glissement engagé, pour que les boutons restent cliquables.
      if (!s.captured && dy > 8) {
        s.captured = true
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      }
      if (s.captured) setDragY(Math.max(0, dy))
    },
    onPointerUp: (e: RPointerEvent) => {
      const s = start.current
      start.current = null
      if (!s || !s.captured) return
      const dy = e.clientY - s.y
      const speed = dy / Math.max(1, e.timeStamp - s.t)
      if (dy > 120 || (dy > 40 && speed > 0.5)) close()
      else setDragY(0)
    },
    onPointerCancel: () => {
      start.current = null
      setDragY(0)
    },
  }

  return { dragY, closing, close, dragHandlers }
}

function ComingSoon({ rank }: { rank: number }) {
  return (
    <>
      <p className="muted small">Ces applis arrivent dans les prochaines mises à jour. Montez en rang pour être prêt à les utiliser.</p>
      {LOCKED.map((l) => (
        <div key={l.name} className="soon-card">
          <span className="app-tile soon-tile">
            <Icon name={l.icon} size={24} />
          </span>
          <div className="choice-main">
            <div className="objective-top">
              <strong>{l.name}</strong>
              <span className={`small strong ${rank >= l.rank ? 'good' : 'muted'}`}>{rank >= l.rank ? 'Rang atteint' : `Rang ${l.rank}`}</span>
            </div>
            <span className="small">{l.text}</span>
          </div>
        </div>
      ))}
    </>
  )
}

function Home({
  state,
  badges,
  setRoute,
  onMap,
}: {
  state: GameState
  badges: Partial<Record<AppId, number>>
  setRoute: (r: PhoneRoute) => void
  onMap: () => void
}) {
  const days = Math.min(14, ...state.businesses.map((b) => b.history.length).concat(14))
  const series = Array.from({ length: days }, (_, i) =>
    state.businesses.reduce((sum, b) => sum + (b.history[b.history.length - days + i]?.profit ?? 0), 0),
  )
  const week = series.slice(-7).reduce((a, x) => a + x, 0)
  const lo = Math.min(...series, 0)
  const hi = Math.max(...series, 1)
  const spark = series.map((v, i) => `${(i / Math.max(1, days - 1)) * 110 + 2},${40 - ((v - lo) / (hi - lo)) * 34}`).join(' ')
  const notif = state.inbox.find((c) => c.choices.length > 0) ?? state.inbox.find(needsAttention)
  const rank = currentRank(state)
  const next = activeObjectives(state).find((o) => !o.done)

  return (
    <div className="home">

      <div className="widget">
        <div>
          <div className="widget-label">TRÉSORERIE</div>
          <div className="widget-value">{eur(state.cash)}</div>
          {state.businesses.length > 0 && (
            <div className={`widget-delta ${week < 0 ? 'bad' : 'good'}`}>
              {week >= 0 ? '▲' : '▼'} {signed(week)} sur 7 jours
            </div>
          )}
        </div>
        {days > 1 && (
          <svg width="114" height="44" aria-hidden="true">
            <polyline points={spark} fill="none" stroke={week < 0 ? '#d64545' : '#2f9e55'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

 {next && (
        <button className="objective-strip" onClick={() => setRoute({ app: 'objectifs' })}>
          <span className="objective-strip-icon">
            <Icon name="trophy" size={18} />
          </span>
          <span className="choice-main">
            <span className="small muted">
              Rang {rank} · {rankTitle(rank)}
            </span>
            <strong className="small">{next.title}</strong>
            {next.target > 1 && <Meter value={next.current} max={next.target} label={next.title} />}
          </span>
        </button>
      )}

      {notif && (
        <button className="notif" onClick={() => setRoute({ app: 'messages', convId: notif.id })}>
          <Avatar kind={notif.kind} size={38} />
          <span className="choice-main">
            <strong className="small">{notif.contact}</strong>
            <span className="small muted ellipsis2">{notif.lines.at(-1)?.text}</span>
          </span>
          {notif.choices.length > 0 && <span className="pill">À décider</span>}
        </button>
      )}

      <div className="app-grid">
        {GRID.map((id) => (
          <AppIcon key={id} app={APPS[id]} badge={badges[id]} onClick={() => setRoute({ app: id })} />
        ))}
        <button className="app-icon" onClick={() => setRoute({ app: 'avenir' })}>
          <span className="app-tile folder">
            {LOCKED.map((l) => (
              <Icon key={l.name} name={l.icon} size={15} />
            ))}
          </span>
          <span className="app-name">À venir</span>
        </button>
      </div>

      <div className="dock">
        {DOCK.map((id) => (
          <AppIcon key={id} app={APPS[id]} badge={badges[id]} onClick={() => setRoute({ app: id })} />
        ))}
        <button className="app-icon" onClick={onMap}>
          <span className="app-tile" style={{ background: '#3987e5' }}>
            <Icon name="map" size={28} />
          </span>
          <span className="app-name">Carte</span>
        </button>
      </div>
    </div>
  )
}
