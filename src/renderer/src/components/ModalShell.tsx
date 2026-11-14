import { useEffect } from 'react'

interface Props {
  label: string
  /** Šířka okna v px. */
  width?: number
  busy?: boolean
  onClose(): void
  children: React.ReactNode
}

/** Společný rámec oken: ztmavený podklad, Esc a klik mimo okno zavírají (pokud se zrovna neukládá). */
export function ModalShell({
  label,
  width = 560,
  busy = false,
  onClose,
  children
}: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ width }}
        className="flex max-h-full max-w-full flex-col rounded-2xl border bg-surface p-[22px] shadow-2xl"
      >
        {children}
      </div>
    </div>
  )
}
