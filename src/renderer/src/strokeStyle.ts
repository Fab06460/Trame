import type { TrameElement } from '@/types'

export const STROKE_WIDTH = { min: 0, max: 100 }
export const DEFAULT_STROKE_COLOR = '#1e1f24'

type StrokeFields = Pick<TrameElement, 'stroke' | 'strokeWidth' | 'strokeDashed'>

/** Un contour n'existe que s'il a une couleur ET une épaisseur strictement positive. */
export const hasStroke = (el: Pick<TrameElement, 'stroke' | 'strokeWidth'>): boolean => !!el.stroke && (el.strokeWidth ?? 0) > 0

/** Tirets proportionnels à l'épaisseur (même motif dans l'éditeur et dans le PDF). */
export const dashPattern = (width: number): number[] => [width * 3, width * 2]

/**
 * Propriétés Konva du contour : `strokeEnabled: false` quand il n'y en a pas (un `stroke` résiduel sur un élément dont
 * l'épaisseur est nulle ne doit rien dessiner).
 */
export function strokeProps(el: StrokeFields): { stroke?: string; strokeWidth: number; strokeEnabled: boolean; dash?: number[] } {
  if (!hasStroke(el)) return { strokeWidth: 0, strokeEnabled: false }
  const width = el.strokeWidth as number
  return { stroke: el.stroke, strokeWidth: width, strokeEnabled: true, ...(el.strokeDashed ? { dash: dashPattern(width) } : {}) }
}

/** Nettoyage à la lecture d'un fichier : épaisseur bornée, couleur obligatoire, `strokeDashed` seulement si vrai. Modifie en place. */
export function sanitizeStroke(element: object): void {
  const e = element as Record<string, unknown>
  const w = e.strokeWidth
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0 || typeof e.stroke !== 'string' || !e.stroke.trim()) {
    delete e.stroke
    delete e.strokeWidth
    delete e.strokeDashed
    return
  }
  e.strokeWidth = Math.min(STROKE_WIDTH.max, w)
  if (e.strokeDashed !== true) delete e.strokeDashed
}

/**
 * Étire un chemin SVG (coordonnées dans un viewBox 100 × 100) de `sx` horizontalement et `sy` verticalement, **en modifiant les
 * coordonnées** plutôt qu'en étirant le dessin : le trait garde ainsi la même épaisseur partout.
 * Retourne null si le chemin contient une commande qu'on ne sait pas étirer sans le déformer (arcs `A`/`a`).
 * Les coordonnées relatives s'étirent de la même façon que les absolues (l'étirement est linéaire, sans translation).
 */
export function scalePath(d: string, sx: number, sy: number): string | null {
  const out: string[] = []
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens) return null
  let cmd = ''
  let args: number[] = []
  const flush = (): boolean => {
    if (!cmd) return true
    const up = cmd.toUpperCase()
    // nombre de valeurs par répétition de la commande, et axe de chacune (0 = x, 1 = y)
    const axes: Record<string, number[]> = { M: [0, 1], L: [0, 1], T: [0, 1], C: [0, 1, 0, 1, 0, 1], S: [0, 1, 0, 1], Q: [0, 1, 0, 1], H: [0], V: [1], Z: [] }
    const spec = axes[up]
    if (!spec) return false // arc ou commande inconnue
    if (up === 'Z') {
      out.push(cmd)
      return true
    }
    if (args.length === 0 || args.length % spec.length !== 0) return false
    out.push(cmd + args.map((v, i) => Number((v * (spec[i % spec.length] === 0 ? sx : sy)).toFixed(4))).join(' '))
    return true
  }
  for (const t of tokens) {
    if (/^[a-zA-Z]$/.test(t)) {
      if (!flush()) return null
      cmd = t
      args = []
    } else args.push(Number(t))
  }
  return flush() ? out.join(' ') : null
}
