import { getParcel, parcelRent } from './city'
import { getSector } from './sectors'
import type { Business, Choice, Conversation, ConversationKind, Employee, GameState } from './types'
import { clamp, log, newId, pick, rand, randRange, update } from './util'

const INBOX_SIZE = 40
const ADVISOR = { contact: 'Camille Roux', role: 'Conseillère en gestion' }

/** Salaire attendu sur le marché pour un niveau de compétence donné. */
export function fairSalary(baseSalary: number, skill: number): number {
  return baseSalary * (0.8 + skill / 160)
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step
const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`

function send(
  s: GameState,
  kind: ConversationKind,
  who: { contact: string; role: string },
  lines: string[],
  extra: Partial<Conversation> = {},
): Conversation {
  const c: Conversation = {
    id: newId(s, 'm'),
    kind,
    contact: who.contact,
    role: who.role,
    lines: lines.map((text) => ({ from: 'them', text, day: s.day })),
    choices: [],
    unread: true,
    lastDay: s.day,
    ...extra,
  }
  s.inbox.unshift(c)
  if (s.inbox.length > INBOX_SIZE) {
    // On garde toujours les décisions en attente.
    const pending = s.inbox.filter((x) => x.choices.length > 0)
    const rest = s.inbox.filter((x) => x.choices.length === 0).slice(0, Math.max(0, INBOX_SIZE - pending.length))
    s.inbox = [...pending, ...rest].sort((a, b) => b.lastDay - a.lastDay)
  }
  return c
}

function reply(c: Conversation, from: 'them' | 'me', text: string, day: number) {
  c.lines.push({ from, text, day })
  c.lastDay = day
}

const pending = (s: GameState, kind: ConversationKind, key: Partial<Conversation>) =>
  s.inbox.some((c) => c.kind === kind && c.choices.length > 0 && Object.entries(key).every(([k, v]) => c[k as keyof Conversation] === v))

function roleOf(b: Business, e: Employee) {
  return getSector(b.sectorId).roles.find((r) => r.id === e.roleId)!
}

// ---------- Conseils de la conseillère (une seule fois chacun) ----------

export function welcomeMessage(s: GameState) {
  send(s, 'advisor', ADVISOR, [
    'Bonjour et bienvenue ! Je suis Camille, je vous accompagne pour vos débuts.',
    'Sur la carte, les panneaux « À louer » sont les locaux disponibles. Utilisez le calque « Fréquentation » pour repérer les emplacements passants.',
    'Une fois votre commerce ouvert, gérez-le depuis l\'appli Commerces de ce téléphone. Et surtout : recrutez quelqu\'un, sinon personne ne servira les clients !',
  ])
  s.flags.welcome = true
}

function advise(s: GameState, flag: string, lines: string[]) {
  if (s.flags[flag]) return
  s.flags[flag] = true
  send(s, 'advisor', ADVISOR, lines)
}

function adviceFor(s: GameState, b: Business) {
  const last = b.history.at(-1)
  if (!last) return
  const staff = b.employees.filter((e) => roleOf(b, e).capacity > 0).length
  if (staff === 0 && s.day - b.openedDay >= 1)
    advise(s, 'no_staff', [
      `${b.name} est ouvert mais personne ne sert les clients.`,
      'Ouvrez l\'appli Recrut\' (ou l\'onglet Équipe du commerce) pour embaucher. Les candidats changent chaque lundi.',
    ])
  if (staff > 0 && last.lostToCapacity > last.demand * 0.15)
    advise(s, 'overloaded', [
      `Hier, ${b.name} a perdu ${Math.round(last.lostToCapacity)} ventes parce que l'équipe était débordée.`,
      'Embaucher une personne de plus coûte souvent moins cher que les ventes perdues, et vos clients seront plus satisfaits.',
    ])
  if (last.lostToStockout > last.demand * 0.15)
    advise(s, 'stockout', [
      `Attention, ${b.name} tombe en rupture de stock.`,
      'Dans l\'onglet Produits, augmentez le « stock cible » des articles concernés.',
    ])
  if (b.history.length >= 14 && b.history.slice(-14).every((r) => r.profit < 0))
    advise(s, 'losing', [
      `${b.name} perd de l'argent depuis deux semaines.`,
      'Regardez l\'onglet Finances : salaires trop élevés pour le chiffre d\'affaires ? Prix trop bas ? Loyer trop cher pour la fréquentation ? Parfois, revendre est la meilleure décision.',
    ])
}

