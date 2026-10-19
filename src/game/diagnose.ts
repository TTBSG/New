import { getParcel, parcelRent } from './city'
import { monthlyWages, perceivedPrice, serviceCapacity } from './engine'
import { SLOTS, SLOT_NAMES } from './schedule'
import { stockOf } from './stock'
import { getSupplier, pendingOrders } from './supply'
import { getSector } from './sectors'
import type { Business, GameState } from './types'

export interface Insight {
  tone: 'good' | 'warn' | 'bad'
  text: string
}

const pct = (v: number) => `${Math.round(v * 100)} %`
const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

/** Analyse d'un commerce : ce qui va, ce qui coince et quoi faire, du plus grave au moins grave. */
export function diagnose(s: GameState, b: Business): Insight[] {
  const sector = getSector(b.sectorId)
  const out: Insight[] = []
  const last = b.history.at(-1)
  const capacity = serviceCapacity(b)

  if (capacity === 0) {
    out.push({ tone: 'bad', text: "Aucun employé : personne ne sert les clients. Embauchez dans l'onglet Équipe ou l'appli Recrut'." })
    return out
  }
  if (!last) return [{ tone: 'good', text: 'Le commerce vient d\'ouvrir : faites avancer le temps pour voir les premiers résultats.' }]

  if (last.slotDemand && last.slotCapacity) {
    for (const slot of SLOTS) {
      if (!b.hours[slot]) continue
      const demand = last.slotDemand[slot]
      const cap = last.slotCapacity[slot]
      const name = SLOT_NAMES[slot].toLowerCase()
      if (cap === 0 && demand > 0)
        out.push({ tone: 'bad', text: `Personne au planning le ${name} : ~${demand} clients trouvent porte close. Planifiez quelqu'un dans l'onglet Équipe ou fermez ce créneau.` })
      else if (demand > cap * 1.05)
        out.push({ tone: 'bad', text: `Rush du ${name} : ${cap} clients servis pour ${demand} venus. Ajoutez quelqu'un sur ce créneau (temps partiel ou heures sup).` })
    }
  } else if (last.lostToCapacity > last.demand * 0.05)
    out.push({ tone: 'bad', text: `${Math.round(last.lostToCapacity)} ventes perdues hier faute de personnel (capacité ${Math.round(capacity)}/j pour une demande de ${last.demand}). Embauchez ou motivez l'équipe.` })

  const empty = b.products.filter((p) => stockOf(p) === 0).map((p) => sector.products.find((x) => x.id === p.id)!.name)
  if (last.lostToStockout > last.demand * 0.05)
    out.push({ tone: 'bad', text: `Ruptures de stock${empty.length ? ` (${empty.join(', ')})` : ''} : augmentez le stock cible dans Produits.` })

  for (const p of b.products) {
    const def = sector.products.find((x) => x.id === p.id)!
    const ratio = p.price / perceivedPrice(s, b.sectorId, p)
    if (ratio > 1.2) out.push({ tone: 'warn', text: `« ${def.name} » est jugé trop cher (${eur(p.price)} pour ~${eur(perceivedPrice(s, b.sectorId, p))} attendus) : les clients l'évitent et la réputation baisse.` })
    else if (ratio < 0.8) out.push({ tone: 'warn', text: `Vous bradez « ${def.name} » : vous pourriez le vendre plus cher sans perdre beaucoup de clients.` })
  }

  const wh = s.warehouses.find((w) => w.sectorId === b.sectorId)
  if (wh && b.products.some((p) => p.fromWarehouse) && (wh.history.at(-1)?.unserved ?? 0) > 0)
    out.push({ tone: 'warn', text: "L'entrepôt n'a pas pu livrer toutes les boutiques cette nuit : ajoutez des camions ou des magasiniers dans l'appli Logistique." })

  const late = pendingOrders(s, b.id).filter((o) => o.delayed)
  if (late.length) out.push({ tone: 'warn', text: `Livraison en retard chez ${late.map((o) => getSupplier(s, o.supplierId).name).join(', ')} : attention aux ruptures.` })

  const week7 = b.history.slice(-7)
  const wasted = week7.reduce((a, r) => a + (r.waste ?? 0), 0)
  const revenue7 = week7.reduce((a, r) => a + r.revenue, 0)
  if (revenue7 > 0 && wasted > revenue7 * 0.03) {
    const units: Record<string, number> = {}
    for (const r of week7) for (const [id, n] of Object.entries(r.wasteByProduct ?? {})) units[id] = (units[id] ?? 0) + n
    const worst = Object.entries(units).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([id, n]) => `${n} ${sector.products.find((d) => d.id === id)!.name.toLowerCase()}`)
    out.push({ tone: 'warn', text: `${eur(wasted)} de produits périmés jetés cette semaine (${worst.join(', ')}) : baissez le stock cible des produits frais.` })
  }

  const tired = b.employees.filter((e) => e.morale < 35)
  if (tired.length) out.push({ tone: 'warn', text: `${tired.map((e) => e.name.split(' ')[0]).join(', ')} ${tired.length > 1 ? 'ont' : 'a'} le moral en berne : salaire trop bas ou équipe surchargée. Risque de démission.` })

  const overworked = b.employees.filter((e) => e.shifts.length >= 3 && e.morale < 50)
  if (overworked.length) out.push({ tone: 'warn', text: `${overworked.map((e) => e.name.split(' ')[0]).join(', ')} enchaîne${overworked.length > 1 ? 'nt' : ''} les heures sup et fatigue : un temps partiel en renfort soulagerait l'équipe.` })

  const week = b.history.slice(-7)
  const prevWeek = b.history.slice(-14, -7)
  const repNow = last.reputation
  const repBefore = b.history.at(-8)?.reputation
  if (repNow !== undefined && repBefore !== undefined) {
    if (repNow < repBefore - 2) out.push({ tone: 'warn', text: `La réputation baisse (${Math.round(repBefore)} → ${Math.round(repNow)} en 7 jours). Vérifiez les prix, la qualité et le service.` })
    else if (repNow > repBefore + 2) out.push({ tone: 'good', text: `La réputation grimpe (${Math.round(repBefore)} → ${Math.round(repNow)} en 7 jours) : les clients apprécient.` })
  }

  const revenue30 = b.history.slice(-30).reduce((a, r) => a + r.revenue, 0)
  const days30 = Math.min(30, b.history.length)
  if (revenue30 > 0 && days30 >= 7) {
    const rentShare = (parcelRent(getParcel(s.city, b.parcelId)) * b.rentMult * (days30 / 30)) / revenue30
    if (rentShare > 0.3) out.push({ tone: 'warn', text: `Le loyer pèse lourd : ${pct(rentShare)} du chiffre d'affaires. Il faut plus de ventes pour cet emplacement.` })
    const wageShare = (monthlyWages(b) * (days30 / 30)) / revenue30
    if (wageShare > 0.45) out.push({ tone: 'warn', text: `Les salaires représentent ${pct(wageShare)} du chiffre d'affaires : l'équipe est peut-être trop grande pour l'activité.` })
  }

  if (b.marketingDaily === 0 && last.lostToCapacity === 0 && b.history.length >= 7)
    out.push({ tone: 'warn', text: "L'équipe a de la marge : un peu de publicité (onglet Marketing) attirerait plus de clients." })

  if (week.length === 7 && prevWeek.length === 7) {
    const now = week.reduce((a, r) => a + r.profit, 0)
    const before = prevWeek.reduce((a, r) => a + r.profit, 0)
    if (before > 0 && now < before * 0.8) out.push({ tone: 'warn', text: `Le bénéfice de la semaine baisse de ${pct(1 - now / before)} par rapport à la précédente.` })
    else if (before > 0 && now > before * 1.2) out.push({ tone: 'good', text: `Le bénéfice de la semaine progresse de ${pct(now / before - 1)} !` })
  }

  const rank = { bad: 0, warn: 1, good: 2 }
  out.sort((x, y) => rank[x.tone] - rank[y.tone])
  if (!out.some((i) => i.tone !== 'good')) out.push({ tone: 'good', text: 'Tout roule : équipe suffisante, stocks au rendez-vous et prix bien placés.' })
  return out
}
