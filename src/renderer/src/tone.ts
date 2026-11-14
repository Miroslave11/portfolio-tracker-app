/** Třída barvy podle znaménka čísla (zelená / červená / bez barvy). */
export const toneClass = (n: number): string => (n > 0 ? 'text-pos' : n < 0 ? 'text-neg' : '')