// ---------- Événements avec décision ----------

function maybeRaiseRequest(s: GameState, b: Business) {
  for (const e of b.employees) {
    if (s.day - e.hiredDay < 28 || pending(s, 'raise', { employeeId: e.id })) continue
    const fair = fairSalary(roleOf(b, e).baseSalary, e.skill)
    if (e.salary >= fair * 0.98 || rand(s) > 0.025) continue
    const asked = roundTo(fair * 1.06, 10)
    const counter = roundTo(fair, 10)
    const rival = pick(s, ['La concurrence', 'Une boutique du centre-ville', 'Un ancien collègue', 'Une enseigne du quartier'])
    send(
      s,
      'raise',
      { contact: e.name, role: `${roleOf(b, e).name} · ${b.name}` },
      [
        `Bonjour ! Ça fait ${Math.floor((s.day - e.hiredDay) / 7)} semaines que je suis là et j'ai beaucoup progressé.`,
        `${rival} m'a proposé ${eur(asked)} par mois. Je préfère rester, mais est-ce qu'on peut revoir mon salaire ?`,
      ],
      {
        businessId: b.id,
        employeeId: e.id,
        amount: asked,
        quantity: counter,
        expiresDay: s.day + 7,
        choices: [
          { id: 'accept', label: `« OK pour ${eur(asked)}, tu le mérites. »`, hint: `+${eur(asked - e.salary)}/mois · moral ++`, tone: 'good' },
          ...(counter > e.salary ? [{ id: 'counter', label: `« Je te propose ${eur(counter)}. »`, hint: `+${eur(counter - e.salary)}/mois · moral +` }] : []),
          { id: 'refuse', label: '« Pas pour l\'instant. »', hint: 'moral −− · risque de départ', tone: 'bad' },
        ],
      },
    )
    return
  }
}

function maybeSupplierDeal(s: GameState) {
  if (!s.businesses.length || rand(s) > 1 / 20) return
  const b = pick(s, s.businesses)
  const p = pick(s, b.products)
  const def = getSector(b.sectorId).products.find((x) => x.id === p.id)!
  const discount = Math.round(randRange(s, 0.2, 0.35) * 100) / 100
  const quantity = Math.max(10, Math.round(p.restockTarget * randRange(s, 2, 4)))
  const price = Math.round(quantity * def.unitCost * (1 - discount))
  send(
    s,
    'supplier',
    { contact: pick(s, ['Grossiste Duval', 'Distrib\'Pro', 'Métro Sud', 'Comptoir Lefèvre']), role: `Fournisseur · ${def.name}` },
    [
      `Bonjour, nous avons un surplus de « ${def.name} ».`,
      `Je vous propose ${quantity} unités pour ${b.name} à ${eur(price)}, soit −${Math.round(discount * 100)} % sur le prix habituel. Offre valable 3 jours.`,
    ],
    {
      businessId: b.id,
      productId: p.id,
      amount: price,
      quantity,
      expiresDay: s.day + 3,
      choices: [
        { id: 'accept', label: '« Marché conclu. »', hint: `−${eur(price)} · +${quantity} en stock`, tone: 'good' },
        { id: 'refuse', label: '« Non merci. »', hint: 'rien ne change' },
      ],
    },
  )
}

