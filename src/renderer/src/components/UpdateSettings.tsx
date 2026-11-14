import { useEffect, useState } from 'react'
import { updateStatusText } from '../../../shared/update'
import { cleanError } from '../errors'
import { useApp } from '../store'

/** Nastavení → Obecné: automatické aktualizace aplikace (hledání nové verze na GitHubu). */
export function UpdateSettings(): React.JSX.Element {
  const autoUpdate = useApp((s) => s.settings.autoUpdate)
  const updateSettings = useApp((s) => s.updateSettings)
  const update = useApp((s) => s.update)
  const setUpdate = useApp((s) => s.setUpdate)
  const [version, setVersion] = useState('')
  const [checkError, setCheckError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  const check = async (): Promise<void> => {
    setCheckError(null)
    try {
      setUpdate(await window.api.checkForUpdates())
    } catch (err) {
      setCheckError(cleanError(err))
    }
  }

  const busy = update.status === 'checking' || update.status === 'downloading'
  const text = checkError ?? updateStatusText(update)

  return (
    <div className="mt-4 border-t pt-4">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={autoUpdate}
          onChange={(e) => updateSettings({ autoUpdate: e.target.checked })}
        />
        Automaticky hledat nové verze aplikace (při spuštění a každé 4 hodiny)
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-muted">Nainstalovaná verze {version || '…'}</span>
        <button
          onClick={() => void check()}
          disabled={busy || update.status === 'disabled'}
          className="rounded-[9px] border bg-surface-2 px-3.5 py-[7px] text-[13px] hover:brightness-110 disabled:opacity-50"
        >
          {update.status === 'checking' ? 'Hledám…' : 'Zkontrolovat aktualizace'}
        </button>
        {update.status === 'ready' && (
          <button
            onClick={() => void window.api.installUpdate()}
            className="rounded-[9px] bg-accent px-3.5 py-[7px] text-[13px] font-semibold text-white hover:brightness-110"
          >
            Restartovat a nainstalovat
          </button>
        )}
      </div>
      {text && (
        <p
          role="status"
          className={`mt-2 text-xs ${update.status === 'error' || checkError ? 'text-neg' : 'text-muted'}`}
        >
          {text}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Aplikace se při hledání dotazuje GitHubu na nové vydání; kromě čísla verze se nic neodesílá.
        Nová verze se stáhne na pozadí a nainstaluje po restartu. Data zůstanou nedotčená.
      </p>
    </div>
  )
}
