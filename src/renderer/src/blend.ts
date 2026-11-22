import type { TrameElement } from '@/types'

/** Modes de fusion d'un élément avec ce qui est dessous : les seize modes standards (CSS, canvas, PDF et SVG les nomment pareil, à la casse près). */
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const
export type BlendMode = (typeof BLEND_MODES)[number]

const isMode = (v: unknown): v is BlendMode => typeof v === 'string' && (BLEND_MODES as readonly string[]).includes(v)

/** Le mode de fusion d'un élément (`normal` s'il n'en a pas). */
export const blendOf = (e: Pick<TrameElement, 'blend'>): BlendMode => (isMode(e.blend) ? e.blend : 'normal')

/** L'élément se fond-il avec le dessous autrement qu'en le recouvrant ? */
export const isBlended = (e: Pick<TrameElement, 'blend'>): boolean => blendOf(e) !== 'normal'

/** Valeur de `globalCompositeOperation` (canvas, Konva) ; `undefined` pour le mode normal. */
export const compositeOf = (e: Pick<TrameElement, 'blend'>): GlobalCompositeOperation | undefined => (isBlended(e) ? (blendOf(e) as GlobalCompositeOperation) : undefined)

/** Valeur de la propriété CSS `mix-blend-mode` ; `undefined` pour le mode normal. */
export const cssBlendOf = (e: Pick<TrameElement, 'blend'>): string | undefined => (isBlended(e) ? blendOf(e) : undefined)

/** Nom du mode dans un PDF (`/BM`). */
export const PDF_BLEND: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'ColorDodge',
  'color-burn': 'ColorBurn',
  'hard-light': 'HardLight',
  'soft-light': 'SoftLight',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity'
}

/** Nettoyage à la lecture d'un fichier : seul un mode connu, autre que normal, est gardé. Modifie l'élément en place. */
export function sanitizeBlend(element: object): void {
  const e = element as Record<string, unknown>
  if (!isMode(e.blend) || e.blend === 'normal') delete e.blend
}
