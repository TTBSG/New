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
  /** Nombre de jours de vente avant péremption (absent = ne périme pas). */
  shelfLife?: number
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
  /** Répartition des clients sur la journée (matin, midi, soir), somme = 1. */
  slotShare: [number, number, number]
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

export type SupplierTier = 'default' | 'eco' | 'premium' | 'bulk'

export interface Supplier {
  id: string
  name: string
  sectorId: SectorId
  tier: SupplierTier
  /** Qualité des produits 0-100. */
  quality: number
  /** Multiplicateur du coût d'achat de référence. */
  priceMult: number
  /** Jours entre la commande (le soir) et la livraison (le matin). */
  leadDays: number
  /** Probabilité de livrer à l'heure. */
  reliability: number
  /** En dessous de ce montant, des frais de livraison s'appliquent. */
  minOrder: number
  deliveryFee: number
  active: boolean
  /** Total acheté par le joueur (fidélité). */
  spent: number
  /** Remise obtenue en négociant. */
  negotiated: number
  negotiatedDay: number
}

/** Un lot de marchandise, avec sa date de péremption éventuelle. */
export interface StockBatch {
  qty: number
  /** Dernier jour où le lot peut être vendu (null = ne périme pas). */
  expiresDay: number | null
}

export interface ProductState {
  id: string
  price: number
  batches: StockBatch[]
  /** Fournisseur utilisé pour les commandes automatiques. */
  supplierId: string
  /** Stock visé par les commandes automatiques. */
  restockTarget: number
  /** Commandes automatiques activées. */
  auto: boolean
  /** Réapprovisionné chaque nuit par l'entrepôt du groupe plutôt que par un fournisseur. */
  fromWarehouse?: boolean
  /** Coût moyen réellement payé pour le stock en rayon (remises comprises). */
  avgCost?: number
}

export interface OrderLine {
  productId: string
  qty: number
}

export interface Order {
  id: string
  /** Destinataire : un commerce ou un entrepôt. */
  businessId: string
  supplierId: string
  lines: OrderLine[]
  /** Montant à payer à la livraison (remises et frais compris). */
  total: number
  placedDay: number
  dueDay: number
  auto: boolean
  /** Déjà retardée une fois (on ne la retarde pas deux fois). */
  delayed: boolean
}

export interface OrderRecord extends Order {
  status: 'livrée' | 'annulée'
  closedDay: number
}

export type SkillId = 'service' | 'vente' | 'qualite'
export type Skills = Record<SkillId, number>

export type TraitId = 'rapide' | 'souriant' | 'vendeur' | 'fiable' | 'ambitieux' | 'mentor' | 'raleur' | 'distrait' | 'paresseux'

/** Créneaux de la journée : matin, midi / après-midi, soir. */
export type Slot = 0 | 1 | 2

export interface Employee {
  id: string
  name: string
  roleId: string
  /** Compétences 0-100 : service (vitesse), vente (panier moyen), qualité (réputation). */
  skills: Skills
  /** Deux traits de caractère, découverts en entretien ou avec le temps. */
  traits: TraitId[]
  traitsKnown: boolean
  /** Salaire mensuel. */
  salary: number
  /** Moral 0-100. */
  morale: number
  hiredDay: number
  /** Fin de la période d'essai (on peut s'en séparer sans indemnité jusque-là). */
  trialUntil: number
  /** Créneaux travaillés : 1 = temps partiel, 2 = temps plein, 3 = heures sup. */
  shifts: Slot[]
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
  /** Réputation en fin de journée (absente des anciennes sauvegardes). */
  reputation?: number
  /** Valeur des produits jetés car périmés. */
  waste?: number
  wasteByProduct?: Record<string, number>
  soldByProduct?: Record<string, number>
  /** Clients et capacité par créneau (matin, midi, soir). */
  slotDemand?: number[]
  slotCapacity?: number[]
  /** Énergie et charges des créneaux ouverts. */
  utilities?: number
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
  /** Ajustement du loyer négocié avec le propriétaire (1 = loyer de base). */
  rentMult: number
  /** Créneaux d'ouverture (matin, midi, soir). */
  hours: [boolean, boolean, boolean]
  history: DayReport[]
}

