import { businessAttraction } from '../../game/engine'
import { RIVAL_BRANDS, STYLE_NAMES, getBrand, healthLabel, threatsFor } from '../../game/rivals'
import { SECTORS } from '../../game/sectors'
import type { GameState } from '../../game/types'
import { Section, Stat } from '../common'
import { num } from '../format'
import { Icon, type IconName } from '../icons'

const PLAYER_COLOR = '#e8743b'

interface Row {
  key: string
  name: string
  color: string
  shops: number
  customers: number
}

/** Clients servis hier par secteur : vous et chaque enseigne concurrente. */
function sectorRows(state: GameState, sectorId: string): Row[] {
  const mine = state.businesses.filter((b) => b.sectorId === sectorId)
  const rows: Row[] = []
  if (mine.length) rows.push({ key: 'me', name: 'Vous', color: PLAYER_COLOR, shops: mine.length, customers: mine.reduce((a, b) => a + (b.history.at(-1)?.visitors ?? 0), 0) })
  for (const brand of RIVAL_BRANDS) {
    const shops = state.rivals.filter((r) => r.sectorId === sectorId && r.brandId === brand.id)
    if (shops.length) rows.push({ key: brand.id, name: brand.name, color: brand.color, shops: shops.length, customers: shops.reduce((a, r) => a + r.customers, 0) })
  }
  return rows.sort((a, b) => b.customers - a.customers)
}

export function MarketApp({ state }: { state: GameState }) {
  const sectors = SECTORS.map((sec) => ({ sec, rows: sectorRows(state, sec.id) }))
    .filter((x) => x.rows.length)
    // Vos secteurs d'abord.
    .sort((a, b) => Number(b.rows.some((r) => r.key === 'me')) - Number(a.rows.some((r) => r.key === 'me')))
  const threats = state.businesses
    .flatMap((b) => threatsFor(state, b, businessAttraction(state, b)).map((t) => ({ b, ...t })))
    .sort((a, b) => b.taken - a.taken)
  const contested = new Set(threats.map((t) => t.b.id)).size

  return (
    <>
      <div className="stats">
        <Stat label="Boutiques concurrentes" value={state.rivals.length} hint={`${new Set(state.rivals.map((r) => r.brandId)).size} enseignes en ville`} />
        <Stat label="Vos commerces disputés" value={`${contested} / ${state.businesses.length}`} tone={contested ? 'bad' : 'good'} />
      </div>

      <Section title="Parts de marché" right={<span className="muted small">clients d'hier</span>}>
        {!sectors.length && <p className="muted small">Aucune donnée pour l'instant.</p>}
        {sectors.map(({ sec, rows }) => {
          const total = rows.reduce((a, r) => a + r.customers, 0)
          return (
            <div key={sec.id} className="share-block">
              <h4>
                <Icon name={sec.id as IconName} size={15} /> {sec.name}
              </h4>
              {rows.map((r) => {
                const share = total > 0 ? r.customers / total : 0
                return (
                  <div key={r.key} className="share-row" title={`${r.name} : ${num(r.customers)} clients/jour, ${r.shops} boutique${r.shops > 1 ? 's' : ''}`}>
                    <span className={`small ${r.key === 'me' ? 'strong' : ''}`}>
                      {r.name} <span className="muted">· {r.shops}</span>
                    </span>
                    <span className="share-track">
                      <span className="share-fill" style={{ width: `${Math.max(1.5, share * 100)}%`, background: r.color }} />
                    </span>
                    <span className="small strong num">{Math.round(share * 100)} %</span>
                  </div>
                )
              })}
            </div>
          )
        })}
        <p className="muted small">Le chiffre après chaque nom est le nombre de boutiques.</p>
      </Section>

      <Section title="Qui vous prend des clients">
        {!threats.length && <p className="muted small">Personne pour l'instant : aucun concurrent de vos secteurs n'est installé près de vos commerces.</p>}
        {threats.map((t) => {
          const brand = getBrand(t.rival.brandId)
          return (
            <div key={`${t.b.id}-${t.rival.id}`} className="threat">
              <span className="brand-dot" style={{ background: brand.color }} />
              <span className="choice-main">
                <strong>{brand.name}</strong>
                <span className="small muted">
                  près de {t.b.name} · à {t.distance} rue{t.distance > 1 ? 's' : ''} · {healthLabel(t.rival).text.toLowerCase()}
                </span>
              </span>
              <strong className="bad">−{Math.round(t.taken * 100)} %</strong>
            </div>
          )
        })}
      </Section>

      <Section title="Les enseignes">
        {RIVAL_BRANDS.map((brand) => {
          const shops = state.rivals.filter((r) => r.brandId === brand.id).length
          return (
            <div key={brand.id} className="threat">
              <span className="brand-dot" style={{ background: brand.color }} />
              <span className="choice-main">
                <strong>
                  {brand.name} <span className="muted small">· {STYLE_NAMES[brand.style]}</span>
                </strong>
                <span className="small muted">{brand.tagline}</span>
              </span>
              <span className="small strong">{shops ? `${shops} boutique${shops > 1 ? 's' : ''}` : 'absente'}</span>
            </div>
          )
        })}
        <p className="muted small">Une enseigne casse ses prix quand vous lui prenez ses clients, puis ferme si elle perd trop longtemps. Vous pouvez aussi racheter ses boutiques depuis la carte.</p>
      </Section>
    </>
  )
}
