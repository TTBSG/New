import { useEffect, useState, type ReactNode } from 'react'
import { eur } from './format'

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'good' | 'bad'; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function Meter({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const level = pct < 30 ? 'low' : pct < 60 ? 'mid' : 'high'
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(value)} aria-valuemax={max} aria-label={label}>
      <div className={`meter-fill ${level}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Champ numérique avec boutons − / + ; la valeur n'est validée qu'à la fin de la saisie. */
export function NumberField({
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
  decimals = 0,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
  decimals?: number
}) {
  // Affichage à la française : virgule décimale.
  const show = (v: number) => v.toFixed(decimals).replace('.', ',')
  const [text, setText] = useState(show(value))
  useEffect(() => setText(show(value)), [value, decimals])
  const commit = (v: number) => {
    const clean = Math.max(min, Number.isFinite(v) ? v : value)
    onChange(Number(clean.toFixed(decimals)))
    setText(show(clean))
  }
  return (
    <div className="numfield">
      <button type="button" onClick={() => commit(value - step)} aria-label="Diminuer">−</button>
      <input
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => commit(parseFloat(text.replace(',', '.')))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span className="numfield-suffix">{suffix}</span>}
      <button type="button" onClick={() => commit(value + step)} aria-label="Augmenter">+</button>
    </div>
  )
}

/** Histogramme d'une série (bénéfice journalier…) : bleu au-dessus de zéro, rouge en dessous. */
export function BarChart({ values, labels, format = eur, height = 120 }: { values: number[]; labels: string[]; format?: (v: number) => string; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  if (!values.length) return <p className="muted">Pas encore de données : faites avancer le temps.</p>
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const w = 300
  const barW = w / values.length
  const zeroY = (max / span) * height
  const shown = active ?? values.length - 1
  return (
    <div className="chart">
      <div className="chart-readout">
        <span className="muted">{labels[shown]}</span> <strong>{format(values[shown])}</strong>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" onPointerLeave={() => setActive(null)} role="img" aria-label="Graphique">
        <line x1="0" x2={w} y1={zeroY} y2={zeroY} className="chart-zero" />
        {values.map((v, i) => {
          const h = Math.max(1, (Math.abs(v) / span) * height)
          return (
            <g key={i} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
              <rect x={i * barW} y={0} width={barW} height={height} fill="transparent" />
              <rect
                x={i * barW + 1}
                y={v >= 0 ? zeroY - h : zeroY}
                width={Math.max(1, barW - 2)}
                height={h}
                rx={Math.min(2, barW / 4)}
                className={`${v >= 0 ? 'bar-pos' : 'bar-neg'} ${i === shown ? 'bar-active' : ''}`}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
