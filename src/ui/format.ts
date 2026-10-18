const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eurCentsFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const eur = (v: number) => eurFmt.format(v)
export const eurCents = (v: number) => (Math.abs(v) < 100 ? eurCentsFmt.format(v) : eurFmt.format(v))
export const num = (v: number) => Math.round(v).toLocaleString('fr-FR')
export const signed = (v: number) => (v > 0 ? '+' : '') + eur(v)
