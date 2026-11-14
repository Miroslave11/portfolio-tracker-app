import { useState } from 'react'
import { aiSchema, DEFAULT_OLLAMA_MODEL } from '../../../shared/settings'
import {
  AI_LENGTH_LABELS,
  AI_LENGTHS,
  AI_PART_LABELS,
  AI_PARTS,
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  AI_STYLE_LABELS,
  AI_STYLES,
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  type AiLength,
  type AiPart,
  type AiProvider,
  type AiStatusResult,
  type AiStyle
} from '../../../shared/ai'
import { cleanError } from '../errors'
import { useApp } from '../store'
import { Card } from './Card'
import { Segmented } from './Segmented'

const LENGTH_LABEL: Record<AiLength, string> = {
  short: `${AI_LENGTH_LABELS.short} · 1 odstavec`,
  medium: `${AI_LENGTH_LABELS.medium} · 2–3`,
  long: `${AI_LENGTH_LABELS.long} · 4–6`
}

/**
 * Nastavení → Umělá inteligence: volitelné psaní textů shrnutí. Píše buď Ollama na tomto počítači
 * (nic neopouští počítač), nebo Claude Code přes předplatné Claude (zadání jde Anthropicu).
 */
export function AiSettingsCard(): React.JSX.Element {
  const ai = useApp((s) => s.settings.ai)
  const updateSettings = useApp((s) => s.updateSettings)
  const [draft, setDraft] = useState(ai.model)
  const [modelError, setModelError] = useState<string | null>(null)
  const [status, setStatus] = useState<AiStatusResult | 'checking' | null>(null)
  const [claudeDraft, setClaudeDraft] = useState(ai.claudeModel)
  const [claudeModelError, setClaudeModelError] = useState<string | null>(null)
  const [pathDraft, setPathDraft] = useState(ai.claudePath)
  const claude = ai.provider === 'claudecode'

  const chooseProvider = (provider: AiProvider): void => {
    setStatus(null)
    void updateSettings({ ai: { ...ai, provider } })
  }

  const saveClaudeModel = (): void => {
    const parsed = aiSchema.shape.claudeModel.safeParse(claudeDraft)
    if (!parsed.success) {
      setClaudeModelError('Název modelu smí obsahovat jen písmena, číslice a znaky . _ : / -')
      return
    }
    setClaudeModelError(null)
    setClaudeDraft(parsed.data)
    if (parsed.data !== ai.claudeModel) {
      void updateSettings({ ai: { ...ai, claudeModel: parsed.data } })
    }
  }

  const saveClaudePath = (): void => {
    const parsed = aiSchema.shape.claudePath.safeParse(pathDraft)
    if (!parsed.success) return
    setPathDraft(parsed.data)
    if (parsed.data !== ai.claudePath) {
      setStatus(null)
      void updateSettings({ ai: { ...ai, claudePath: parsed.data } })
    }
  }

  const saveModel = (): void => {
    const parsed = aiSchema.shape.model.safeParse(draft)
    if (!parsed.success) {
      setModelError('Název modelu smí obsahovat jen písmena, číslice a znaky . _ : / -')
      return
    }
    setModelError(null)
    setDraft(parsed.data)
    if (parsed.data !== ai.model) void updateSettings({ ai: { ...ai, model: parsed.data } })
  }

  const toggleAiPart = (part: AiPart, checked: boolean): void => {
    const set = new Set(ai.parts)
    if (checked) set.add(part)
    else set.delete(part)
    void updateSettings({ ai: { ...ai, parts: AI_PARTS.filter((p) => set.has(p)) } })
  }

  const check = async (): Promise<void> => {
    setStatus('checking')
    try {
      setStatus(await window.api.aiStatus())
    } catch (err) {
      setStatus({ status: 'unavailable', message: cleanError(err) })
    }
  }

  const models = status && status !== 'checking' && status.status === 'ok' ? status.models : []
  const modelMissing =
    status && status !== 'checking' && status.status === 'ok'
      ? !models.some((m) => m === ai.model || m === `${ai.model}:latest`)
      : false

  return (
    <Card title="Umělá inteligence (volitelné)">
      <p className="mb-3 text-[13px] text-muted">
        Shrnutí portfolia fungují i bez AI (strohý text ze šablon). S modelem se text na Přehledu
        přeformuluje a v článcích na obrazovce Shrnutí napíše plynulejší V kostce, Komentář a
        Výhled. Všechna čísla počítá aplikace a každé číslo v textu od modelu se ověří – nesedí-li,
        ta část se zahodí a zůstane šablona.
      </p>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={ai.enabled}
          onChange={(e) => void updateSettings({ ai: { ...ai, enabled: e.target.checked } })}
        />
        Povolit psaní textů umělou inteligencí
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="w-40 text-muted">Kdo text píše</span>
        <Segmented<AiProvider>
          ariaLabel="Služba umělé inteligence"
          options={AI_PROVIDERS.map((p) => ({ value: p, label: AI_PROVIDER_LABELS[p] }))}
          value={ai.provider}
          onChange={chooseProvider}
        />
      </div>
      {claude ? (
        <>
          <p className="mt-3 text-xs text-muted">
            Použije se <strong>Claude Code</strong> nainstalovaný v tomto počítači a tvůj měsíční
            tarif Claude – bez API klíče a bez poplatků za tokeny. Tarif má limity využití; když se
            vyčerpají, aplikace to napíše a články zůstanou na šabloně. Pozor: fakta o portfoliu
            (částky, podíly, názvy ETF) se v zadání odesílají Anthropicu. Aplikace Claude Code API
            klíč nikdy nepředává a Claude Code přihlášený přes API klíč odmítne.
          </p>
          <div className="mt-3 grid gap-1">
            <label className="grid gap-1 text-xs text-muted">
              Model Claude
              <input
                value={claudeDraft}
                list="claude-models"
                onChange={(e) => setClaudeDraft(e.target.value)}
                onBlur={saveClaudeModel}
                onKeyDown={(e) => e.key === 'Enter' && saveClaudeModel()}
                placeholder={DEFAULT_CLAUDE_MODEL}
                aria-label="Model Claude"
                className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
              />
            </label>
            <datalist id="claude-models">
              {CLAUDE_MODELS.map(([id, label]) => (
                <option key={id} value={id} label={label} />
              ))}
            </datalist>
            {claudeModelError && <span className="text-xs text-neg">{claudeModelError}</span>}
          </div>
          <div className="mt-3 grid gap-1">
            <label className="grid gap-1 text-xs text-muted">
              Cesta ke claude.exe (prázdné = najít automaticky)
              <input
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                onBlur={saveClaudePath}
                onKeyDown={(e) => e.key === 'Enter' && saveClaudePath()}
                placeholder="C:\Users\…\.local\bin\claude.exe"
                aria-label="Cesta ke claude.exe"
                className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted">
            Nic se neposílá na internet, komunikuje se jen s Ollamou na tomto počítači (127.0.0.1).
          </p>
          <div className="mt-3 grid gap-1">
            <label className="grid gap-1 text-xs text-muted">
              Model v Ollamě
              <input
                value={draft}
                list="ai-models"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={saveModel}
                onKeyDown={(e) => e.key === 'Enter' && saveModel()}
                placeholder={DEFAULT_OLLAMA_MODEL}
                aria-label="Model v Ollamě"
                className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
              />
            </label>
            <datalist id="ai-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {modelError && <span className="text-xs text-neg">{modelError}</span>}
          </div>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void check()}
          disabled={status === 'checking'}
          className="rounded-[9px] border bg-surface-2 px-3.5 py-[7px] text-[13px] hover:brightness-110 disabled:opacity-50"
        >
          {status === 'checking'
            ? 'Zkouším…'
            : claude
              ? 'Zkontrolovat přihlášení'
              : 'Zkontrolovat připojení'}
        </button>
        {status && status !== 'checking' && status.status === 'ok' && (
          <span className="text-[13px] text-pos">
            {claude ? (
              <>Claude Code je přihlášený ({status.account ?? 'předplatné'})</>
            ) : (
              <>
                Ollama běží, modelů: {models.length}
                {models.length > 0 && ` (${models.join(', ')})`}
              </>
            )}
          </span>
        )}
        {status && status !== 'checking' && status.status === 'unavailable' && (
          <span className="text-[13px] text-neg">{status.message}</span>
        )}
      </div>
      {!claude && modelMissing && (
        <p className="mt-2 text-xs text-amber-500">
          Model „{ai.model}“ v Ollamě nevidím. Stáhneš ho příkazem{' '}
          <code>ollama pull {ai.model}</code>.
        </p>
      )}
      <div className="mt-5 border-t pt-4">
        <h4 className="mb-1 text-[13px] font-semibold">Texty článků na obrazovce Shrnutí</h4>
        <p className="mb-3 text-xs text-muted">
          Nový článek dostane text od AI automaticky po svém vytvoření, starší články tlačítkem
          „Napsat AI“ na obrazovce Shrnutí. Platí jen při zapnuté AI. Přes Claude psaní trvá desítky
          sekund, v Ollamě na pomalejším počítači i několik minut; kratší komentář je rychlejší.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <span className="w-40 text-muted">Co píše AI</span>
          {AI_PARTS.map((part) => (
            <label key={part} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={ai.parts.includes(part)}
                onChange={(e) => toggleAiPart(part, e.target.checked)}
              />
              {AI_PART_LABELS[part]}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="w-40 text-muted">Délka komentáře – měsíc</span>
          <Segmented<AiLength>
            ariaLabel="Délka komentáře u měsíčního článku"
            options={AI_LENGTHS.map((l) => ({ value: l, label: LENGTH_LABEL[l] }))}
            value={ai.monthLength}
            onChange={(monthLength) => void updateSettings({ ai: { ...ai, monthLength } })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="w-40 text-muted">Délka – kvartál, pololetí, rok</span>
          <Segmented<AiLength>
            ariaLabel="Délka komentáře u kvartálu, pololetí a roku"
            options={AI_LENGTHS.map((l) => ({ value: l, label: LENGTH_LABEL[l] }))}
            value={ai.periodLength}
            onChange={(periodLength) => void updateSettings({ ai: { ...ai, periodLength } })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="w-40 text-muted">Styl</span>
          <Segmented<AiStyle>
            ariaLabel="Styl textu"
            options={AI_STYLES.map((st) => ({ value: st, label: AI_STYLE_LABELS[st] }))}
            value={ai.style}
            onChange={(style) => void updateSettings({ ai: { ...ai, style } })}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        {claude ? (
          <>
            Claude Code se instaluje z claude.com/claude-code; přihlášení předplatným:{' '}
            <code>claude auth login</code>. Které modely tarif povolí, záleží na něm.
          </>
        ) : (
          <>
            Ollama je zdarma na ollama.com. Po instalaci stačí jednou stáhnout model, např.{' '}
            <code>ollama pull {DEFAULT_OLLAMA_MODEL}</code>.
          </>
        )}
      </p>
    </Card>
  )
}
