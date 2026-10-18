import { useEffect, useRef, useState } from 'react'
import { RANKS } from '../game/objectives'
import { getSector } from '../game/sectors'
import type { Celebration, GameState } from '../game/types'
import { eur, signed } from './format'
import { Icon, type IconName } from './icons'

// ---------- Tutoriel ----------

export interface TutorialStep {
  n: number
  title: string
  text: string
  action?: 'recrut' | 'objectifs'
  highlight?: 'speed'
}

const hasStaff = (s: GameState) =>
  s.businesses.some((b) => b.employees.some((e) => getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!.capacity > 0))

/** Étape du tutoriel déduite de l'avancement réel du joueur. */
export function tutorialStep(s: GameState): TutorialStep | null {
  if (s.flags.tuto_done) return null
  if (!s.businesses.length)
    return {
      n: 1,
      title: 'Choisissez un local',
      text: 'Touchez un panneau « À louer » sur la carte. Astuce : le filtre « Fréquentation » montre les rues les plus passantes.',
    }
  if (!hasStaff(s))
    return {
      n: 2,
      title: 'Embauchez votre équipe',
      text: `Sans personnel, ${s.businesses[0].name} ne peut servir personne. Embauchez une ou deux personnes.`,
      action: 'recrut',
    }
  if (!s.flags.tuto_play)
    return { n: 3, title: 'Lancez le temps', text: 'Appuyez sur ▶ en haut à droite : les jours défilent et les clients arrivent.', highlight: 'speed' }
  return {
    n: 4,
    title: 'Suivez votre progression',
    text: "Vos objectifs et leurs primes sont dans l'appli Objectifs du téléphone. Camille vous écrira si quelque chose cloche.",
    action: 'objectifs',
  }
}

export function TutorialCard({ step, onAction, onSkip }: { step: TutorialStep; onAction: () => void; onSkip: () => void }) {
  return (
    <div className="coach">
      <div className="coach-head">
        <span className="coach-step">Étape {step.n}/4</span>
        <button className="coach-skip" onClick={onSkip}>
          Passer le tutoriel
        </button>
      </div>
      <strong>{step.title}</strong>
      <p className="small">{step.text}</p>
      {step.action && (
        <button className="btn primary block" onClick={onAction}>
          {step.action === 'recrut' ? "Ouvrir Recrut'" : 'Voir mes objectifs'}
        </button>
      )}
    </div>
  )
}

// ---------- Célébrations ----------

export function RankUpModal({ c, onClose }: { c: Celebration; onClose: () => void }) {
  const unlocked = RANKS.find((r) => r.rank === (c.rankUp ?? 0) - 1)?.unlockSectors ?? []
  return (
    <div className="celebrate-backdrop" onClick={onClose}>
      <div className="celebrate" onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 7.3) % 100}%`, animationDelay: `${(i % 5) * 0.12}s`, background: ['#e8743b', '#f2b134', '#3987e5', '#4cb86b', '#e85d8a'][i % 5] }} />
          ))}
        </div>
        <span className="celebrate-icon">
          <Icon name="trophy" size={40} />
        </span>
        <div className="info-title">NOUVEAU RANG</div>
        <h2>{c.title}</h2>
        {c.prime > 0 && <p className="good strong">Prime de {eur(c.prime)}</p>}
        {unlocked.map((id) => (
          <p key={id} className="small">
            <span className="inline-icon" style={{ color: getSector(id).color }}>
              <Icon name={id as IconName} size={16} />
            </span>{' '}
            Nouveau secteur disponible : <strong>{getSector(id).name}</strong>
          </p>
        ))}
        <button className="btn primary block" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  )
}

export function ObjectiveBanner({ c, inPhone }: { c: Celebration; inPhone: boolean }) {
  return (
    <div className={`objective-banner ${inPhone ? 'in-phone' : ''}`} role="status">
      <span className="objective-banner-icon">
        <Icon name="check" size={16} />
      </span>
      <span className="choice-main">
        <span className="small muted">Objectif atteint</span>
        <strong className="small">{c.title}</strong>
      </span>
      {c.prime > 0 && <strong className="good small">+{eur(c.prime)}</strong>}
    </div>
  )
}

// ---------- Trésorerie animée ----------

/** Affiche un montant qui défile vers sa nouvelle valeur. */
export function AnimatedCash({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450)
      const v = a + (value - a) * (1 - (1 - k) ** 3)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{eur(shown)}</>
}

/** Petit « +196 € » qui s'envole sous la trésorerie à chaque nouveau jour. */
export function DailyDelta({ day, cash }: { day: number; cash: number }) {
  const last = useRef({ day, cash })
  const [delta, setDelta] = useState<{ key: number; value: number } | null>(null)
  useEffect(() => {
    if (day === last.current.day) return
    const value = cash - last.current.cash
    last.current = { day, cash }
    if (Math.abs(value) >= 1) setDelta({ key: day, value })
  }, [day, cash])
  if (!delta) return null
  return (
    <span key={delta.key} className={`daily-delta ${delta.value < 0 ? 'bad' : 'good'}`}>
      {signed(delta.value)}
    </span>
  )
}
