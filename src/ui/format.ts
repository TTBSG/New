const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eurCentsFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const eur = (v: number) => eurFmt.format(v)
export const eurCents = (v: number) => (Math.abs(v) < 100 ? eurCentsFmt.format(v) : eurFmt.format(v))
export const num = (v: number) => Math.round(v).toLocaleString('fr-FR')
export const signed = (v: number) => (v > 0 ? '+' : '') + eur(v)

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
/** Jour 1 = lundi 4 janvier 2027 (même origine que le moteur). */
export const dayLabel = (day: number) => dayFmt.format(new Date(Date.UTC(2027, 0, 4) + (day - 1) * 86400000))

export const TIER_LABEL = { default: 'Standard', premium: 'Premium', eco: 'Économique', bulk: 'Gros volume' } as const
