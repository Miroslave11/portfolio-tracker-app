/** Posuvník s popiskem a hodnotou (kalkulačka čerpání). */
export function Slider({
  label,
  aria,
  value,
  min,
  max,
  step,
  current,
  onChange
}: {
  label: string
  aria: string
  value: string
  min: number
  max: number
  step: number
  current: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <b>{value}</b>
      </div>
      <input
        type="range"
        aria-label={aria}
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--accent)]"
      />
    </div>
  )
}

/** Malá statistika v kartě (titulek, velké číslo, popisek). */
export function Stat({
  title,
  value,
  sub,
  tone = ''
}: {
  title: React.ReactNode
  value: string
  sub: string
  tone?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">{title}</div>
      <div className={`mt-1 text-[20px] font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  )
}
