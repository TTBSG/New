import { districtUnlocked, getParcel, isFronted, locationFit, parcelTraffic } from './city'
import { currentRank } from './objectives'
import { getSector } from './sectors'
import type { Business, GameState, Parcel, RivalShop } from './types'
import { clamp, log, newId, pick, rand, randRange } from './util'

// ---------- Enseignes ----------

export type RivalStyle = 'discount' | 'equilibre' | 'premium'

export interface RivalBrand {
  id: string
  name: string
  color: string
  style: RivalStyle
  sectors: string[]
  /** Niveau de prix habituel, plancher en cas de guerre des prix, et qualité des produits. */
  price: number
  minPrice: number
  quality: number
  tagline: string
}

export const RIVAL_BRANDS: RivalBrand[] = [
  { id: 'prixmalin', name: 'Prix Malin', color: '#b8264f', style: 'discount', sectors: ['superette', 'vetements', 'electronique'], price: 0.86, minPrice: 0.76, quality: 44, tagline: 'Casse les prix, qualité moyenne. Redoutable si vous êtes cher.' },
  { id: 'kawa', name: 'Kawa Express', color: '#6b4ea3', style: 'equilibre', sectors: ['cafe', 'boulangerie'], price: 0.96, minPrice: 0.84, quality: 58, tagline: 'Chaîne rapide et correcte, présente partout.' },
  { id: 'dore', name: 'Maison Doré', color: '#0f8a82', style: 'premium', sectors: ['boulangerie', 'cafe', 'restaurant'], price: 1.16, minPrice: 1.02, quality: 82, tagline: 'Haut de gamme et cher. Seule une excellente réputation lui résiste.' },
  { id: 'tableco', name: 'Table & Co', color: '#c2478f', style: 'equilibre', sectors: ['restaurant', 'cafe'], price: 1, minPrice: 0.88, quality: 64, tagline: 'Restauration de chaîne, prix dans la moyenne.' },
  { id: 'urbanfil', name: 'Urban Fil', color: '#1f8a5f', style: 'premium', sectors: ['vetements', 'electronique'], price: 1.1, minPrice: 0.96, quality: 76, tagline: 'Boutiques tendance, clientèle fidèle.' },
  { id: 'proxi', name: 'Proxi Frais', color: '#2f8fd6', style: 'equilibre', sectors: ['superette', 'boulangerie'], price: 1.02, minPrice: 0.9, quality: 60, tagline: 'Le commerce de proximité classique.' },
]

export const STYLE_NAMES: Record<RivalStyle, string> = { discount: 'Discount', equilibre: 'Milieu de gamme', premium: 'Haut de gamme' }

export const getBrand = (id: string) => RIVAL_BRANDS.find((b) => b.id === id)!

// ---------- Réglages ----------

/** Distance (en cases) jusqu'à laquelle deux commerces du même secteur se disputent les clients. */
export const RIVAL_RADIUS = 4
/** Poids de la concurrence dans le partage des passants. */
const PRESSURE = 0.25
/** Les enseignes, aux frais fixes plus lourds, souffrent davantage de votre présence que l'inverse. */
const RIVAL_PRESSURE = 0.5
/** Part de marché locale en dessous de laquelle une boutique concurrente perd de l'argent. */
const BREAK_EVEN = 0.66
const START_HEALTH = 60

export const distance = (a: Parcel, b: Parcel) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j)
const weight = (d: number) => (d > RIVAL_RADIUS ? 0 : 1 - (Math.max(1, d) - 1) / RIVAL_RADIUS)

/** Attrait d'un commerce : réputation et rapport qualité-prix (1 ≈ commerce moyen au prix du marché). */
export function attraction(reputation: number, priceRatio: number): number {
  return (0.4 + reputation / 100) * clamp(priceRatio, 0.5, 2) ** -1.2
}

/** Prix ressenti d'une boutique concurrente : un produit de qualité justifie un prix plus élevé. */
export const rivalPriceRatio = (r: RivalShop) => r.priceLevel / (0.75 + r.quality / 240)
export const rivalAttraction = (r: RivalShop) => attraction(r.reputation, rivalPriceRatio(r))

// ---------- Concurrence subie par le joueur ----------

export interface Threat {
  rival: RivalShop
  distance: number
  /** Part des passants que ce concurrent détourne à lui seul. */
  taken: number
}

