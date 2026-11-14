import { z } from 'zod'

/** Typ sloupce určuje formát v CSV i v Excelu (číslo zůstává číslem, datum datem). */
export const COLUMN_TYPES = ['text', 'date', 'number', 'integer', 'money', 'percent'] as const
export type ColumnType = (typeof COLUMN_TYPES)[number]

export const exportColumnSchema = z.object({
  label: z.string().min(1).max(80),
  type: z.enum(COLUMN_TYPES)
})

const cell = z.union([z.string().max(2000), z.number().finite(), z.null()])

/** Jedna tabulka (list Excelu / jeden CSV soubor). */
export const exportTableSchema = z
  .object({
    /** Název listu: Excel nepovoluje \ / ? * [ ] : a víc než 31 znaků. */
    name: z
      .string()
      .min(1)
      .max(31)
      .regex(/^[^\\/?*[\]:]+$/),
    columns: z.array(exportColumnSchema).min(1).max(60),
    rows: z.array(z.array(cell)).max(100_000)
  })
  .refine((t) => t.rows.every((r) => r.length === t.columns.length), {
    message: 'Řádek tabulky nemá stejný počet buněk jako sloupců'
  })
export type ExportTable = z.infer<typeof exportTableSchema>
export type ExportCell = string | number | null

const fileName = z.string().min(1).max(120)

/** Požadavek na export; cestu k souboru vždy volí main proces (dialog uložení). */
export const exportRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('csv'), fileName, table: exportTableSchema }),
  z.object({
    kind: z.literal('xlsx'),
    fileName,
    sheets: z.array(exportTableSchema).min(1).max(12)
  }),
  /** HTML se vykreslí v neviditelném okně bez skriptů a uloží jako PDF. */
  z.object({ kind: z.literal('pdf'), fileName, html: z.string().min(1).max(4_000_000) }),
  z.object({ kind: z.literal('backup') })
])
export type ExportRequest = z.infer<typeof exportRequestSchema>

export type ExportResult =
  { status: 'saved'; path: string } | { status: 'canceled' } | { status: 'error'; message: string }

/** Název souboru bez znaků, které Windows nepovoluje; prázdný název se nahradí výchozím. */
export function sanitizeFileName(name: string, fallback = 'export'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 100)
  return cleaned || fallback
}
