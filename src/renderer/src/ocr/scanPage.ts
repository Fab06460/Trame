import { recognizeLayout, type OcrProgress } from './engine'
import type { OcrLanguage } from './languages'
import { ocrScale } from './prepare'
import { paperAndInk, scanBlocks, toHex, type ScanBlock } from './scan'

export interface ReadBlock extends ScanBlock {
  /** couleur de l'encre, `#rrggbb` */
  ink: string
}

export interface ReadScan {
  /** paragraphes reconnus, en pixels de l'image donnée */
  blocks: ReadBlock[]
  /** l'image donnée dont l'emplacement de chaque paragraphe est effacé (rempli de la couleur du papier) */
  background: HTMLCanvasElement
}

/**
 * Lit une page scannée : reconnaît ses paragraphes (hors ligne), puis efface leur emplacement dans une copie de l'image pour que le texte
 * modifiable posé par-dessus ne se double pas de l'image. Les coordonnées rendues sont celles de `scan` (avant toute mise à l'échelle).
 */
export async function readScannedPage(scan: HTMLCanvasElement, lang: OcrLanguage, progress?: (p: OcrProgress) => void): Promise<ReadScan> {
  const s = ocrScale(scan.width, scan.height)
  let source = scan
  if (s !== 1) {
    source = document.createElement('canvas')
    source.width = Math.max(1, Math.round(scan.width * s))
    source.height = Math.max(1, Math.round(scan.height * s))
    const g = source.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(scan, 0, 0, source.width, source.height)
  }
  const found = scanBlocks(await recognizeLayout(source, lang, progress))

  const background = document.createElement('canvas')
  background.width = scan.width
  background.height = scan.height
  const out = background.getContext('2d')!
  out.drawImage(scan, 0, 0)
  const read = scan.getContext('2d', { willReadFrequently: true })!
  const blocks: ReadBlock[] = []
  for (const b of found) {
    const pad = Math.max(2, Math.round((b.fontSize / s) * 0.2))
    const x0 = Math.max(0, Math.floor(b.x0 / s) - pad)
    const y0 = Math.max(0, Math.floor(b.y0 / s) - pad)
    const x1 = Math.min(scan.width, Math.ceil(b.x1 / s) + pad)
    const y1 = Math.min(scan.height, Math.ceil(b.y1 / s) + pad)
    const w = x1 - x0
    const h = y1 - y0
    if (w <= 0 || h <= 0) continue
    const { paper, ink } = paperAndInk(read.getImageData(x0, y0, w, h).data, w, h)
    out.fillStyle = toHex(paper)
    out.fillRect(x0, y0, w, h)
    blocks.push({ ...b, x0: b.x0 / s, y0: b.y0 / s, x1: b.x1 / s, y1: b.y1 / s, baseline: b.baseline / s, fontSize: b.fontSize / s, ink: toHex(ink) })
  }
  return { blocks, background }
}