/** Concurrents qui se disputent les clients d'un commerce, du plus gênant au moins gênant. */
export function threatsFor(s: GameState, b: Business, ownAttraction: number): Threat[] {
  const here = getParcel(s.city, b.parcelId)
  const near = s.rivals
    .filter((r) => r.sectorId === b.sectorId)
    .map((r) => ({ rival: r, distance: distance(here, getParcel(s.city, r.parcelId)) }))
    .filter((x) => x.distance <= RIVAL_RADIUS)
  const total = ownAttraction + PRESSURE * near.reduce((a, x) => a + weight(x.distance) * rivalAttraction(x.rival), 0)
  return near.map((x) => ({ ...x, taken: (PRESSURE * weight(x.distance) * rivalAttraction(x.rival)) / total })).sort((x, y) => y.taken - x.taken)
}

/** Part des passants qu'un commerce conserve face à ses concurrents (1 = seul sur sa zone). */
export function competitionFactor(s: GameState, b: Business, ownAttraction: number): number {
  return 1 - threatsFor(s, b, ownAttraction).reduce((a, t) => a + t.taken, 0)
}

// ---------- Vie des enseignes ----------

/** Pression des concurrents (tous secteurs) autour d'un emplacement : sert à repérer les zones disputées. */
export function pressureAt(s: GameState, p: Parcel): number {
  return s.rivals.reduce((a, r) => a + weight(distance(p, getParcel(s.city, r.parcelId))), 0)
}

/** Emplacements possibles : immeubles donnant sur une rue (les locaux « à louer » restent pour le joueur). */
function spots(s: GameState): Parcel[] {
  const used = new Set([...s.rivals.map((r) => r.parcelId), ...s.businesses.map((b) => b.parcelId)])
  return s.city.parcels.filter((p) => p.kind === 'building' && isFronted(p) && districtUnlocked(s, p.districtId) && !used.has(p.id))
}

/** Nombre de boutiques concurrentes que la ville peut accueillir : il grandit avec votre réussite. */
export function rivalCap(s: GameState): number {
  return Math.min(45, 4 + 3 * (Math.min(7, currentRank(s)) - 1) + s.businesses.length)
}

/** Jours de tranquillité d'un nouveau commerce avant qu'une enseigne ne vienne s'installer à côté. */
export const GRACE_DAYS = 30
/** Nombre maximum de concurrents attirés autour d'un même commerce : un seul avant le rang 3. */
const maxNearby = (s: GameState) => (currentRank(s) >= 3 ? 2 : 1)

const rivalsNear = (s: GameState, b: Business) => {
  const here = getParcel(s.city, b.parcelId)
  return s.rivals.filter((r) => r.sectorId === b.sectorId && distance(here, getParcel(s.city, r.parcelId)) <= RIVAL_RADIUS).length
}

function openRival(s: GameState, starting: boolean): RivalShop | null {
  // Le succès attire : une fois vos premiers pas faits, les enseignes viennent chercher vos clients.
  const targets =
    starting || currentRank(s) < 2
      ? []
      : s.businesses.filter((b) => s.day - b.openedDay >= GRACE_DAYS && rivalsNear(s, b) < maxNearby(s) && (b.history.at(-1)?.profit ?? 0) > 0)
  const target = targets.length && rand(s) < 0.7 ? pick(s, targets) : null
  // Les implantations « au hasard » restent peu nombreuses : la place est gardée pour celles qui vous visent.
  if (!starting && !target && s.rivals.length >= 3 + 2 * Math.min(7, currentRank(s))) return null
  const brand = pick(s, target ? RIVAL_BRANDS.filter((x) => x.sectors.includes(target.sectorId)) : RIVAL_BRANDS)
  const sectorId = target ? target.sectorId : pick(s, brand.sectors)
  let free = spots(s).filter((p) => !s.rivals.some((r) => r.sectorId === sectorId && r.brandId === brand.id && distance(p, getParcel(s.city, r.parcelId)) <= 2))
  // En début de partie, on laisse le quartier résidentiel tranquille pour vos premiers pas.
  if (starting) free = free.filter((p) => p.districtId !== 'residentiel')
  if (target) {
    const here = getParcel(s.city, target.parcelId)
    free = free.filter((p) => distance(p, here) >= 2 && distance(p, here) <= RIVAL_RADIUS)
  }
  if (!free.length) return null
  const score = (p: Parcel) => parcelTraffic(p) * locationFit(s.city, p, sectorId) * randRange(s, 0.6, 1.4)
  const parcel = free.map((p) => ({ p, v: score(p) })).sort((a, b) => b.v - a.v)[0].p
  const shop: RivalShop = {
    id: newId(s, 'r'),
    brandId: brand.id,
    sectorId,
    parcelId: parcel.id,
    openedDay: s.day,
    priceLevel: brand.price,
    quality: Math.round(clamp(brand.quality + randRange(s, -5, 5), 20, 95)),
    reputation: Math.round(randRange(s, 44, 56)),
    health: START_HEALTH,
    customers: 0,
    share: 1,
  }
  s.rivals.push(shop)
  return shop
}

