import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatDate, formatDateTime } from '../../../core/date'
import { formatMoney } from '../../../core/money'
import { latestQuote } from '../../../core/prices/series'
import { FX_EUR_CZK } from '../../../shared/prices'
import { Card } from '../components/Card'
import { useApp } from '../store'

function Change({ pct }: { pct: number | null }): React.JSX.Element {
  if (pct === null) return <span className="text-muted">–</span>
  const cls = pct > 0 ? 'text-pos' : pct < 0 ? 'text-neg' : 'text-muted'
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')} %`
  return <span className={cls}>{text}</span>
}

export function SecuritiesScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const report = useApp((s) => s.priceReport)
  const updating = useApp((s) => s.priceUpdating)
  const priceError = useApp((s) => s.priceError)
  const refresh = useApp((s) => s.refreshPrices)

  const errors = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of report?.securities ?? []) if (!s.ok && s.error) map.set(s.id, s.error)
    return map
  }, [report])
  const fxError = report && !report.fx.ok ? report.fx.error : null
  const fx = prices.fx[FX_EUR_CZK]
  const fxLast = fx?.rates.at(-1)

  if (!portfolio || portfolio.securities.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-muted">
          Zatím nejsou žádná ETF. Naimportuj transakce na obrazovce Obchody.
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4">
        <p className="text-[13px] text-muted">
          Kurzy se stahují z Yahoo Finance (ETF) a České národní banky (EUR/CZK).
        </p>
        <button
          onClick={() => refresh()}
          disabled={updating}
          className="ml-auto flex items-center gap-1.5 rounded-[9px] border bg-surface px-3.5 py-[7px] text-[13px] hover:brightness-110 disabled:opacity-60"
        >
          <RefreshCw size={15} className={updating ? 'animate-spin' : ''} />
          {updating ? 'Aktualizuji…' : 'Aktualizovat kurzy'}
        </button>
      </div>

      {priceError && (
        <div className="rounded-xl border border-neg/50 bg-neg/10 px-4 py-3 text-neg">
          {priceError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card title="Kurz EUR / CZK (ČNB)">
          {fxLast ? (
            <>
              <div className="text-2xl font-bold">{fxLast[1].toFixed(3).replace('.', ',')} Kč</div>
              <div className="mt-1 text-xs text-muted">
                z {formatDate(fxLast[0])} · {fx.rates.length} dní historie
              </div>
            </>
          ) : (
            <div className="text-muted">Zatím nestaženo</div>
          )}
          {fxError && <div className="mt-2 text-xs text-neg">{fxError}</div>}
        </Card>
        <Card title="Poslední aktualizace">
          <div className="text-2xl font-bold">
            {report ? formatDateTime(report.finishedAt) : '–'}
          </div>
          <div
            className={`mt-1 text-xs ${
              report && report.securities.some((s) => !s.ok) ? 'text-amber-500' : 'text-muted'
            }`}
          >
            {report
              ? `staženo ${report.securities.filter((s) => s.ok).length} z ${report.securities.length} ETF`
              : 'od spuštění appky se ještě nestahovalo'}
          </div>
        </Card>
        <Card title="Automatická aktualizace">
          <div className="text-[13px] text-muted">
            Při spuštění a každou hodinu. Vypnout lze v Nastavení.
          </div>
        </Card>
      </div>

      <Card className="!p-0">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              {['ETF', 'Index', 'ISIN', 'Poslední kurz', 'Za den', 'K datu', 'Dní dat'].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`border-b px-3 py-2 font-semibold ${i >= 3 ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {portfolio.securities.map((sec) => {
              const series = prices.securities[sec.id]
              const quote = latestQuote(series)
              const error = errors.get(sec.id)
              return (
                <tr key={sec.id} className="align-top hover:bg-surface-2">
                  <td className="border-b px-3 py-2">
                    <span
                      className="mr-2 inline-block size-2 rounded-full"
                      style={{ background: sec.color }}
                    />
                    <b>{sec.id}</b>
                    <div className="ml-4 text-xs text-muted">{sec.name}</div>
                    {error && <div className="ml-4 text-xs text-neg">{error}</div>}
                  </td>
                  <td className="border-b px-3 py-2">{sec.indexGroup}</td>
                  <td className="border-b px-3 py-2 text-muted">{sec.isin ?? '–'}</td>
                  <td className="border-b px-3 py-2 text-right whitespace-nowrap">
                    {quote ? formatMoney(quote.price, sec.currency as 'EUR') : '–'}
                  </td>
                  <td className="border-b px-3 py-2 text-right">
                    <Change pct={quote?.changePct ?? null} />
                  </td>
                  <td className="border-b px-3 py-2 text-right whitespace-nowrap">
                    {quote ? formatDate(quote.date) : '–'}
                  </td>
                  <td className="border-b px-3 py-2 text-right text-muted">
                    {series?.prices.length ?? 0}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
