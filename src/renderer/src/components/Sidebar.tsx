import { useEffect, useState } from 'react'
import { priceStatus, type PriceStatusKind } from '../../../core/prices/status'
import { SCREEN_META } from '../screenMeta'
import { useApp } from '../store'

const DOT: Record<PriceStatusKind, string> = {
  none: 'bg-muted',
  updating: 'animate-pulse bg-accent',
  ok: 'bg-pos',
  stale: 'bg-amber-500',
  error: 'bg-amber-500'
}

export function Sidebar(): React.JSX.Element {
  const screen = useApp((s) => s.screen)
  const setScreen = useApp((s) => s.setScreen)
  const prices = useApp((s) => s.prices)
  const report = useApp((s) => s.priceReport)
  const updating = useApp((s) => s.priceUpdating)
  const priceError = useApp((s) => s.priceError)
  const status = priceStatus({ cache: prices, report, updating, error: priceError })
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  return (
    <aside className="flex flex-col gap-1 border-r bg-surface px-3 py-[18px]">
      <div className="flex items-center gap-2.5 px-2.5 pb-[18px] text-base font-bold">
        <span
          className="inline-block size-7 rounded-lg"
          style={{ background: 'linear-gradient(135deg, var(--accent), #0ea5e9)' }}
        />
        Portfolio Tracker
      </div>

      <nav className="flex flex-col gap-1" aria-label="Hlavní menu">
        {SCREEN_META.map(({ id, label, icon: Icon }) => {
          const active = id === screen
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-2.5 rounded-[9px] px-3 py-[9px] text-left transition-colors ${
                active
                  ? 'bg-accent/15 font-semibold text-fg'
                  : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {active && (
                <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded bg-accent" />
              )}
              <Icon size={17} strokeWidth={2} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto border-t px-3 pt-2.5 text-xs text-muted">
        <button
          onClick={() => setScreen('securities')}
          title="Zobrazit ETF a kurzy"
          className="flex w-full items-start gap-1.5 text-left hover:text-fg"
        >
          <span
            className={`mt-[5px] inline-block size-[7px] shrink-0 rounded-full ${DOT[status.kind]}`}
          />
          {status.text}
        </button>
        <div className="mt-1 opacity-70">verze {version}</div>
      </div>
    </aside>
  )
}
