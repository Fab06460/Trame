import Konva from 'konva'
import { PDFDocument } from 'pdf-lib'
import { pathSceneFunc } from '@/shapes'
import type { TrameDocument, TramePage } from '@/types'

const loadImage = (src: string): Promise<HTMLImageElement> =>
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
  type: 'image/png' | 'image/jpeg' = 'image/png'
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
      layer.add(
        new Konva.Text({
          ...common,
          width: e.width,
          text: e.text,
          fontSize: e.fontSize,
          fontFamily: e.fontFamily,
          fontStyle: e.fontStyle,
          align: e.align,
          fill: e.fill
        })
      )
    }
  }

  layer.draw()
  const url = stage.toDataURL({ mimeType: type, quality: 0.92, pixelRatio: 1 })
  stage.destroy()
  return url
}

/** Assemble toutes les pages dans un PDF (une image par page, taille de page = taille du design à 96 dpi). */
export async function exportPdf(doc: TrameDocument): Promise<string> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(doc.name)
  pdf.setCreator('Trame')
  const w = doc.width * 0.75 // px CSS → points PDF
  const h = doc.height * 0.75
  for (const page of doc.pages) {
    const png = await renderPage(doc, page, 'image/png')
    const img = await pdf.embedPng(png)
    const p = pdf.addPage([w, h])
    p.drawImage(img, { x: 0, y: 0, width: w, height: h })
  }
  return 'data:application/pdf;base64,' + (await pdf.saveAsBase64())
}
