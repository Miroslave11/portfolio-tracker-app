import { Card } from '../components/Card'
import type { ScreenMeta } from '../screenMeta'
import { useApp } from '../store'

/** Dočasná obrazovka – ukazuje, co přijde a ve kterém přírůstku. */
export function PlaceholderScreen({ meta }: { meta: ScreenMeta }): React.JSX.Element {
  const brokerFilter = useApp((s) => s.brokerFilter)
  const currency = useApp((s) => s.settings.displayCurrency)
  const Icon = meta.icon

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Icon size={28} />
          </div>
          <div>
            <div className="text-lg font-semibold">{meta.title}</div>
            <div className="text-muted">Obsah přijde v přírůstku {meta.increment}</div>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-6 text-muted">
          {meta.planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <Card title="Filtr brokera">
          <div className="text-2xl font-bold">{brokerFilter === 'all' ? 'Vše' : brokerFilter}</div>
        </Card>
        <Card title="Měna zobrazení">
          <div className="text-2xl font-bold">{currency}</div>
        </Card>
        <Card title="Akcent">
          <div className="h-8 rounded-lg bg-accent" />
        </Card>
      </div>
    </div>
  )
}
