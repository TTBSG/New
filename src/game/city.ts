import { getDistrict } from './sectors'
import type { Business, City, Parcel, ParcelKind } from './types'

export const CITY_SIZE = 13
/** Rues : lignes et colonnes 2, 6 et 10. La 6 est l'axe principal qui sépare les quartiers. */
export const ROADS = [2, 6, 10]
const MAIN_ROAD = 6

/** Noms des rues : par axe (i = rues qui traversent la carte de haut-droite à bas-gauche, j = l'autre sens). */
const STREETS_I: Record<number, string> = { 2: 'rue des Lilas', 6: 'avenue de la République', 10: 'rue du Port' }
const STREETS_J: Record<number, string> = { 2: 'rue Victor-Hugo', 6: 'boulevard Central', 10: 'rue des Écoles' }

export const isRoad = (i: number, j: number) => ROADS.includes(i) || ROADS.includes(j)

export function districtAt(i: number, j: number): string {
  const top = j < MAIN_ROAD
  if (i < MAIN_ROAD) return top ? 'residentiel' : 'commercial'
  return top ? 'affaires' : 'centre'
}

/** Rue bordant la parcelle, en privilégiant les grands axes. */
function frontage(i: number, j: number): { street: string; main: boolean; number: number } | null {
  const options: { street: string; main: boolean; number: number }[] = []
  for (const r of ROADS) {
    if (Math.abs(i - r) === 1) options.push({ street: STREETS_I[r], main: r === MAIN_ROAD, number: j * 2 + (i < r ? 1 : 2) })
    if (Math.abs(j - r) === 1) options.push({ street: STREETS_J[r], main: r === MAIN_ROAD, number: i * 2 + (j < r ? 1 : 2) })
  }
  options.sort((a, b) => Number(b.main) - Number(a.main))
  return options[0] ?? null
}

const HEIGHTS: Record<string, number[]> = {
  residentiel: [18, 22, 26],
  commercial: [20, 24, 28],
  centre: [36, 46, 56],
  affaires: [56, 72, 90, 108],
}

export function generateCity(rand: () => number): City {
  const parcels: Parcel[] = []
  for (let i = 0; i < CITY_SIZE; i++) {
    for (let j = 0; j < CITY_SIZE; j++) {
      if (isRoad(i, j)) continue
      const districtId = districtAt(i, j)
      const front = frontage(i, j)
      let kind: ParcelKind
      if (front) kind = rand() < 0.28 ? 'lot' : 'building'
      else kind = (districtId === 'residentiel' || districtId === 'commercial') && rand() < 0.3 ? 'park' : 'building'
      const trafficMult = (0.85 + rand() * 0.3) * (front?.main ? 1.2 : 1)
      const heights = HEIGHTS[districtId]
      parcels.push({
        id: `p${i}-${j}`,
        i,
        j,
        districtId,
        kind,
        address: front ? `${front.number} ${front.street}` : `Îlot ${i}-${j}`,
        trafficMult: Math.round(trafficMult * 100) / 100,
        // Loyer corrélé à la fréquentation, avec des bonnes et des mauvaises affaires.
        rentMult: Math.round(trafficMult * (0.85 + rand() * 0.3) * 100) / 100,
        height: heights[Math.floor(rand() * heights.length)],
        variant: Math.floor(rand() * 4),
      })
    }
  }
  return { size: CITY_SIZE, roads: ROADS, parcels }
}

export function getParcel(city: City, id: string): Parcel {
  const p = city.parcels.find((x) => x.id === id)
  if (!p) throw new Error(`Parcelle inconnue : ${id}`)
  return p
}

export function parcelTraffic(p: Parcel): number {
  return Math.round(getDistrict(p.districtId).traffic * p.trafficMult)
}

export function parcelRent(p: Parcel): number {
  return Math.round((getDistrict(p.districtId).rentMonthly * p.rentMult) / 10) * 10
}

export function isVacant(p: Parcel, businesses: Business[]): boolean {
  return p.kind === 'lot' && !businesses.some((b) => b.parcelId === p.id)
}
