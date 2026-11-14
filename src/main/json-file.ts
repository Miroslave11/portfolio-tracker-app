import { rename, writeFile } from 'fs/promises'

/** Atomický zápis: nejdřív dočasný soubor, pak přejmenování (nepoškodí data při pádu). */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, path)
}