function maybeLandlord(s: GameState, b: Business) {
  if (s.day - b.openedDay < 60 || pending(s, 'landlord', { businessId: b.id }) || rand(s) > 1 / 90) return
  const rent = parcelRent(getParcel(s.city, b.parcelId)) * b.rentMult
  const increase = roundTo(rent * 0.08, 10)
  send(
    s,
    'landlord',
    { contact: pick(s, ['M. Bertrand', 'Mme Lefort', 'SCI Les Tilleuls', 'M. Haddad']), role: `Propriétaire · ${b.name}` },
    [
      'Bonjour, les loyers du quartier ont beaucoup augmenté.',
      `Je souhaite passer votre loyer de ${eur(rent)} à ${eur(rent + increase)} par mois. Merci de me répondre sous une semaine.`,
    ],
    {
      businessId: b.id,
      amount: increase,
      expiresDay: s.day + 7,
      choices: [
        { id: 'accept', label: '« D\'accord. »', hint: `+${eur(increase)}/mois` },
        { id: 'negotiate', label: '« Peut-on trouver un compromis ? »', hint: 'résultat incertain' },
        { id: 'refuse', label: '« Hors de question. »', hint: 'il peut renoncer… ou se fâcher', tone: 'bad' },
      ],
    },
  )
}

function maybePress(s: GameState) {
  const candidates = s.businesses.filter((b) => b.reputation >= 40 && !pending(s, 'press', { businessId: b.id }))
  if (!candidates.length || rand(s) > 1 / 35) return
  const b = pick(s, candidates)
  const fee = roundTo(randRange(s, 150, 450), 10)
  send(
    s,
    'press',
    { contact: pick(s, ['Léo · @bonsplans_city', 'Le Petit Journal local', 'Nina · blog Saveurs & Co', 'Radio Quartier']), role: 'Presse & influence' },
    [`Bonjour ! On aimerait parler de ${b.name} à notre communauté.`, `Pour un article complet avec photos, nous demandons une participation de ${eur(fee)}. Intéressé ?`],
    {
      businessId: b.id,
      amount: fee,
      expiresDay: s.day + 4,
      choices: [
        { id: 'accept', label: '« Avec plaisir ! »', hint: `−${eur(fee)} · réputation +`, tone: 'good' },
        { id: 'refuse', label: '« Pas cette fois. »', hint: 'rien ne change' },
      ],
    },
  )
}

/** Appelé chaque jour après la simulation des commerces. */
export function dailyMessages(s: GameState) {
  for (const b of s.businesses) {
    adviceFor(s, b)
    maybeRaiseRequest(s, b)
    maybeLandlord(s, b)
  }
  maybeSupplierDeal(s)
  maybePress(s)
  if (s.daysInDebt === 1)
    send(s, 'bank', { contact: 'Banque Centrale', role: 'Votre conseiller bancaire' }, [
      'Votre compte est à découvert.',
      'Sans retour à un solde positif d\'ici 30 jours, nous serons contraints d\'engager une procédure de faillite. Un prêt est possible depuis l\'appli Banque.',
    ])
  expireRequests(s)
}

/** Les demandes ignorées finissent par avoir des conséquences. */
function expireRequests(s: GameState) {
  for (const c of s.inbox) {
    if (!c.choices.length || c.expiresDay === undefined || s.day <= c.expiresDay) continue
    if (c.kind === 'landlord') {
      applyChoice(s, c, 'accept')
      reply(c, 'them', 'Sans réponse de votre part, la hausse s\'applique.', s.day)
    } else if (c.kind === 'raise') {
      applyChoice(s, c, 'refuse')
      reply(c, 'them', 'Pas de réponse… Je comprends le message.', s.day)
    } else {
      reply(c, 'them', 'L\'offre a expiré.', s.day)
    }
    c.choices = []
    c.unread = true
  }
}

// ---------- Réponses du joueur ----------

