export type SectorId = string

export interface ProductDef {
  id: string
  name: string
  /** Coût d'achat unitaire chez un fournisseur standard. */
  unitCost: number
  /** Prix de vente « normal » du marché. */
  refPrice: number
  /** Part des visiteurs qui achètent ce produit quand le prix est au niveau du marché. */
  baseShare: number
}

export interface RoleDef {
  id: string
  name: string
  /** Salaire mensuel de référence (brut chargé). */
  baseSalary: number
  /** Unités servies par jour pour un employé moyen (0 = rôle de support). */
  capacity: number
}

export interface SectorDef {
  id: SectorId
  name: string
  /** Couleur de l'enseigne (auvent, icône). */
  color: string
  description: string
  /** Coût d'aménagement et d'équipement à l'ouverture. */
  setupCost: number
  /** Multiplicateur de fréquentation selon l'attractivité du secteur. */
  trafficMult: number
  /** Sensibilité des clients au prix (élasticité). */
  priceElasticity: number
  products: ProductDef[]
  roles: RoleDef[]
}

export interface DistrictDef {
  id: string
  name: string
  /** Loyer mensuel moyen d'un local commercial. */
  rentMonthly: number
  /** Passants par jour devant un local moyen. */
  traffic: number
}

export type ParcelKind = 'lot' | 'building' | 'park'

/** Une case de la ville. Les « lots » sont les locaux commerciaux qu'on peut louer. */
export interface Parcel {
  id: string
  i: number
  j: number
  districtId: string
  kind: ParcelKind
  address: string
  /** Multiplicateurs propres à l'emplacement (rue passante, bonne affaire…). */
  trafficMult: number
  rentMult: number
  /** Apparence des bâtiments décoratifs. */
  height: number
  variant: number
}

export interface City {
  size: number
  /** Indices des lignes et colonnes occupées par des rues. */
  roads: number[]
  parcels: Parcel[]
}

export type SupplierTier = 'eco' | 'standard' | 'premium'

export interface ProductState {
  id: string
  price: number
  stock: number
  supplier: SupplierTier
  /** Stock visé lors du réapprovisionnement automatique (0 = désactivé). */
  restockTarget: number
}

export interface Employee {
  id: string
  name: string
  roleId: string
  /** Compétence 0-100. */
  skill: number
  /** Salaire mensuel. */
  salary: number
  /** Moral 0-100. */
  morale: number
  hiredDay: number
}

export interface DayReport {
  day: number
  visitors: number
  demand: number
  unitsSold: number
  lostToCapacity: number
  lostToStockout: number
  revenue: number
  grossMargin: number
  purchases: number
  wages: number
  rent: number
  marketing: number
  profit: number
}

export interface Business {
  id: string
  name: string
  sectorId: SectorId
  parcelId: string
  openedDay: number
  products: ProductState[]
  employees: Employee[]
  /** Budget marketing quotidien. */
  marketingDaily: number
  /** Réputation 0-100. */
  reputation: number
  history: DayReport[]
}

export interface Candidate extends Omit<Employee, 'morale' | 'hiredDay'> {
  sectorId: SectorId
}

export interface MarketEvent {
  id: string
  title: string
  description: string
  sectorId: SectorId | null
  demandMult: number
  endsDay: number
}

export interface LogEntry {
  day: number
  text: string
  tone: 'info' | 'good' | 'bad'
}

export interface GameState {
  version: number
  seed: number
  day: number
  cash: number
  loan: number
  /** Taux annuel. */
  loanRate: number
  daysInDebt: number
  gameOver: boolean
  /** Conjoncture globale (1 = normale). */
  economy: number
  sectorTrends: Record<SectorId, number>
  events: MarketEvent[]
  city: City
  businesses: Business[]
  candidates: Candidate[]
  log: LogEntry[]
  nextId: number
}
