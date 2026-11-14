interface Props {
  title?: string
  children: React.ReactNode
  className?: string
}

export function Card({ title, children, className = '' }: Props): React.JSX.Element {
  return (
    <section className={`rounded-[14px] border bg-surface p-[18px] shadow-card ${className}`}>
      {title && (
        <h3 className="mb-3 text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}
