import type { GameState, Weather } from './types'
import { rand } from './util'

export const WEATHER_NAMES: Record<Weather, string> = { soleil: 'Soleil', nuages: 'Nuageux', pluie: 'Pluie', neige: 'Neige' }

/** Effet de la météo sur la fréquentation, par secteur (les terrasses souffrent de la pluie, les courses beaucoup moins). */
const EFFECT: Record<Weather, { base: number; sectors: Record<string, number> }> = {
  soleil: { base: 1.04, sectors: { cafe: 1.1, restaurant: 1.06 } },
  nuages: { base: 1, sectors: {} },
  pluie: { base: 0.92, sectors: { cafe: 0.86, vetements: 0.88, superette: 0.98, boulangerie: 0.96 } },
  neige: { base: 0.84, sectors: { cafe: 0.9, superette: 0.94, boulangerie: 0.92 } },
}

export const weatherMult = (w: Weather, sectorId: string) => EFFECT[w].sectors[sectorId] ?? EFFECT[w].base

/** Chances de chaque temps selon la saison. */
function odds(month: number): [Weather, number][] {
  if (month === 11 || month <= 1) return [['soleil', 0.25], ['nuages', 0.35], ['pluie', 0.22], ['neige', 0.18]]
  if (month >= 5 && month <= 7) return [['soleil', 0.62], ['nuages', 0.24], ['pluie', 0.14], ['neige', 0]]
  return [['soleil', 0.4], ['nuages', 0.33], ['pluie', 0.27], ['neige', 0]]
}

/** Le temps du jour : il a tendance à durer quelques jours. */
export function nextWeather(s: GameState, month: number): Weather {
  const table = odds(month)
  const possible = table.some(([w, p]) => w === s.weather && p > 0)
  if (possible && rand(s) < 0.55) return s.weather
  let x = rand(s)
  for (const [w, p] of table) {
    if (x < p) return w
    x -= p
  }
  return 'nuages'
}