function applyChoice(s: GameState, c: Conversation, choiceId: string): string | null {
  const b = s.businesses.find((x) => x.id === c.businessId)
  if (c.kind !== 'bank' && c.kind !== 'advisor' && !b) return 'Ce commerce n\'existe plus.'
  switch (c.kind) {
    case 'raise': {
      const e = b!.employees.find((x) => x.id === c.employeeId)
      if (!e) return 'Cette personne ne travaille plus chez vous.'
      if (choiceId === 'accept') {
        e.salary = c.amount!
        e.morale = clamp(e.morale + 25, 0, 100)
        return 'Merci beaucoup patron, je ne vous décevrai pas ! 😊'
      }
      if (choiceId === 'counter') {
        e.salary = c.quantity!
        e.morale = clamp(e.morale + 8, 0, 100)
        return 'Bon… c\'est un compromis. D\'accord.'
      }
      e.morale = clamp(e.morale - 18, 0, 100)
      return 'Je vois. Je vais réfléchir à mon avenir…'
    }
    case 'supplier': {
      if (choiceId !== 'accept') return 'Pas de souci, à une prochaine fois.'
      if (s.cash < c.amount!) return 'Votre trésorerie ne permet pas ce paiement.'
      const p = b!.products.find((x) => x.id === c.productId)!
      s.cash -= c.amount!
      p.stock += c.quantity!
      log(s, `Achat groupé pour ${b!.name} : ${c.quantity} unités pour ${eur(c.amount!)}.`)
      return 'Parfait, la livraison arrive aujourd\'hui !'
    }
    case 'landlord': {
      const base = parcelRent(getParcel(s.city, b!.parcelId))
      const current = base * b!.rentMult
      if (choiceId === 'accept') {
        b!.rentMult = (current + c.amount!) / base
        return 'Merci pour votre compréhension.'
      }
      const lucky = rand(s) < (choiceId === 'negotiate' ? 0.6 : 0.5)
      if (lucky) {
        const raise = choiceId === 'negotiate' ? roundTo(c.amount! * 0.4, 10) : 0
        b!.rentMult = (current + raise) / base
        return raise ? `Bon, disons +${eur(raise)} seulement.` : 'Bon… je garde le loyer actuel, pour cette fois.'
      }
      const raise = roundTo(c.amount! * 1.5, 10)
      b!.rentMult = (current + raise) / base
      return `Dans ce cas ce sera +${eur(raise)}, c'est à prendre ou à laisser.`
    }
    case 'press': {
      if (choiceId !== 'accept') return 'Dommage, une autre fois peut-être !'
      if (s.cash < c.amount!) return 'Votre trésorerie ne permet pas ce paiement.'
      s.cash -= c.amount!
      b!.reputation = clamp(b!.reputation + 8, 0, 100)
      log(s, `Article publié sur ${b!.name} : la réputation grimpe.`, 'good')
      return 'Super ! L\'article est en ligne, vos clients vont adorer.'
    }
    default:
      return null
  }
}

/** Les choix qui coûtent de l'argent tout de suite exigent une trésorerie suffisante. */
export function canAfford(s: GameState, c: Conversation, choiceId: string): boolean {
  const pays = (c.kind === 'supplier' || c.kind === 'press') && choiceId === 'accept'
  return !pays || s.cash >= (c.amount ?? 0)
}

export function answer(state: GameState, conversationId: string, choiceId: string): GameState {
  const conv = state.inbox.find((c) => c.id === conversationId)
  if (!conv || !conv.choices.some((ch) => ch.id === choiceId)) return state
  if (!canAfford(state, conv, choiceId)) return state
  return update(state, (s) => {
    const c = s.inbox.find((x) => x.id === conversationId)!
    const choice: Choice = c.choices.find((ch) => ch.id === choiceId)!
    const response = applyChoice(s, c, choiceId)
    reply(c, 'me', choice.label.replace(/^«\s*|\s*»$/g, ''), s.day)
    if (response) reply(c, 'them', response, s.day)
    c.choices = []
    c.unread = false
  })
}

export function markRead(state: GameState, conversationId: string): GameState {
  if (!state.inbox.some((c) => c.id === conversationId && c.unread)) return state
  return update(state, (s) => {
    s.inbox.find((c) => c.id === conversationId)!.unread = false
  })
}