/** Les enseignes déjà installées au début de la partie. */
export function seedRivals(s: GameState, count = 4) {
  for (let i = 0; i < count; i++) openRival(s, true)
}

export const rivalName = (r: RivalShop) => `${getBrand(r.brandId).name} (${getSector(r.sectorId).name.toLowerCase()})`

/** Boutiques du joueur gênées par un concurrent. */
export function victimsOf(s: GameState, r: RivalShop): Business[] {
  const here = getParcel(s.city, r.parcelId)
  return s.businesses.filter((b) => b.sectorId === r.sectorId && distance(here, getParcel(s.city, b.parcelId)) <= RIVAL_RADIUS)
}

/**
 * Journée des concurrents : partage des clients, réputation, guerre des prix, ouvertures et fermetures.
 * `playerAttraction` donne l'attrait d'un commerce du joueur (fourni par le moteur).
 */
export function rivalsDay(s: GameState, playerAttraction: (b: Business) => number): { closed: RivalShop[]; opened: RivalShop | null } {
  const closed: RivalShop[] = []
  for (const r of s.rivals) {
    const brand = getBrand(r.brandId)
    const here = getParcel(s.city, r.parcelId)
    const own = rivalAttraction(r)
    let pressure = 0
    for (const b of victimsOf(s, r)) if (b.employees.length) pressure += weight(distance(here, getParcel(s.city, b.parcelId))) * playerAttraction(b)
    for (const o of s.rivals)
      if (o.id !== r.id && o.brandId !== r.brandId && o.sectorId === r.sectorId) pressure += weight(distance(here, getParcel(s.city, o.parcelId))) * rivalAttraction(o) * 0.5
    r.share = own / (own + RIVAL_PRESSURE * pressure)
    const sector = getSector(r.sectorId)
    r.customers = Math.round(parcelTraffic(here) * locationFit(s.city, here, r.sectorId) * sector.trafficMult * s.economy * (s.sectorTrends[r.sectorId] ?? 1) * (0.6 + r.reputation / 125) * r.share)

    // La réputation suit la qualité des produits.
    r.reputation = clamp(r.reputation + (35 + r.quality * 0.5 - r.reputation) * 0.03 + (rand(s) - 0.5) * 0.6, 5, 95)
    // Santé financière : brader coûte cher, perdre ses clients aussi.
    const breakEven = BREAK_EVEN + (1 - r.priceLevel / brand.price) * 0.5
    r.health = clamp(r.health + (r.share - breakEven) * 14, 0, 100)

    // Chaque semaine, l'enseigne ajuste ses prix : elle casse les prix si vous lui prenez ses clients.
    if ((s.day + r.openedDay) % 7 === 0) {
      if (r.share < 0.7 && r.priceLevel > brand.minPrice + 0.001) {
        r.priceLevel = Math.max(brand.minPrice, Math.round((r.priceLevel - 0.04) * 100) / 100)
        if (victimsOf(s, r).length) log(s, `${rivalName(r)} baisse ses prix pour vous reprendre des clients.`, 'bad')
      } else if (r.share > 0.85 && r.priceLevel < brand.price) {
        r.priceLevel = Math.min(brand.price, Math.round((r.priceLevel + 0.02) * 100) / 100)
      }
    }
    if (r.health <= 0) closed.push(r)
  }
  if (closed.length) s.rivals = s.rivals.filter((r) => !closed.includes(r))

  // Nouvelles implantations.
  let opened: RivalShop | null = null
  if (s.rivals.length < rivalCap(s) && rand(s) < 1 / 14) opened = openRival(s, false)
  return { closed, opened }
}

/** Prix demandé pour racheter une boutique concurrente : plus elle est en forme, plus elle est chère. */
export function rivalPrice(r: RivalShop): number {
  return Math.round((getSector(r.sectorId).setupCost * (0.7 + r.health / 100 + r.reputation / 200)) / 500) * 500
}

export function healthLabel(r: RivalShop): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (r.health >= 65) return { text: 'Affaire florissante', tone: 'bad' }
  if (r.health >= 30) return { text: 'Se maintient', tone: 'warn' }
  return { text: 'En difficulté', tone: 'good' }
}
