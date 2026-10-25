import Konva from 'konva'
import { pathSceneFunc } from '@/shapes'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Nœud Konva de texte tel que dessiné à l'écran : mêmes propriétés partout (éditeur, export image, export PDF). */
export function createTextNode(e: TrameElement, extra: Konva.TextConfig = {}): Konva.Text {
  return new Konva.Text({
    ...extra,
    width: e.width,
    text: e.text,
    fontSize: e.fontSize,
    fontFamily: e.fontFamily,
    fontStyle: e.fontStyle,
    align: e.align,
    fill: e.fill
  })
}

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = src
  })

/** Rend une page hors écran à pleine résolution, indépendamment de la page affichée dans l'éditeur. */
export async function renderPage(
  doc: Pick<TrameDocument, 'width' | 'height'>,
  page: TramePage,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  /** Si fourni, réduit le rendu pour que le grand côté fasse au plus `maxSize` pixels (miniatures). */
  maxSize?: number
): Promise<string> {
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: doc.width, height: doc.height })
  const layer = new Konva.Layer()
  stage.add(layer)
  layer.add(new Konva.Rect({ width: doc.width, height: doc.height, fill: page.background }))

  for (const e of page.elements) {
    const common = { x: e.x, y: e.y, rotation: e.rotation, opacity: e.opacity }
    if (e.type === 'rect') {
      layer.add(new Konva.Rect({ ...common, width: e.width, height: e.height, fill: e.fill, cornerRadius: e.cornerRadius }))
    } else if (e.type === 'ellipse') {
      layer.add(
        new Konva.Shape({
          ...common,
          width: e.width,
          height: e.height,
          fill: e.fill,
          sceneFunc: (ctx, shape) => {
            ctx.beginPath()
            ctx.ellipse(shape.width() / 2, shape.height() / 2, shape.width() / 2, shape.height() / 2, 0, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fillShape(shape)
          }
        })
      )
    } else if (e.type === 'path' && e.path) {
      layer.add(new Konva.Shape({ ...common, width: e.width, height: e.height, fill: e.fill, sceneFunc: pathSceneFunc(e.path) }))
    } else if (e.type === 'image' && e.src) {
      layer.add(new Konva.Image({ ...common, width: e.width, height: e.height, image: await loadImage(e.src) }))
    } else if (e.type === 'text') {
      layer.add(createTextNode(e, common))
    }
  }

  layer.draw()
  const pixelRatio = maxSize ? Math.min(1, maxSize / Math.max(doc.width, doc.height)) : 1
  const url = stage.toDataURL({ mimeType: type, quality: 0.85, pixelRatio })
  stage.destroy()
  return url
}
