import type { LocationDef, SectorDef, SupplierTier } from './types'

const manager = { id: 'manager', name: 'Manager', baseSalary: 3200, capacity: 0 }

export const SECTORS: SectorDef[] = [
  {
    id: 'cafe',
    name: 'Café',
    emoji: '☕',
    description: 'Petites marges, gros volumes. La rapidité du service fait tout.',
    setupCost: 15000,
    trafficMult: 1,
    priceElasticity: 1.6,
    products: [
      { id: 'espresso', name: 'Espresso', unitCost: 0.35, refPrice: 2, baseShare: 0.32 },
      { id: 'cappuccino', name: 'Cappuccino', unitCost: 0.7, refPrice: 3.8, baseShare: 0.22 },
      { id: 'croissant', name: 'Croissant', unitCost: 0.45, refPrice: 1.6, baseShare: 0.18 },
      { id: 'sandwich', name: 'Sandwich', unitCost: 2.1, refPrice: 6.5, baseShare: 0.09 },
    ],
    roles: [{ id: 'barista', name: 'Barista', baseSalary: 1900, capacity: 130 }, manager],
  },
  {
    id: 'boulangerie',
    name: 'Boulangerie',
    emoji: '🥖',
    description: 'Clientèle fidèle de quartier. La qualité des produits fait la réputation.',
    setupCost: 25000,
    trafficMult: 1.1,
    priceElasticity: 1.3,
    products: [
      { id: 'baguette', name: 'Baguette', unitCost: 0.3, refPrice: 1.2, baseShare: 0.45 },
      { id: 'viennoiserie', name: 'Viennoiserie', unitCost: 0.4, refPrice: 1.4, baseShare: 0.25 },
      { id: 'patisserie', name: 'Pâtisserie', unitCost: 1.3, refPrice: 4.2, baseShare: 0.1 },
      { id: 'gateau', name: 'Gâteau entier', unitCost: 7, refPrice: 22, baseShare: 0.015 },
    ],
    roles: [{ id: 'vendeur', name: 'Boulanger-vendeur', baseSalary: 2000, capacity: 160 }, manager],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    emoji: '🍽️',
    description: 'Tickets élevés mais beaucoup de personnel. Attention à la masse salariale.',
    setupCost: 60000,
    trafficMult: 0.55,
    priceElasticity: 1.2,
    products: [
      { id: 'menu', name: 'Menu du jour', unitCost: 5.5, refPrice: 16, baseShare: 0.14 },
      { id: 'carte', name: 'Plat à la carte', unitCost: 8, refPrice: 22, baseShare: 0.08 },
      { id: 'dessert', name: 'Dessert', unitCost: 1.8, refPrice: 7, baseShare: 0.09 },
      { id: 'vin', name: 'Verre de vin', unitCost: 1.5, refPrice: 6, baseShare: 0.1 },
    ],
    roles: [{ id: 'serveur', name: 'Serveur / Cuisinier', baseSalary: 2100, capacity: 45 }, manager],
  },
  {
    id: 'vetements',
    name: 'Boutique de vêtements',
    emoji: '👕',
    description: 'Fortes marges, clients exigeants sur le prix et la qualité.',
    setupCost: 40000,
    trafficMult: 0.9,
    priceElasticity: 1.8,
    products: [
      { id: 'tshirt', name: 'T-shirt', unitCost: 6, refPrice: 22, baseShare: 0.025 },
      { id: 'jean', name: 'Jean', unitCost: 18, refPrice: 65, baseShare: 0.0125 },
      { id: 'veste', name: 'Veste', unitCost: 35, refPrice: 120, baseShare: 0.006 },
      { id: 'accessoire', name: 'Accessoire', unitCost: 4, refPrice: 15, baseShare: 0.02 },
    ],
    roles: [{ id: 'conseiller', name: 'Conseiller de vente', baseSalary: 1950, capacity: 35 }, manager],
  },
  {
    id: 'electronique',
    name: 'Magasin d\'électronique',
    emoji: '📱',
    description: 'Gros tickets, petites marges sur le matériel. Le stock immobilise beaucoup de cash.',
    setupCost: 80000,
    trafficMult: 0.7,
    priceElasticity: 2.2,
    products: [
      { id: 'smartphone', name: 'Smartphone', unitCost: 430, refPrice: 599, baseShare: 0.0027 },
      { id: 'ordinateur', name: 'Ordinateur portable', unitCost: 620, refPrice: 899, baseShare: 0.0014 },
      { id: 'casque', name: 'Casque audio', unitCost: 45, refPrice: 99, baseShare: 0.0054 },
      { id: 'cable', name: 'Câbles & accessoires', unitCost: 3, refPrice: 19, baseShare: 0.018 },
    ],
    roles: [{ id: 'technicien', name: 'Vendeur technique', baseSalary: 2300, capacity: 25 }, manager],
  },
  {
    id: 'superette',
    name: 'Supérette',
    emoji: '🛒',
    description: 'Énormément de références, marges faibles, gestion des stocks cruciale.',
    setupCost: 50000,
    trafficMult: 1.3,
    priceElasticity: 1.4,
    products: [
      { id: 'epicerie', name: 'Épicerie', unitCost: 1.4, refPrice: 2.3, baseShare: 0.5 },
      { id: 'frais', name: 'Produits frais', unitCost: 2.2, refPrice: 3.9, baseShare: 0.3 },
      { id: 'boissons', name: 'Boissons', unitCost: 0.9, refPrice: 1.8, baseShare: 0.35 },
      { id: 'hygiene', name: 'Hygiène', unitCost: 2.5, refPrice: 4.5, baseShare: 0.12 },
    ],
    roles: [{ id: 'caissier', name: 'Employé libre-service', baseSalary: 1850, capacity: 180 }, manager],
  },
]

