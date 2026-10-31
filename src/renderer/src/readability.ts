import type { TrameElement } from '@/types'

/** Interlettrage ajouté (en fraction de la taille) : de quoi aérer sans disperser les mots. */
export const EASY_LETTER_SPACING = 0.05
/** Interligne minimal d'un texte en lecture facilitée. */
export const EASY_LINE_HEIGHT = 1.5

/**
 * Réglages d'un texte en « lecture facilitée » : police pensée pour la lisibilité, pas d'italique ni de majuscules forcées (les mots
 * perdent leur silhouette), interligne d'au moins 1,5 et interlettrage légèrement augmenté. Seul ce qui change est rendu ; null si le
 * texte est déjà conforme. Un interligne ou un interlettrage déjà plus généreux est conservé.
 */
export function easyReadingPatch(e: TrameElement, fontFamily: string): Partial<TrameElement> | null {
  if (e.type !== 'text') return null
  const patch: Partial<TrameElement> = {}
  if (e.fontFamily !== fontFamily) patch.fontFamily = fontFamily
  const style = e.fontStyle?.includes('bold') ? 'bold' : 'normal'
  if (e.fontStyle !== undefined && e.fontStyle !== style) patch.fontStyle = style
  if ((e.lineHeight ?? 1) < EASY_LINE_HEIGHT) patch.lineHeight = EASY_LINE_HEIGHT
  const spacing = Math.round((e.fontSize ?? 12) * EASY_LETTER_SPACING * 10) / 10
  if ((e.letterSpacing ?? 0) < spacing) patch.letterSpacing = spacing
  if (e.uppercase) patch.uppercase = undefined
  return Object.keys(patch).length ? patch : null
}

/** Simulations de la vision des couleurs (matrices de Machado et al., sévérité maximale) : l'achromatopsie est un simple passage au gris. */
export type ColorVision = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'

export const COLOR_VISIONS: ColorVision[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']

const MATRICES: Record<Exclude<ColorVision, 'none'>, string> = {
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
  achromatopsia: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0'
}

export const colorVisionMatrix = (v: Exclude<ColorVision, 'none'>): string => MATRICES[v]

/** Valeur CSS `filter` d'une simulation (référence le filtre SVG de même nom, voir `ColorVisionFilters`). */
export const colorVisionFilter = (v: ColorVision): string | undefined => (v === 'none' ? undefined : `url(#trame-cv-${v})`)
