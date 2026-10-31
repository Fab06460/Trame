import { createTextNode } from '@/exportPages'
import type { FitText } from '@/mailMerge'
import type { TrameElement } from '@/types'

/** Un texte ne rétrécit pas de plus de moitié : au-delà il vaut mieux passer à la ligne que devenir illisible. */
export const MIN_FIT = 0.5
const STEP = 0.04

/**
 * Taille de police qui garde au plus autant de lignes que le modèle : on réduit par petits pas jusqu'à ce que le texte rempli tienne
 * (ou que la limite soit atteinte). `lines` mesure le nombre de lignes d'un élément (par défaut la mise en page de Konva, la même
 * que celle de l'éditeur et des exports).
 */
export function fitText(template: TrameElement, filled: TrameElement, lines: (e: TrameElement) => number): TrameElement {
  const size = template.fontSize ?? 12
  const allowed = Math.max(1, lines(template))
  const at = (scale: number): TrameElement => ({ ...filled, fontSize: Math.round(size * scale * 10) / 10, ...(filled.letterSpacing ? { letterSpacing: filled.letterSpacing * scale } : {}) })
  if (lines(filled) <= allowed) return filled
  let scale = 1
  let current = filled
  while (scale > MIN_FIT && lines(current) > allowed) {
    scale = Math.max(MIN_FIT, scale - STEP)
    current = at(scale)
  }
  return current
}

const konvaLines = (e: TrameElement): number => createTextNode(e).textArr.length

/** `fitText` avec la mise en page réelle du texte : à donner à `mergeDocument`. */
export const fitToTemplate: FitText = (template, filled) => fitText(template, filled, konvaLines)
