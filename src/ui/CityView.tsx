import { useEffect, useMemo, useState } from 'react'
import { getParcel, isFree, parcelRent, parcelTraffic } from '../game/city'
import { HQ_LEVELS, HQ_RANK, hqLevel, hqOpeningCost, hqUnlocked, maxBusinesses, openHq } from '../game/hq'
import { openBusiness, openingCost, serviceCapacity } from '../game/engine'
import { isSectorUnlocked, sectorUnlockRank } from '../game/objectives'
import { SECTORS, getDistrict, getSector } from '../game/sectors'
import type { GameState } from '../game/types'
import { CityMap, type Overlay } from './city/CityMap'
import { eur, num, signed } from './format'
import { Icon, type IconName } from './icons'
import type { Act } from './useGame'

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: 'none', label: 'Ville' },
  { id: 'traffic', label: 'Fréquentation' },
  { id: 'rent', label: 'Loyers' },
]

export function CityView({
  state,
  act,
  onManage,
  onHq,
  onSheetChange,
}: {
  state: GameState
  act: Act
  onManage: (businessId: string) => void
  onHq: () => void
  onSheetChange: (open: boolean) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [picking, setPicking] = useState(false)

  useEffect(() => onSheetChange(selectedId !== null), [selectedId, onSheetChange])

  const parcel = selectedId ? getParcel(state.city, selectedId) : null
  const business = parcel ? state.businesses.find((b) => b.parcelId === parcel.id) : undefined
  const vacant = parcel ? parcel.kind === 'lot' && isFree(state, parcel) : false
  const isHq = !!parcel && state.hq?.parcelId === parcel.id
  const hqParcelId = state.hq?.parcelId
  const hqHeight = state.hq ? hqLevel(state.hq).height : 0
  // Objet stable tant que le siège ne change pas, pour ne pas redessiner toute la ville.
  const hqOnMap = useMemo(() => (hqParcelId ? { parcelId: hqParcelId, height: hqHeight } : null), [hqParcelId, hqHeight])
  const atLimit = state.businesses.length >= maxBusinesses(state)

  return (
    <div className="cityview">
      <CityMap
        city={state.city}
        businesses={state.businesses}
        hq={hqOnMap}
        selectedId={selectedId}
        overlay={overlay}
        onSelect={(id) => {
          setSelectedId(id)
          setPicking(false)
        }}
      />

      <div className="map-filters">
        {OVERLAYS.map((o) => (
          <button key={o.id} className={`chip ${overlay === o.id ? 'active' : ''}`} onClick={() => setOverlay(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {overlay !== 'none' && (
        <div className={`map-legend ${overlay}`}>
          <span>{overlay === 'traffic' ? 'Peu de passants' : 'Loyer bas'}</span>
          <i />
          <span>{overlay === 'traffic' ? 'Très passant' : 'Loyer élevé'}</span>
        </div>
      )}


      {parcel && (
        <div className="sheet docked">
          <div className="grab" />
          <button className="icon-btn sheet-close" onClick={() => setSelectedId(null)} aria-label="Fermer">
            <Icon name="close" size={18} />
          </button>

          {business && (
            <>
              <div className="sheet-title">
                <span className="sector-badge" style={{ background: getSector(business.sectorId).color }}>
                  <Icon name={business.sectorId as IconName} size={20} />
                </span>
                <div>
                  <h3>{business.name}</h3>
                  <span className="muted small">
                    {getSector(business.sectorId).name} · {parcel.address}
                  </span>
                </div>
              </div>
              <div className="tiles">
                <div className="tile">
                  <strong>{num(business.history.at(-1)?.unitsSold ?? 0)}</strong>
                  <small>ventes hier</small>
                </div>
                <div className="tile">
                  <strong>
                    <Icon name="star" size={14} className="star" /> {Math.round(business.reputation)}
                  </strong>
                  <small>réputation</small>
                </div>
                <div className="tile">
                  <strong className={(business.history.at(-1)?.profit ?? 0) < 0 ? 'bad' : 'good'}>{signed(business.history.at(-1)?.profit ?? 0)}</strong>
                  <small>bénéfice hier</small>
                </div>
              </div>
              {serviceCapacity(business) === 0 && <p className="warn small">Aucun employé : le commerce ne peut servir personne.</p>}
              <button
                className="btn primary block"
                onClick={() => {
                  setSelectedId(null)
                  onManage(business.id)
                }}
              >
                Gérer le commerce
              </button>
            </>
          )}

          {vacant && !picking && (
            <>
              <div className="sheet-title">
                <span className="sector-badge" style={{ background: '#e8743b' }}>
                  <Icon name="key" size={20} />
                </span>
                <div>
                  <h3>Local à louer</h3>
                  <span className="muted small">
                    {parcel.address} · {getDistrict(parcel.districtId).name}
                  </span>
                </div>
              </div>
              <div className="tiles">
                <div className="tile">
                  <strong>{num(parcelTraffic(parcel))}</strong>
                  <small>passants/jour</small>
                </div>
                <div className="tile">
                  <strong>{eur(parcelRent(parcel))}</strong>
                  <small>loyer/mois</small>
                </div>
              </div>
              {atLimit ? (
                <p className="small warn">
                  Vous gérez déjà {state.businesses.length} commerces, le maximum{' '}
                  {state.hq ? 'pour votre siège actuel : agrandissez-le dans l\'appli Siège.' : `sans siège social${hqUnlocked(state) ? '.' : ` (débloqué au rang ${HQ_RANK}).`}`}
                </p>
              ) : (
                <button className="btn primary block" onClick={() => setPicking(true)}>
                  Ouvrir un commerce ici
                </button>
              )}
              {!state.hq && hqUnlocked(state) && (
                <button
                  className="btn block hq-btn"
                  disabled={state.cash < hqOpeningCost(state, parcel.id)}
                  onClick={() => {
                    if (confirm(`Installer votre siège social ici pour ${eur(hqOpeningCost(state, parcel.id))} (aménagement + caution) ? Loyer : ${eur(parcelRent(parcel))}/mois.`)) {
                      act(openHq, parcel.id)
                      setSelectedId(null)
                      onHq()
                    }
                  }}
                >
                  <Icon name="tower" size={18} /> Installer le siège ici · {eur(hqOpeningCost(state, parcel.id))}
                </button>
              )}
            </>
          )}

          {isHq && state.hq && (
            <>
              <div className="sheet-title">
                <span className="sector-badge" style={{ background: '#3d4f7c' }}>
                  <Icon name="tower" size={20} />
                </span>
                <div>
                  <h3>Siège social</h3>
                  <span className="muted small">
                    {hqLevel(state.hq).name} · {parcel.address}
                  </span>
                </div>
              </div>
              <div className="tiles">
                <div className="tile">
                  <strong>
                    {state.businesses.length}/{maxBusinesses(state) === Infinity ? '∞' : maxBusinesses(state)}
                  </strong>
                  <small>commerces</small>
                </div>
                <div className="tile">
                  <strong>
                    {state.hq.staff.length}/{HQ_LEVELS[state.hq.level - 1].desks}
                  </strong>
                  <small>bureaux occupés</small>
                </div>
              </div>
              <button
                className="btn primary block"
                onClick={() => {
                  setSelectedId(null)
                  onHq()
                }}
              >
                Gérer le siège
              </button>
            </>
          )}

          {vacant && picking && (
            <SectorPicker
              state={state}
              parcelId={parcel.id}
              onCancel={() => setPicking(false)}
              onOpen={(sectorId, name) => {
                act(openBusiness, sectorId, parcel.id, name)
                setPicking(false)
                setSelectedId(null)
                setOverlay('none')
              }}
            />
          )}

          {!business && !vacant && !isHq && (
            <>
              <div className="sheet-title">
                <span className="sector-badge" style={{ background: '#9a9590' }}>
                  <Icon name="lock" size={20} />
                </span>
                <div>
                  <h3>{parcel.kind === 'park' ? 'Parc' : 'Immeuble occupé'}</h3>
                  <span className="muted small">
                    {parcel.address} · {getDistrict(parcel.districtId).name}
                  </span>
                </div>
              </div>
              <p className="muted small">Pas disponible pour le moment. Cherchez les panneaux « À louer ».</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SectorPicker({
  state,
  parcelId,
  onCancel,
  onOpen,
}: {
  state: GameState
  parcelId: string
  onCancel: () => void
  onOpen: (sectorId: string, name: string) => void
}) {
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [name, setName] = useState('')

  if (!sectorId)
    return (
      <>
        <h3 className="sheet-h">Quel commerce ouvrir ?</h3>
        <div className="sector-list">
          {SECTORS.map((s) => {
            const cost = openingCost(state, s.id, parcelId)
            const tooExpensive = cost > state.cash
            const locked = !isSectorUnlocked(state, s.id)
            return (
              <button key={s.id} className={`choice ${locked ? 'is-locked' : ''}`} disabled={tooExpensive || locked} onClick={() => setSectorId(s.id)}>
                <span className="sector-badge" style={{ background: s.color }}>
                  <Icon name={s.id as IconName} size={20} />
                </span>
                <span className="choice-main">
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.description}</span>
                </span>
                {locked ? (
                  <span className="small strong lock-note">
                    <Icon name="lock" size={14} /> Rang {sectorUnlockRank(s.id) + 1}
                  </span>
                ) : (
                  <span className={`small strong ${tooExpensive ? 'bad' : ''}`}>{eur(cost)}</span>
                )}
              </button>
            )
          })}
        </div>
        <p className="muted small">Le prix comprend l'aménagement et deux mois de loyer en caution. Le stock de départ est acheté en plus.</p>
        <button className="btn block" onClick={onCancel}>
          Retour
        </button>
      </>
    )

  const sector = getSector(sectorId)
  return (
    <>
      <h3 className="sheet-h">Nommer votre {sector.name.toLowerCase()}</h3>
      <input className="text-input" autoFocus placeholder={sector.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={28} />
      <p className="muted small">Coût d'ouverture : {eur(openingCost(state, sectorId, parcelId))}</p>
      <div className="row">
        <button className="btn" onClick={() => setSectorId(null)}>
          Retour
        </button>
        <button className="btn primary grow" onClick={() => onOpen(sectorId, name)}>
          Ouvrir
        </button>
      </div>
    </>
  )
}
