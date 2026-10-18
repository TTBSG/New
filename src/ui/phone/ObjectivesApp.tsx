import { RANKS, activeObjectives, currentRank, rankTitle } from '../../game/objectives'
import { getSector } from '../../game/sectors'
import type { GameState } from '../../game/types'
import { Meter, Section } from '../common'
import { eur, num } from '../format'
import { Icon, type IconName } from '../icons'

export function ObjectivesApp({ state }: { state: GameState }) {
  const rank = currentRank(state)
  const objectives = activeObjectives(state)
  const done = objectives.filter((o) => o.done).length
  const reward = RANKS.find((r) => r.rank === rank)

  return (
    <>
      <div className="rank-card">
        <span className="rank-badge">{Math.min(rank, RANKS.length)}</span>
        <div>
          <div className="info-title">VOTRE RANG</div>
          <strong className="rank-title">{rankTitle(rank)}</strong>
          {rank <= RANKS.length && (
            <div className="small muted">
              {done}/{objectives.length} objectifs pour passer au rang suivant
            </div>
          )}
        </div>
      </div>

      {rank > RANKS.length ? (
        <p className="center">Vous avez tout accompli. Chapeau bas ! 🏆</p>
      ) : (
        <>
          <Section title="Objectifs en cours">
            {objectives.map((o) => (
              <div key={o.id} className={`objective ${o.done ? 'done' : ''}`}>
                <span className="objective-check">{o.done ? <Icon name="check" size={16} /> : null}</span>
                <div className="objective-main">
                  <div className="objective-top">
                    <strong>{o.title}</strong>
                    {o.prime > 0 && <span className="small good">+{eur(o.prime)}</span>}
                  </div>
                  {!o.done && o.target > 1 && (
                    <>
                      <Meter value={o.current} max={o.target} label={o.title} />
                      <span className="small muted">
                        {num(o.current)} / {num(o.target)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Section>
          {reward && (reward.prime > 0 || reward.unlockSectors.length > 0) && (
            <Section title={`Récompense du rang « ${rankTitle(rank + 1)} »`}>
              {reward.prime > 0 && <p className="small">Prime de {eur(reward.prime)}</p>}
              {reward.unlockSectors.map((id) => (
                <p key={id} className="small">
                  <span className="inline-icon" style={{ color: getSector(id).color }}>
                    <Icon name={id as IconName} size={16} />
                  </span>{' '}
                  Nouveau secteur : <strong>{getSector(id).name}</strong>
                </p>
              ))}
            </Section>
          )}
        </>
      )}

      <Section title="Parcours">
        {RANKS.map((r) => (
          <div key={r.rank} className={`rank-row ${r.rank < rank ? 'done' : r.rank === rank ? 'current' : ''}`}>
            <span className="rank-dot">{r.rank < rank ? <Icon name="check" size={14} /> : r.rank}</span>
            <span>{r.title}</span>
          </div>
        ))}
      </Section>
    </>
  )
}
