/** Odstraní technický prefix, který Electron přidává k chybám z hlavního procesu. */
export function cleanError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
