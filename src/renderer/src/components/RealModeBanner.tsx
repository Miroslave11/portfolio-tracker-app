import { AlertTriangle, Sprout } from 'lucide-react'
import { formatMonth } from '../../../core/date'
import { formatPercent } from '../../../core/money'
import { useInflation } from '../useCalc'

/** Proužek nad obsahem v režimu „po inflaci“ – vysvětlí, co čísla znamenají, a odkud jsou data. */
export function RealModeBanner({ firstDate }: { firstDate?: string }): React.JSX.Element | null {
  const info = useInflation(firstDate)
  if (!info.requested) return null
  if (!info.active) {
    return (
      <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        Data o inflaci (Eurostat) zatím nejsou stažená – zobrazuji nominální hodnoty. Stáhnou se
        spolu s kurzy.
      </div>
    )
  }
  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[13px]"
    >
      <Sprout size={16} className="mt-0.5 shrink-0 text-accent" />
      <span>
        <b>Hodnoty jsou v dnešních cenách</b> (po inflaci). „Vloženo“ zahrnuje znehodnocení
        dřívějších vkladů, takže zisk ukazuje skutečný přírůstek kupní síly.
        {firstDate && info.averageEur !== null && info.averageCzk !== null && (
          <span className="text-muted">
            {' '}
            Průměrná inflace od {formatMonth(firstDate)}: eurozóna{' '}
            {formatPercent(info.averageEur, 1)}, Česko {formatPercent(info.averageCzk, 1)} ročně
            (Eurostat, data do {info.lastMonth ? formatMonth(info.lastMonth) : '–'}).
          </span>
        )}
      </span>
    </div>
  )
}
