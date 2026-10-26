/** Graduations des règles : calculs purs (la règle se dessine dans Rulers.tsx). */

/** Pas « agréables » (1, 2, 5, 10, 25, 50…) en pixels de design. */
const NICE = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]

export interface Tick {
  /** position en pixels de design */
  value: number
  /** graduation principale (avec libellé) */
  major: boolean
}

/**
 * Graduations visibles entre `from` et `to` (pixels de design) pour une échelle de `scale` pixels écran par pixel de design.
 * Le pas principal est le plus petit « agréable » qui laisse au moins `minMajorPx` pixels écran entre deux libellés ;
 * les graduations secondaires sont le cinquième de ce pas, et n'apparaissent que si elles restent lisibles (≥ 5 px).
 */
export function rulerTicks(from: number, to: number, scale: number, minMajorPx = 70): Tick[] {
  if (!(scale > 0) || to <= from) return []
  const step = NICE.find((n) => n * scale >= minMajorPx) ?? NICE[NICE.length - 1]
  const minor = step / 5
  const showMinor = minor * scale >= 5
  const unit = showMinor ? minor : step
  const ticks: Tick[] = []
  const first = Math.floor(from / unit) * unit
  // garde-fou : jamais plus de quelques centaines de graduations, quelle que soit l'échelle
  for (let v = first, n = 0; v <= to && n < 2000; v += unit, n++) {
    const value = Math.round(v * 1000) / 1000
    ticks.push({ value, major: Math.abs(value / step - Math.round(value / step)) < 1e-6 })
  }
  return ticks
}
