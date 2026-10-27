import Konva from 'konva'
import { pathSceneFunc } from '@/shapes'
import { patchListText } from '@/listText'
import { konvaGradientProps } from '@/gradient'
import { editedImage } from '@/imageRender'
import { shadowProps } from '@/shadowStyle'
import { strokeProps } from '@/strokeStyle'
import { decorationOf, displayText, letterSpacingOf, lineHeightOf } from '@/textStyle'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Nœud Konva de texte tel que dessiné à l'écran : mêmes propriétés partout (éditeur, export image, export PDF). */
export function createTextNode(e: TrameElement, extra: Konva.TextConfig = {}): Konva.Text {
  const node = new Konva.Text({
    ...extra,
    width: e.width,
    text: displayText(e),
    letterSpacing: letterSpacingOf(e),
    lineHeight: lineHeightOf(e),
    textDecoration: decorationOf(e),
    fontSize: e.fontSize,
    fontFamily: e.fontFamily,
    fontStyle: e.fontStyle,
    align: e.align,
    fill: e.fill,
    ...strokeProps(e),
    ...shadowProps(e),
    trameList: e.list
  })
  patchListText(node)
  return node
}

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = src
  })

/**
 * Nœud Konva d'un élément, tel que dessiné à l'écran (un seul endroit : rendu de la page, repli en image de l'export PDF).
 * `common` fixe position, rotation et opacité du nœud.
 */
export async function createNode(e: TrameElement, common: Konva.NodeConfig): Promise<Konva.Shape | null> {
  if (e.type === 'rect') {
    return new Konva.Rect({ ...common, ...strokeProps(e), ...shadowProps(e), width: e.width, height: e.height, fill: e.fill, ...konvaGradientProps(e.gradient, e.width, e.height), cornerRadius: e.cornerRadius })
  }
  if (e.type === 'ellipse') {
    return new Konva.Shape({
      ...common,
      ...strokeProps(e),
      ...shadowProps(e),
      width: e.width,
      height: e.height,
      fill: e.fill,
      ...konvaGradientProps(e.gradient, e.width, e.height),
      sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
        ctx.beginPath()
        ctx.ellipse(shape.width() / 2, shape.height() / 2, shape.width() / 2, shape.height() / 2, 0, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      }
    })
  }
  if (e.type === 'path' && e.path) {
    return new Konva.Shape({ ...common, ...strokeProps(e), ...shadowProps(e), width: e.width, height: e.height, fill: e.fill, trameGradient: e.gradient, sceneFunc: pathSceneFunc(e.path) })
  }
  if (e.type === 'image' && e.src) {
    return new Konva.Image({ ...common, ...strokeProps(e), ...shadowProps(e), width: e.width, height: e.height, image: await editedImage(e) })
  }
  if (e.type === 'text') return createTextNode(e, common)
  return null
}

/** Rend une page hors écran à pleine résolution, indépendamment de la page affichée dans l'éditeur. */
export async function renderPage(
  doc: Pick<TrameDocument, 'width' | 'height'>,
  page: TramePage,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  /** Si fourni, réduit le rendu pour que le grand côté fasse au plus `maxSize` pixels (miniatures). */
  maxSize?: number,
  /** `scale` : multiple de la taille du design (export en haute résolution) ; `quality` : JPEG, de 0 à 1 */
  options: { scale?: number; quality?: number } = {}
): Promise<string> {
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: doc.width, height: doc.height })
  const layer = new Konva.Layer()
  stage.add(layer)
  layer.add(new Konva.Rect({ width: doc.width, height: doc.height, fill: page.background }))

  for (const e of page.elements) {
    if (e.hidden) continue // un calque masqué n'est jamais exporté
    const node = await createNode(e, { x: e.x, y: e.y, rotation: e.rotation, opacity: e.opacity })
    if (node) layer.add(node)
  }

  layer.draw()
  const pixelRatio = maxSize ? Math.min(1, maxSize / Math.max(doc.width, doc.height)) : (options.scale ?? 1)
  const url = stage.toDataURL({ mimeType: type, quality: options.quality ?? 0.85, pixelRatio })
  stage.destroy()
  return url
}
