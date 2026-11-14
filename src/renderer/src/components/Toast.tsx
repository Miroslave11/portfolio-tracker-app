import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useApp } from '../store'

const VISIBLE_MS = 6000

/** Krátká zpráva dole uprostřed (po uložení / smazání); sama zmizí. */
export function Toast(): React.JSX.Element {
  const notice = useApp((s) => s.notice)
  const tone = useApp((s) => s.noticeTone)
  const showNotice = useApp((s) => s.showNotice)

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => showNotice(null), VISIBLE_MS)
    return () => clearTimeout(id)
  }, [notice, showNotice])

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice}
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 left-1/2 z-[60] flex max-w-[640px] -translate-x-1/2 items-center gap-2.5 rounded-xl border bg-surface px-4 py-3 text-[13px] shadow-2xl"
        >
          {tone === 'error' ? (
            <AlertCircle size={16} className="shrink-0 text-neg" />
          ) : (
            <CheckCircle2 size={16} className="shrink-0 text-pos" />
          )}
          <span>{notice}</span>
          <button
            onClick={() => showNotice(null)}
            aria-label="Zavřít zprávu"
            className="ml-1 text-muted hover:text-fg"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
