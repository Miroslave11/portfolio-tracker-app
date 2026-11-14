import { Card } from './Card'

/** Popisek s tečkovaným podtržením; vysvětlení se ukáže po najetí myší. */
export function Tip({
  text,
  children
}: {
  text: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span title={text} className="cursor-help border-b border-dotted border-muted/70">
      {children}
    </span>
  )
}

/** Karta s jedním velkým číslem. */
export function Kpi({
  title,
  value,
  sub,
  tone = ''
}: {
  title: React.ReactNode
  value: string
  sub?: React.ReactNode
  tone?: string
}): React.JSX.Element {
  return (
    <Card>
      <h3 className="mb-2 text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
        {title}
      </h3>
      <div className={`text-[26px] font-bold tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
    </Card>
  )
}
