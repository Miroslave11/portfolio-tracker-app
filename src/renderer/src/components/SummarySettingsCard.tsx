import { useState } from 'react'
import {
  kindSections,
  LEVEL_LABELS,
  levelOf,
  levelSections,
  SECTION_LABELS,
  SUMMARY_KINDS,
  SUMMARY_LEVELS,
  type SummaryKind,
  type SummaryLevel,
  type SummarySection
} from '../../../shared/summary'
import { useApp } from '../store'
import { Card } from './Card'
import { Segmented } from './Segmented'

const KIND_TABS: Record<SummaryKind, string> = {
  month: 'Měsíc',
  quarter: 'Kvartál',
  half: 'Pololetí',
  year: 'Rok'
}

/** Nastavení → Shrnutí portfolia: rozsah a sekce pro každý typ období, automatické vytváření. */
export function SummarySettingsCard(): React.JSX.Element {
  const summary = useApp((s) => s.settings.summary)
  const updateSettings = useApp((s) => s.updateSettings)
  const [kind, setKind] = useState<SummaryKind>('month')
  const available = kindSections(kind)
  const sections = summary[kind].sections
  const level = levelOf(sections, kind)

  const save = (next: readonly SummarySection[]): void => {
    // Pořadí sekcí drží vždy pořadí v článku; ukládají se jen sekce platné pro typ období.
    const set = new Set(next)
    void updateSettings({
      summary: { ...summary, [kind]: { sections: available.filter((s) => set.has(s)) } }
    })
  }

  const toggle = (section: SummarySection, checked: boolean): void =>
    save(checked ? [...sections, section] : sections.filter((s) => s !== section))

  const toggleAuto = (k: SummaryKind, checked: boolean): void => {
    const set = new Set(summary.auto)
    if (checked) set.add(k)
    else set.delete(k)
    void updateSettings({ summary: { ...summary, auto: SUMMARY_KINDS.filter((x) => set.has(x)) } })
  }

  const options = [
    ...SUMMARY_LEVELS.map((l) => ({ value: l as SummaryLevel | 'custom', label: LEVEL_LABELS[l] })),
    ...(level === 'custom' ? [{ value: 'custom' as const, label: LEVEL_LABELS.custom }] : [])
  ]

  return (
    <Card title="Shrnutí portfolia">
      <p className="mb-3 text-[13px] text-muted">
        Co obsahují články na obrazovce Shrnutí. Změna se projeví hned u všech článků; „V kostce“ a
        hlavní čísla jsou vždy.
      </p>

      <div className="flex flex-wrap items-start gap-3">
        <span className="w-40 pt-0.5 text-[13px] text-muted">Vytvářet</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
          {SUMMARY_KINDS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={summary.auto.includes(k)}
                onChange={(e) => toggleAuto(k, e.target.checked)}
              />
              {KIND_TABS[k]}
            </label>
          ))}
          <span className="w-full text-xs text-muted">
            Samy po skončení období a tlačítkem „Vytvořit zpětně“. Už vytvořené články zůstávají.
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="w-40 text-[13px] text-muted">Rozsah článku za</span>
        <Segmented<SummaryKind>
          ariaLabel="Typ období"
          options={SUMMARY_KINDS.map((k) => ({ value: k, label: KIND_TABS[k] }))}
          value={kind}
          onChange={setKind}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="w-40" />
        <Segmented<SummaryLevel | 'custom'>
          ariaLabel="Rozsah článku"
          options={options}
          value={level}
          onChange={(v) => v !== 'custom' && save(levelSections(v, kind))}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <span className="w-40 pt-0.5 text-[13px] text-muted">Sekce</span>
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-2 text-[13px]">
          {(['V kostce', 'Hlavní čísla'] as const).map((label) => (
            <label key={label} className="flex items-center gap-2 text-muted">
              <input type="checkbox" className="size-4" checked disabled />
              {label} <span className="text-[11px]">(vždy)</span>
            </label>
          ))}
          {available.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={sections.includes(s)}
                onChange={(e) => toggle(s, e.target.checked)}
              />
              {SECTION_LABELS[s]}
            </label>
          ))}
        </div>
      </div>
    </Card>
  )
}
