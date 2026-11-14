import { useEffect, useRef, useState } from 'react'
import { simulateGoal, type MonteCarloInput, type MonteCarloResult } from '../../core/monte-carlo'

const DEBOUNCE_MS = 200

type Reply = { id: number; result?: MonteCarloResult; error?: string }

/** Jeden sdílený Worker; když ho nejde spustit, počítá se přímo (o chvilku pomaleji). */
let worker: Worker | null | undefined
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./monteCarlo.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  return worker
}

let nextId = 1

/**
 * Spustí Monte Carlo simulaci na pozadí, kdykoli se změní vstupy (s krátkým zpožděním,
 * aby posouvání posuvníku nespouštělo desítky výpočtů). Do doběhnutí drží předchozí výsledek.
 */
export function useMonteCarlo(input: MonteCarloInput | null): {
  result: MonteCarloResult | null
  running: boolean
} {
  const [state, setState] = useState<{ key: string; result: MonteCarloResult } | null>(null)
  const latest = useRef(0)
  const key = input ? JSON.stringify(input) : ''

  useEffect(() => {
    if (!key) return
    const parsed = JSON.parse(key) as MonteCarloInput
    const id = nextId++
    latest.current = id
    let cleanup = (): void => {}
    const timer = setTimeout(() => {
      const w = getWorker()
      const done = (result: MonteCarloResult): void => {
        if (latest.current === id) setState({ key, result })
      }
      if (!w) {
        done(simulateGoal(parsed))
        return
      }
      const onMessage = (e: MessageEvent<Reply>): void => {
        if (e.data.id !== id) return
        w.removeEventListener('message', onMessage)
        if (e.data.result) done(e.data.result)
        else console.error('Monte Carlo selhalo:', e.data.error)
      }
      const onError = (): void => {
        // Worker nejde načíst (např. jiné prostředí) – spočítat přímo a dál ho nepoužívat.
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
        worker = null
        done(simulateGoal(parsed))
      }
      w.addEventListener('message', onMessage)
      w.addEventListener('error', onError)
      w.postMessage({ id, input: parsed })
      cleanup = () => {
        w.removeEventListener('message', onMessage)
        w.removeEventListener('error', onError)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      cleanup()
    }
  }, [key])

  if (!input) return { result: null, running: false }
  return { result: state?.result ?? null, running: state?.key !== key }
}
