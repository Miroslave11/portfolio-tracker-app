interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange(value: T): void
  ariaLabel: string
}

/** Přepínač typu „segmented control“ (Vše / Freedom24 / …, EUR / CZK). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: Props<T>): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[9px] border bg-surface-2 p-[3px]"
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-[7px] px-3 py-[5px] text-[13px] transition-all ${
              on ? 'bg-surface font-semibold text-fg shadow-card' : 'text-muted hover:text-fg'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
