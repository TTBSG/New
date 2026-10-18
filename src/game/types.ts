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
  emoji: string
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

export interface LocationDef {
  id: string
  name: string
  rentMonthly: number
  /** Passants par jour. */
  traffic: number
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
  locationId: string
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
  businesses: Business[]
  candidates: Candidate[]
  log: LogEntry[]
  nextId: number
}
