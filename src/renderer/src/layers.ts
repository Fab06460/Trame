import type { TrameElement } from '@/types'
import { t } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

const TYPE_LABEL: Record<TrameElement['type'], MessageKey> = {
  rect: 'layer.type.rect',
  ellipse: 'layer.type.ellipse',
  text: 'layer.type.text',
  image: 'layer.type.image',
  path: 'layer.type.path'
}

const MAX_LABEL = 28

/** Nom affiché dans le panneau Calques : le nom choisi, sinon le début du texte, sinon le type de l'élément. */
export function layerLabel(el: Pick<TrameElement, 'type' | 'name' | 'text'>): string {
  const custom = el.name?.trim()
  if (custom) return custom
  if (el.type === 'text') {
    const flat = (el.text ?? '').replace(/\s+/g, ' ').trim()
    if (flat) return flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1)}…` : flat
  }
  return t(TYPE_LABEL[el.type])
}

/**
 * Le panneau liste les calques du plus haut au plus bas, alors que le tableau est dans l'ordre de superposition (dernier = devant).
 * Convertit la position visée dans la liste affichée (0 = ligne du haut) en indice dans le tableau.
 */
export const displayToIndex = (displayIndex: number, count: number): number => count - 1 - displayIndex

/**
 * Indice de destination dans le tableau quand on lâche le calque `fromId` sur la ligne `overDisplay` (indice affiché) :
 * il prend la place de la ligne visée.
 */
export function dropIndex(elements: Array<{ id: string }>, fromId: string, overDisplay: number): number | null {
  const from = elements.findIndex((e) => e.id === fromId)
  if (from < 0) return null
  const target = displayToIndex(overDisplay, elements.length)
  return target === from ? null : target
}