export const LOCATIONS: LocationDef[] = [
  { id: 'residentiel', name: 'Quartier résidentiel', rentMonthly: 1200, traffic: 230 },
  { id: 'commercial', name: 'Zone commerciale', rentMonthly: 2600, traffic: 430 },
  { id: 'centre', name: 'Centre-ville', rentMonthly: 3800, traffic: 560 },
  { id: 'affaires', name: 'Quartier d\'affaires', rentMonthly: 5200, traffic: 700 },
]

export const SUPPLIERS: Record<SupplierTier, { name: string; costMult: number; quality: number }> = {
  eco: { name: 'Économique', costMult: 0.75, quality: 40 },
  standard: { name: 'Standard', costMult: 1, quality: 60 },
  premium: { name: 'Premium', costMult: 1.45, quality: 85 },
}

export function getSector(id: string): SectorDef {
  const s = SECTORS.find((x) => x.id === id)
  if (!s) throw new Error(`Secteur inconnu : ${id}`)
  return s
}

export function getLocation(id: string): LocationDef {
  const l = LOCATIONS.find((x) => x.id === id)
  if (!l) throw new Error(`Emplacement inconnu : ${id}`)
  return l
}

export const FIRST_NAMES = ['Léa', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Nathan', 'Inès', 'Yanis', 'Manon', 'Karim', 'Sarah', 'Théo', 'Camille', 'Mehdi', 'Julie', 'Antoine', 'Aïcha', 'Louis', 'Zoé', 'Samuel']
export const LAST_NAMES = ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia', 'Roux', 'Fournier', 'Benali', 'Girard', 'Bonnet', 'Lambert', 'Diallo', 'Mercier']

export const RANDOM_EVENTS: { title: string; description: string; sector: string | null; mult: [number, number]; days: [number, number] }[] = [
  { title: 'Vague de chaleur', description: 'Les clients sortent moins en journée.', sector: null, mult: [0.85, 0.92], days: [4, 9] },
  { title: 'Festival en ville', description: 'Afflux de touristes dans toute la ville.', sector: null, mult: [1.15, 1.3], days: [3, 6] },
  { title: 'Mode du café de spécialité', description: 'Les cafés sont pris d\'assaut.', sector: 'cafe', mult: [1.2, 1.4], days: [10, 20] },
  { title: 'Hausse du prix du blé', description: 'Les clients boudent les boulangeries chères.', sector: 'boulangerie', mult: [0.85, 0.92], days: [10, 20] },
  { title: 'Critique gastronomique', description: 'Un guide met en avant les restaurants locaux.', sector: 'restaurant', mult: [1.15, 1.35], days: [7, 15] },
  { title: 'Soldes nationales', description: 'Ruée sur les boutiques de vêtements.', sector: 'vetements', mult: [1.3, 1.6], days: [7, 14] },
  { title: 'Sortie d\'un nouveau smartphone', description: 'Engouement pour l\'électronique.', sector: 'electronique', mult: [1.25, 1.5], days: [7, 14] },
  { title: 'Grève des transports', description: 'Moins de passants dans les commerces.', sector: null, mult: [0.75, 0.88], days: [2, 5] },
  { title: 'Ouverture d\'un hypermarché', description: 'Concurrence rude pour les supérettes.', sector: 'superette', mult: [0.8, 0.9], days: [15, 30] },
]
