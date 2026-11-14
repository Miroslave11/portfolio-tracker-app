import { Download, RefreshCw } from 'lucide-react'
import { useApp } from '../store'

/** Pruh nad obsahem: stahuje se nová verze, nebo je připravená k instalaci (restart aplikace). */
export function UpdateBanner(): React.JSX.Element | null {
  const update = useApp((s) => s.update)

  if (update.status === 'downloading') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b bg-surface-2 px-[26px] py-2 text-[13px] text-muted"
      >
        <Download size={14} className="text-accent" />
        Stahuji novou verzi {update.version} ({update.percent} %)…
      </div>
    )
  }
  if (update.status !== 'ready') return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b bg-accent/10 px-[26px] py-2 text-[13px]"
    >
      <RefreshCw size={14} className="text-accent" />
      <span>
        Nová verze <b>{update.version}</b> je stažená. Nainstaluje se po restartu aplikace.
      </span>
      <button
        onClick={() => void window.api.installUpdate()}
        className="rounded-[8px] bg-accent px-3 py-[5px] text-[13px] font-semibold text-white hover:brightness-110"
      >
        Restartovat a nainstalovat
      </button>
    </div>
  )
}
