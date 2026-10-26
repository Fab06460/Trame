import type { TrameElement } from '@/types'

/** Bornes acceptées (à la saisie comme à la lecture d'un fichier). */
export const LETTER_SPACING = { min: -10, max: 100 }
export const LINE_HEIGHT = { min: 0.5, max: 4, default: 1 }

/** Texte tel qu'il s'affiche (et s'exporte) : mis en majuscules si demandé. La saisie, elle, n'est jamais modifiée. */
export const displayText = (el: Pick<TrameElement, 'text' | 'uppercase'>): string => (el.uppercase ? (el.text ?? '').toLocaleUpperCase('fr') : (el.text ?? ''))

export const letterSpacingOf = (el: Pick<TrameElement, 'letterSpacing'>): number => el.letterSpacing ?? 0
export const lineHeightOf = (el: Pick<TrameElement, 'lineHeight'>): number => el.lineHeight ?? LINE_HEIGHT.default

/** Valeur `textDecoration` de Konva (`'underline'`, `'line-through'`, les deux, ou chaîne vide). */
export function decorationOf(el: Pick<TrameElement, 'underline' | 'strike'>): string {
  return [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].filter(Boolean).join(' ')
}

/**
 * Géométrie du soulignement et du barré, **identique à celle de Konva** (rendu « non legacy ») pour que l'export PDF soit fidèle :
 * épaisseur = taille / 15 ; soulignement sous la ligne de base de round(taille / 4), barré au-dessus de la même quantité.
 */
export function decorationGeometry(fontSize: number): { thickness: number; underlineOffset: number; strikeOffset: number } {
  const q = Math.round(fontSize / 4)
  return { thickness: fontSize / 15, underlineOffset: q, strikeOffset: -q }
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Nettoie les champs de style d'un texte lus dans un fichier : bornes respectées, valeurs inattendues retirées
 * (un `underline: "oui"` ne souligne rien). Modifie l'élément en place.
 */
export function sanitizeTextStyle(element: object): void {
  const e = element as Record<string, unknown>
  const num = (k: 'letterSpacing' | 'lineHeight', min: number, max: number): void => {
    const v = e[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) delete e[k]
    else e[k] = clamp(v, min, max)
  }
  num('letterSpacing', LETTER_SPACING.min, LETTER_SPACING.max)
  num('lineHeight', LINE_HEIGHT.min, LINE_HEIGHT.max)
  for (const k of ['underline', 'strike', 'uppercase'] as const) if (e[k] !== true) delete e[k]
}
