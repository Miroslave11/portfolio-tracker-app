import { simulateGoal, type MonteCarloInput } from '../../core/monte-carlo'

/** Monte Carlo na pozadí, aby výpočet (~0,1 s) nezasekl okno při posouvání posuvníků. */
self.onmessage = (e: MessageEvent<{ id: number; input: MonteCarloInput }>) => {
  const { id, input } = e.data
  try {
    self.postMessage({ id, result: simulateGoal(input) })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
