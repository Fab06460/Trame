/** Une position du pointeur laser (coordonnées de la fenêtre) et l'instant où elle a été relevée (ms). */
export interface TrailPoint {
  x: number
  y: number
  t: number
}

/** Durée de vie d'un point de la traînée. */
export const TRAIL_MS = 350
/** Deux relevés plus proches que cela (en pixels) ne font qu'un : la traînée reste légère. */
const MIN_STEP = 2
/** Plafond de points conservés (une souris très rapide ne doit pas faire grossir le tracé sans limite). */
const MAX_POINTS = 64

/** Ajoute un relevé à la traînée et retire les points trop anciens. Ne modifie pas le tableau reçu. */
export function pushTrail(trail: readonly TrailPoint[], p: TrailPoint, life = TRAIL_MS): TrailPoint[] {
  const alive = trail.filter((q) => p.t - q.t < life)
  const last = alive[alive.length - 1]
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) alive[alive.length - 1] = p
  else alive.push(p)
  return alive.slice(-MAX_POINTS)
}

/** Opacité (0 à 1) d'un point de la traînée à l'instant `now` : pleine au relevé, nulle au bout de la durée de vie. */
export const trailAlpha = (p: TrailPoint, now: number, life = TRAIL_MS): number => Math.max(0, Math.min(1, 1 - (now - p.t) / life))
