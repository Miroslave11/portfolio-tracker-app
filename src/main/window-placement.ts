export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Umístění okna na střed pracovní plochy zvoleného displeje (bez hlavního panelu).
 * Okno se zmenší, když by se na displej nevešlo (např. malý displej notebooku), ale nikdy
 * nepřesáhne okraje pracovní plochy.
 */
export function centerOnWorkArea(workArea: Rect, desired: { width: number; height: number }): Rect {
  const width = Math.max(1, Math.min(desired.width, workArea.width))
  const height = Math.max(1, Math.min(desired.height, workArea.height))
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  }
}
