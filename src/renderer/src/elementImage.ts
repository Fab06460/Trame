import Konva from 'konva'
import { createNode, createTextNode } from '@/exportPages'
import { boundsOf } from '@/geometry'
import { shadowMargin } from '@/shadowStyle'
import type { TrameElement } from '@/types'

/** Résolution (× la taille du design) des rendus en image de repli, pour rester nets en zoom. */
export const FALLBACK_PIXEL_RATIO = 3

export interface ElementImage {
  /** PNG (data URL) */
  url: string
  /** emplacement en pixels de design, dans les axes de la page */
  x: number
  y: number
  w: number
  h: number
}

/**
 * Rend l'élément hors écran, **dans les axes de la page** : boîte englobante (rotation comprise) agrandie d'une marge, nœud à sa
 * vraie position et rotation. Konva garde le décalage d'une ombre dans les axes de la page même quand l'élément pivote : on ne
 * peut donc pas rendre l'élément « à plat » puis le faire pivoter ensuite.
 * `mode: 'shadow'` ne garde que l'ombre (le corps de l'élément est effacé : le vrai élément vectoriel sera peint par-dessus).
 * Partagé par les replis en image des exports PDF et PPTX.
 */
export async function renderElementImage(el: TrameElement, mode: 'full' | 'shadow'): Promise<ElementImage | null> {
  // un texte n'a pas de hauteur enregistrée fiable : on mesure celle de Konva
  const height = el.type === 'text' ? createTextNode(el).height() : el.height
  const box = boundsOf({ ...el, height })
  // marge : jambages et italiques (texte), moitié du contour, ombre
  const m = Math.ceil(Math.max((el.fontSize ?? 0) * 0.35, (el.strokeWidth ?? 0) / 2 + 2)) + shadowMargin(el)
  const x = box.x - m
  const y = box.y - m
  const w = Math.ceil(box.width + 2 * m)
  const h = Math.ceil(box.height + 2 * m)
  const common = { x: el.x - x, y: el.y - y, rotation: el.rotation }
  const stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h })
  const layer = new Konva.Layer()
  stage.add(layer)
  if (mode === 'full') {
    // à sa VRAIE opacité : c'est Konva qui compose fond, contour et ombre, avec ses règles (par ex. l'ombre reste visible à travers
    // un corps translucide) ; l'image obtenue est ensuite posée telle quelle, sans seconde opacité
    const node = await createNode(el, { ...common, opacity: el.opacity })
    if (!node) return null
    layer.add(node)
  } else {
    // à la vraie opacité de l'élément, comme dans Konva : l'ombre s'y atténue comme l'élément, et l'effacement du corps (à la même
    // opacité) laisse sous un corps translucide la part d'ombre que Konva y laisserait voir
    const withShadow = await createNode(el, { ...common, opacity: el.opacity })
    // le corps est effacé (composition « destination-out ») : il ne reste que l'ombre qui déborde
    const body = await createNode({ ...el, shadow: undefined }, { ...common, opacity: el.opacity, globalCompositeOperation: 'destination-out' })
    if (!withShadow || !body) return null
    layer.add(withShadow)
    layer.add(body)
  }
  layer.draw()
  // une ombre nette (flou faible) demande plus de pixels qu'une ombre floue
  const ratio = mode === 'shadow' && (el.shadow?.blur ?? 0) >= 6 ? 2 : FALLBACK_PIXEL_RATIO
  const url = stage.toDataURL({ mimeType: 'image/png', pixelRatio: ratio })
  stage.destroy()
  return { url, x, y, w, h }
}