export type HiringSource = 'spontane' | 'annonce' | 'cabinet'

export interface Candidate {
  id: string
  name: string
  sectorId: SectorId
  roleId: string
  skills: Skills
  traits: TraitId[]
  traitsKnown: boolean
  /** Salaire demandé. */
  salary: number
  source: HiringSource
  /** Dernier jour où le candidat est disponible. */
  expiresDay: number
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

export interface ChatLine {
  from: 'them' | 'me'
  text: string
  day: number
}

export interface Choice {
  id: string
  label: string
  /** Conséquence annoncée au joueur (« +100 €/mois · moral + »). */
  hint: string
  tone?: 'good' | 'bad'
}

export type ConversationKind = 'advisor' | 'raise' | 'supplier' | 'landlord' | 'press' | 'bank'

/** Une discussion de l'appli Messages. Les choix en attente sont les décisions à prendre. */
export interface Conversation {
  id: string
  kind: ConversationKind
  contact: string
  role: string
  businessId?: string
  employeeId?: string
  productId?: string
  /** Montant en jeu (salaire demandé, prix de l'offre…). */
  amount?: number
  quantity?: number
  lines: ChatLine[]
  choices: Choice[]
  /** Jour où la demande expire sans réponse. */
  expiresDay?: number
  unread: boolean
  lastDay: number
}

export type OfficeRole = 'acheteur' | 'recruteur' | 'marketing' | 'logisticien' | 'comptable'

export interface OfficeEmployee {
  id: string
  name: string
  role: OfficeRole
  skill: number
  salary: number
  hiredDay: number
}

/** Règles de délégation : ce que le siège gère à la place du joueur. */
export interface HqPolicies {
  /** Remplacer automatiquement un employé qui démissionne (recruteur). */
  autoReplace: boolean
  /** Accepter sans demander les augmentations jusqu'à ce pourcentage (0 = toujours demander ; recruteur). */
  raiseLimit: number
  /** Négocier chaque mois avec les fournisseurs utilisés (acheteur). */
  autoNegotiate: boolean
  /** Ajuster chaque semaine les stocks cibles des produits qui ne périment pas (acheteur). */
  autoStock: boolean
}

export interface Headquarters {
  parcelId: string
  level: number
  staff: OfficeEmployee[]
  policies: HqPolicies
  openedDay: number
}

export interface WarehouseDay {
  day: number
  received: number
  shipped: number
  waste: number
  cost: number
  /** Boutiques qui n'ont pas pu être livrées faute de camions ou de magasiniers. */
  unserved: number
}

export interface Warehouse {
  id: string
  parcelId: string
  sectorId: SectorId
  level: number
  cold: boolean
  handlers: number
  trucks: number
  /** Stock de l'entrepôt (le prix de vente n'y sert pas). */
  products: ProductState[]
  history: WarehouseDay[]
  openedDay: number
}

/** Célébration à afficher (objectif atteint, nouveau rang). */
export interface Celebration {
  id: string
  title: string
  prime: number
  rankUp: number | null
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
  hq: Headquarters | null
  officeCandidates: OfficeEmployee[]
  warehouses: Warehouse[]
  suppliers: Supplier[]
  orders: Order[]
  orderHistory: OrderRecord[]
  businesses: Business[]
  candidates: Candidate[]
  /** Entretiens déjà menés aujourd'hui par le dirigeant. */
  interviews: { day: number; count: number }
  log: LogEntry[]
  inbox: Conversation[]
  /** Conseils déjà envoyés, étapes du tutoriel… */
  flags: Record<string, boolean>
  stats: { totalProfit: number; totalRevenue: number }
  objectivesDone: string[]
  unlockedSectors: string[]
  celebrations: Celebration[]
  nextId: number
}
