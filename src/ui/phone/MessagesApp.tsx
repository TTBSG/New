import { useEffect, useRef } from 'react'
import { fairSalary } from '../../game/engine'
import { level } from '../../game/staff'
import { answer, canAfford, markRead } from '../../game/messages'
import { getSector } from '../../game/sectors'
import type { Conversation, GameState } from '../../game/types'
import { Meter } from '../common'
import { eur } from '../format'
import { Icon, type IconName } from '../icons'
import type { Act } from '../useGame'

const KIND_STYLE: Record<Conversation['kind'], { color: string; icon: IconName }> = {
  advisor: { color: '#a36ee0', icon: 'users' },
  raise: { color: '#f2b134', icon: 'people' },
  supplier: { color: '#5c8de8', icon: 'box' },
  landlord: { color: '#8a6142', icon: 'key' },
  press: { color: '#e85d8a', icon: 'megaphone' },
  bank: { color: '#3987e5', icon: 'bank' },
}

export function Avatar({ kind, size = 44 }: { kind: Conversation['kind']; size?: number }) {
  const k = KIND_STYLE[kind]
  return (
    <span className="avatar" style={{ background: k.color, width: size, height: size }}>
      <Icon name={k.icon} size={size * 0.5} />
    </span>
  )
}

export const needsAttention = (c: Conversation) => c.unread || c.choices.length > 0

export function MessagesApp({
  state,
  act,
  openId,
  onOpen,
}: {
  state: GameState
  act: Act
  openId: string | null
  onOpen: (id: string | null) => void
}) {
  const conv = openId ? state.inbox.find((c) => c.id === openId) : null
  if (conv) return <ConversationView state={state} act={act} conv={conv} />

  if (!state.inbox.length) return <p className="muted center">Aucun message.</p>
  return (
    <div className="threads">
      {state.inbox.map((c) => (
        <button key={c.id} className="thread" onClick={() => onOpen(c.id)}>
          <Avatar kind={c.kind} />
          <span className="thread-main">
            <span className="thread-top">
              <strong>{c.contact}</strong>
              <span className="muted small">J{c.lastDay}</span>
            </span>
            <span className="muted small ellipsis">{c.role}</span>
            <span className={`small ellipsis ${c.unread ? 'strong' : ''}`}>{c.lines.at(-1)?.text}</span>
          </span>
          {c.choices.length > 0 ? <span className="pill">À décider</span> : c.unread && <span className="dot" />}
        </button>
      ))}
    </div>
  )
}

function ConversationView({ state, act, conv }: { state: GameState; act: Act; conv: Conversation }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (conv.unread) act(markRead, conv.id)
  }, [conv.id, conv.unread, act])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [conv.lines.length])

  const business = state.businesses.find((b) => b.id === conv.businessId)
  const employee = business?.employees.find((e) => e.id === conv.employeeId)

  return (
    <div className="convo">
      <div className="convo-head">
        <Avatar kind={conv.kind} size={40} />
        <div>
          <strong>{conv.contact}</strong>
          <div className="muted small">{conv.role}</div>
        </div>
      </div>

      <div className="bubbles">
        {conv.lines.map((l, i) => (
          <div key={i} className={`bubble ${l.from}`}>
            {l.text}
          </div>
        ))}

        {conv.kind === 'raise' && employee && business && conv.choices.length > 0 && (
          <div className="info-card">
            <div className="info-title">FICHE EMPLOYÉ</div>
            <div className="info-row">
              <span>Salaire actuel</span>
              <strong>{eur(employee.salary)}</strong>
            </div>
            <div className="info-row">
              <span>Prix du marché</span>
              <strong>~{eur(fairSalary(getSector(business.sectorId).roles.find((r) => r.id === employee.roleId)!.baseSalary, level(employee.skills)))}</strong>
            </div>
            <div className="info-row">
              <span>Compétence</span>
              <strong>{level(employee.skills)}</strong>
            </div>
            <div className="info-row">
              <span>Moral</span>
              <strong>{Math.round(employee.morale)}</strong>
            </div>
            <Meter value={employee.morale} label="Moral" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {conv.choices.length > 0 && (
        <div className="choices">
          <div className="info-title">
            VOTRE RÉPONSE{conv.expiresDay !== undefined && ` · ${Math.max(0, conv.expiresDay - state.day)} j pour répondre`}
          </div>
          {conv.choices.map((ch, i) => {
            const affordable = canAfford(state, conv, ch.id)
            return (
              <button key={ch.id} className={`reply ${i === 0 ? 'primary' : ''}`} disabled={!affordable} onClick={() => act(answer, conv.id, ch.id)}>
                <span>{ch.label}</span>
                <small className={ch.tone === 'bad' ? 'bad' : undefined}>{affordable ? ch.hint : 'trésorerie insuffisante'}</small>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
