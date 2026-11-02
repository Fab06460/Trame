import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Miniature (JPEG) de la page n° `index` (à partir de 0), de `width` pixels de large. La rotation propre à la page est déjà appliquée. */
export async function pdfThumb(doc: PDFDocumentProxy, index: number, width = 160): Promise<string> {
  const page = await doc.getPage(index + 1)
  const natural = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / natural.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, canvas, viewport }).promise
  page.cleanup()
  return canvas.toDataURL('image/jpeg', 0.7)
}
