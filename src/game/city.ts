import { RANKS, currentRank } from './objectives'
import { getDistrict } from './sectors'
import type { Business, City, GameState, Parcel, ParcelKind } from './types'

export const CITY_WIDTH = 20
export const CITY_HEIGHT = 13
/** Rues : colonnes (i) et lignes (j). Les axes 6 et 13 séparent les quartiers. */
export const ROADS_I = [2, 6, 10, 13, 17]
export const ROADS_J = [2, 6, 10]
const MAIN_I = [6, 13]
const MAIN_J = [6]

/** Noms des rues : par axe (i = rues qui traversent la carte de haut-droite à bas-gauche, j = l'autre sens). */
const STREETS_I: Record<number, string> = { 2: 'rue des Lilas', 6: 'avenue de la République', 10: 'rue du Port', 13: "avenue de l'Université", 17: 'rue du Phare' }
const STREETS_J: Record<number, string> = { 2: 'rue Victor-Hugo', 6: 'boulevard Central', 10: 'rue des Écoles' }

export const isRoad = (i: number, j: number) => ROADS_I.includes(i) || ROADS_J.includes(j)

export function districtAt(i: number, j: number): string {
  const top = j < 6
  if (i < 6) return top ? 'residentiel' : 'commercial'
  if (i < 13) return top ? 'affaires' : 'centre'
  return top ? 'campus' : 'port'
}

/** Rue bordant la parcelle, en privilégiant les grands axes. */
function frontage(i: number, j: number): { street: string; main: boolean; number: number } | null {
  const options: { street: string; main: boolean; number: number }[] = []
  for (const r of ROADS_I) if (Math.abs(i - r) === 1) options.push({ street: STREETS_I[r], main: MAIN_I.includes(r), number: j * 2 + (i < r ? 1 : 2) })
  for (const r of ROADS_J) if (Math.abs(j - r) === 1) options.push({ street: STREETS_J[r], main: MAIN_J.includes(r), number: i * 2 + (j < r ? 1 : 2) })
  options.sort((a, b) => Number(b.main) - Number(a.main))
  return options[0] ?? null
}

export const isFronted = (p: Parcel) => frontage(p.i, p.j) !== null

const HEIGHTS: Record<string, number[]> = {
  residentiel: [18, 22, 26],
  commercial: [20, 24, 28],
  centre: [36, 46, 56],
  affaires: [56, 72, 90, 108],
  campus: [22, 28, 34],
  port: [20, 26, 32],
}

function makeParcel(i: number, j: number, rand: () => number): Parcel {
  const districtId = districtAt(i, j)
  const front = frontage(i, j)
  let kind: ParcelKind
  if (front) kind = rand() < 0.28 ? 'lot' : 'building'
  else kind = districtId !== 'affaires' && districtId !== 'centre' && rand() < 0.3 ? 'park' : 'building'
  const trafficMult = (0.85 + rand() * 0.3) * (front?.main ? 1.2 : 1)
  const heights = HEIGHTS[districtId]
  return {
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
  }
}

/**
 * Construit la ville, ou complète une ville plus petite venue d'une ancienne sauvegarde :
 * les parcelles existantes sont conservées, les nouvelles colonnes et les lieux remarquables ajoutés.
 */
export function buildCity(rand: () => number, existing: Parcel[] = [], taken: string[] = []): City {
  const parcels = [...existing]
  const known = new Set(existing.map((p) => p.id))
  for (let i = 0; i < CITY_WIDTH; i++)
    for (let j = 0; j < CITY_HEIGHT; j++) {
      if (isRoad(i, j) || known.has(`p${i}-${j}`)) continue
      parcels.push(makeParcel(i, j, rand))
    }
  // Un lieu remarquable par quartier, sur un immeuble visible depuis la rue.
  for (const lm of LANDMARKS) {
    if (parcels.some((p) => p.landmarkId === lm.id)) continue
    const options = parcels.filter((p) => p.districtId === lm.districtId && p.kind === 'building' && isFronted(p) && !taken.includes(p.id))
    if (!options.length) continue
    const spot = options[Math.floor(rand() * options.length)]
    spot.kind = 'landmark'
    spot.landmarkId = lm.id
  }
  return { width: CITY_WIDTH, height: CITY_HEIGHT, roadsI: ROADS_I, roadsJ: ROADS_J, parcels }
}

