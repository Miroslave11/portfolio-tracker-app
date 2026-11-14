import { Loader2 } from 'lucide-react'
import { useApp } from '../store'

/** Celoobrazovkové okno po kliknutí na „Restartovat a nainstalovat“: co se bude dít. */
export function UpdateInstallOverlay(): React.JSX.Element | null {
  const update = useApp((s) => s.update)
  if (update.status !== 'installing') return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-install-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
    >
      <div className="grid max-w-[460px] justify-items-center gap-3 rounded-2xl border bg-surface px-8 py-7 text-center shadow-2xl">
        <Loader2 size={30} className="animate-spin text-accent" />
        <h2 id="update-install-title" className="text-lg font-semibold">
          Instaluji verzi {update.version}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Aplikace se za okamžik zavře. Otevře se okno instalátoru s průběhem; po dokončení klikni
          na
          <b className="text-fg"> Dokončit</b> a aplikace se sama znovu spustí. Trvá to zhruba 10–30
          sekund, počítač zatím nevypínej. Tvoje data zůstanou beze změny.
        </p>
      </div>
    </div>
  )
}