export const generateCity = (rand: () => number) => buildCity(rand)

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

// ---------- Quartiers à débloquer ----------

/** Rang à atteindre pour s'installer dans un quartier (1 = ouvert dès le début). */
export function districtRank(districtId: string): number {
  const r = RANKS.find((x) => x.unlockDistricts.includes(districtId))
  return r ? r.rank + 1 : 1
}

export const districtUnlocked = (s: GameState, districtId: string) => currentRank(s) >= districtRank(districtId)

// ---------- Lieux remarquables ----------

export interface LandmarkDef {
  id: string
  name: string
  districtId: string
  description: string
  /** Surcroît de fréquentation à côté du lieu, par secteur (0,25 = +25 % à une rue). */
  boost: Record<string, number>
}

export const LANDMARKS: LandmarkDef[] = [
  { id: 'gare', name: 'Gare', districtId: 'centre', description: 'Des milliers de voyageurs pressés chaque jour.', boost: { cafe: 0.25, boulangerie: 0.2, superette: 0.15, restaurant: 0.1 } },
  { id: 'lycee', name: 'Lycée', districtId: 'residentiel', description: 'Des centaines d\'élèves à la sortie des cours.', boost: { boulangerie: 0.25, superette: 0.12, cafe: 0.1, vetements: 0.1 } },
  { id: 'stade', name: 'Stade', districtId: 'commercial', description: 'Les jours de match, tout le quartier est plein.', boost: { restaurant: 0.2, cafe: 0.15, superette: 0.12 } },
  { id: 'bourse', name: 'Tour de la Bourse', districtId: 'affaires', description: 'Cadres et clients d\'affaires au pouvoir d\'achat élevé.', boost: { restaurant: 0.25, cafe: 0.2, vetements: 0.12 } },
  { id: 'universite', name: 'Université', districtId: 'campus', description: 'Le cœur de la vie étudiante.', boost: { cafe: 0.25, electronique: 0.2, boulangerie: 0.15 } },
  { id: 'phare', name: 'Phare', districtId: 'port', description: 'Le rendez-vous des promeneurs et des touristes.', boost: { restaurant: 0.3, cafe: 0.15, vetements: 0.15 } },
]

export const getLandmark = (id: string) => LANDMARKS.find((l) => l.id === id)!
/** Portée d'un lieu remarquable, en rues. */
export const LANDMARK_RADIUS = 3
const reach = (d: number) => (d > LANDMARK_RADIUS ? 0 : 1 - (Math.max(1, d) - 1) / LANDMARK_RADIUS)

export interface LocationPerk {
  label: string
  /** Effet sur la fréquentation (0,12 = +12 %). */
  effect: number
}

/** Atouts et handicaps d'un emplacement pour un secteur : clientèle du quartier et lieux remarquables voisins. */
export function locationPerks(city: City, p: Parcel, sectorId: string): LocationPerk[] {
  const out: LocationPerk[] = []
  const district = getDistrict(p.districtId)
  const fit = district.fit[sectorId] ?? 1
  if (fit !== 1) out.push({ label: `Clientèle du quartier (${district.name.toLowerCase()})`, effect: fit - 1 })
  for (const q of city.parcels) {
    if (!q.landmarkId) continue
    const lm = getLandmark(q.landmarkId)
    const effect = (lm.boost[sectorId] ?? 0) * reach(Math.abs(p.i - q.i) + Math.abs(p.j - q.j))
    if (effect > 0.005) out.push({ label: `${lm.name} à proximité`, effect })
  }
  return out
}

/** Multiplicateur de fréquentation d'un emplacement pour un secteur. */
export function locationFit(city: City, p: Parcel, sectorId: string): number {
  return locationPerks(city, p, sectorId).reduce((m, x) => m * (1 + x.effect), 1)
}

export function isVacant(p: Parcel, businesses: Business[]): boolean {
  return p.kind === 'lot' && !businesses.some((b) => b.parcelId === p.id)
}

/** Local libre : dans un quartier ouvert, sans commerce, siège social ni entrepôt dessus. */
export function isFree(s: GameState, p: Parcel): boolean {
  return isVacant(p, s.businesses) && districtUnlocked(s, p.districtId) && s.hq?.parcelId !== p.id && !s.warehouses.some((w) => w.parcelId === p.id)
}
