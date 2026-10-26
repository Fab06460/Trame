import { nanoid } from 'nanoid'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { groupLines, groupParagraphs, lineHeightOf, matchFont, type Paragraph, type PdfTextItem } from '@/pdfImport/layout'
import { MAX_SOURCE_CHARS } from '@/pdfSources'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Pixels de design par point PDF : l'éditeur travaille à 96 dpi, un PDF en points (72 par pouce). */
const PX_PER_PT = 96 / 72
/** Les images de fond sont rendues à cette résolution (× la taille de design) pour rester nettes en zoom et à l'export. */
const RESOLUTION = 2
/** Pas de fond plus grand que ça (côté, en pixels) : la mémoire d'un canvas est limitée. */
const MAX_RASTER = 4096
export const MAX_IMPORT_PAGES = 50

export type ImportMode = 'editable' | 'image'

export interface ImportOptions {
  mode: ImportMode
  /** nombre de pages à importer (les premières) */
  pages: number
  /** PDF d'origine : en mode « page en image », il est conservé dans le document pour que l'export redonne les pages en vectoriel */
  source?: Uint8Array
  onProgress?: (done: number, total: number) => void
}

export interface ImportReport {
  doc: TrameDocument
  /** textes reconstruits en éléments modifiables */
  texts: number
  /** polices du PDF remplacées par une police Trame voisine (noms, sans doublon) */
  substitutedFonts: string[]
  /** paragraphes laissés dans l'image de fond (texte que pdf.js n'a pas pu séparer du dessin) */
  keptAsImage: number
  /** le PDF d'origine est trop volumineux pour être conservé : l'export utilisera l'image de fond */
  sourceDropped: boolean
}

const toBase64 = (bytes: Uint8Array): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(new Blob([bytes as BlobPart]))
  })

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, fontExtraProperties: true }).promise
}

const newCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/**
 * Dessine la page dans un canvas. Sans `withText`, le texte en transformation « droite » (non pivoté, non miroité) n'est pas tracé :
 * pdf.js écrit chaque glyphe par `fillText`, on le neutralise sur cette instance seulement. Le texte pivoté reste dans l'image.
 */
async function paint(page: PDFPageProxy, scale: number, withText: boolean): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = newCanvas(viewport.width, viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  if (!withText) {
    const original = ctx.fillText.bind(ctx)
    ctx.fillText = (...args: Parameters<CanvasRenderingContext2D['fillText']>): void => {
      const m = ctx.getTransform()
      if (Math.abs(m.b) < 1e-3 && Math.abs(m.c) < 1e-3 && m.a > 0) return
      original(...args)
    }
    ctx.strokeText = (): void => {}
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, canvas, viewport }).promise
  return canvas
}

async function textItems(page: PDFPageProxy, scale: number, offset: { x: number; y: number }): Promise<PdfTextItem[]> {
  const viewport = page.getViewport({ scale })
  const content = await page.getTextContent()
  const out: PdfTextItem[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform)
    // seul le texte horizontal est reconstruit : le texte pivoté ou miroité reste dans l'image de fond
    if (a <= 0 || Math.abs(b) > 0.02 * a || Math.abs(c) > 0.35 * Math.abs(d)) continue
    const size = Math.hypot(c, d)
    if (size < 4) continue
    let font = item.fontName
    try {
      font = (page.commonObjs.get(item.fontName) as { name?: string } | undefined)?.name ?? (content.styles[item.fontName]?.fontFamily as string) ?? font
    } catch {
      font = (content.styles[item.fontName]?.fontFamily as string) ?? font
    }
    out.push({ text: item.str, x: e + offset.x, baseline: f + offset.y, width: item.width * viewport.scale, size, font })
  }
  return out
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Pixels de `canvas` dans `r` (en pixels de design × RESOLUTION), échantillonnés au plus ~3 000 fois. */
function samples(canvas: HTMLCanvasElement, r: Rect, k: number): Uint8ClampedArray[] {
  const x0 = Math.max(0, Math.floor(r.x0 * k)), y0 = Math.max(0, Math.floor(r.y0 * k))
  const x1 = Math.min(canvas.width, Math.ceil(r.x1 * k)), y1 = Math.min(canvas.height, Math.ceil(r.y1 * k))
  const w = x1 - x0, h = y1 - y0
  if (w <= 0 || h <= 0) return []
  const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, w, h).data
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 3000)))
  const out: Uint8ClampedArray[] = []
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) out.push(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4))
  return out
}

const hex = (c: number[]): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
const dist = (p: ArrayLike<number>, q: number[]): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/**
 * Couleur du texte d'un paragraphe : on compare l'image avec texte (A) à l'image sans texte (B) sur sa boîte.
 * Retourne null si le texte n'a pas disparu de B (dessiné autrement que par `fillText` : il resterait en double).
 */
function inkOf(withText: HTMLCanvasElement, without: HTMLCanvasElement, r: Rect, k: number): string | null {
  const a = samples(withText, r, k)
  const b = samples(without, r, k)
  if (!a.length || a.length !== b.length) return null
  const bg = [0, 1, 2].map((i) => b.reduce((s, p) => s + p[i], 0) / b.length)
  const changed = a.filter((p, i) => Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2]) > 90)
  if (changed.length < Math.max(2, a.length * 0.01)) return null
  const far = [...changed].sort((p, q) => dist(q, bg) - dist(p, bg)).slice(0, Math.max(1, Math.ceil(changed.length / 10)))
  return hex([0, 1, 2].map((i) => far.reduce((s, p) => s + p[i], 0) / far.length))
}

const LIGATURES: Record<string, string> = { 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl', ' ': ' ' }
const cleanText = (s: string): string => s.replace(/[ﬁﬂﬀﬃﬄ ]/g, (c) => LIGATURES[c] ?? c)

function toElement(p: Paragraph, color: string, measure: CanvasRenderingContext2D): { el: TrameElement; font: ReturnType<typeof matchFont>; pdfFont: string } {
  const first = p.lines[0]
  const font = matchFont(first.font)
  const size = Math.round(first.size * 10) / 10
  measure.font = `${font.fontStyle === 'normal' ? '' : font.fontStyle} ${size}px ${font.family}`
  const metrics = measure.measureText('M')
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
  const lh = lineHeightOf(p)
  const texts = p.lines.map((l) => cleanText(l.text))
  // largeur : jamais plus étroite que le texte d'origine NI que le même texte dans notre police (sinon retour à la ligne indésirable)
  const widest = Math.max(...p.lines.map((l) => l.width), ...texts.map((t) => measure.measureText(t).width))
  const width = Math.ceil(widest) + 4
  const anchor = p.align === 'left' ? first.x : p.align === 'center' ? first.x + first.width / 2 - width / 2 : first.x + first.width - width
  const el = {
    id: nanoid(8),
    type: 'text',
    x: anchor,
    y: first.baseline - ((ascent - descent) / 2 + (lh * size) / 2),
    width,
    height: lh * size * p.lines.length,
    rotation: 0,
    opacity: 1,
    fill: color,
    text: texts.join('\n'),
    fontSize: size,
    fontFamily: font.family,
    fontStyle: font.fontStyle,
    align: p.align,
    ...(lh !== 1 ? { lineHeight: lh } : {})
  } as TrameElement
  return { el, font, pdfFont: first.font.replace(/^[A-Z]{6}\+/, '') }
}

/** Importe un PDF en document Trame : une page Trame par page PDF, la première donne le format. */
export async function importPdf(pdf: PDFDocumentProxy, name: string, options: ImportOptions): Promise<ImportReport> {
  const total = Math.min(pdf.numPages, options.pages, MAX_IMPORT_PAGES)
  const first = (await pdf.getPage(1)).getViewport({ scale: PX_PER_PT })
  const width = Math.round(first.width)
  const height = Math.round(first.height)
  const measure = document.createElement('canvas').getContext('2d')!
  const substituted = new Set<string>()
  let texts = 0
  let kept = 0
  const pages: TramePage[] = []
  // conservation du PDF d'origine (annotation vectorielle) : seulement en mode « page en image », où le fond contient déjà le texte
  const sourceId = nanoid(8)
  let sourceData: string | null = null
  let sourceDropped = false
  if (options.mode === 'image' && options.source) {
    sourceData = await toBase64(options.source)
    if (sourceData.length > MAX_SOURCE_CHARS) {
      sourceData = null
      sourceDropped = true
    }
  }

  for (let n = 1; n <= total; n++) {
    options.onProgress?.(n - 1, total)
    const page = await pdf.getPage(n)
    // une page de format différent est ajustée (sans déformation) et centrée dans le format du document
    const natural = page.getViewport({ scale: PX_PER_PT })
    const fit = Math.min(width / natural.width, height / natural.height)
    const scale = PX_PER_PT * fit
    const view = page.getViewport({ scale })
    const offset = { x: (width - view.width) / 2, y: (height - view.height) / 2 }
    const k = Math.min(RESOLUTION, MAX_RASTER / Math.max(view.width, view.height))

    const elements: TrameElement[] = []
    let background: HTMLCanvasElement
    if (options.mode === 'editable') {
      const withText = await paint(page, scale * k, true)
      background = await paint(page, scale * k, false)
      const paragraphs = groupParagraphs(groupLines(await textItems(page, scale, offset)))
      let erased = false
      for (const p of paragraphs) {
        const rect: Rect = {
          x0: Math.min(...p.lines.map((l) => l.x)) - offset.x,
          x1: Math.max(...p.lines.map((l) => l.x + l.width)) - offset.x,
          y0: p.lines[0].baseline - offset.y - p.lines[0].size * 0.9,
          y1: p.lines[p.lines.length - 1].baseline - offset.y + p.lines[0].size * 0.25
        }
        const color = inkOf(withText, background, rect, k)
        if (!color) { kept += 1; continue }
        const { el, font, pdfFont } = toElement(p, color, measure)
        if (!font.exact) substituted.add(pdfFont)
        elements.push(el)
        texts += 1
        erased = true
      }
      // aucun texte réellement séparé : le fond avec texte est plus fidèle que le fond « effacé » (qui aurait perdu du texte laissé tel quel)
      if (!erased) background = withText
    } else {
      background = await paint(page, scale * k, true)
    }
    elements.unshift({
      id: nanoid(8),
      type: 'image',
      x: offset.x,
      y: offset.y,
      width: view.width,
      height: view.height,
      rotation: 0,
      opacity: 1,
      fill: '#000000',
      src: background.toDataURL('image/png'),
      locked: true,
      name: `Page PDF ${n}`,
      ...(sourceData ? { pdfSource: { id: sourceId, page: n } } : {})
    } as TrameElement)
    pages.push({ id: nanoid(8), background: '#ffffff', elements })
    page.cleanup()
  }
  options.onProgress?.(total, total)
  const doc: TrameDocument = { version: 2, name, width, height, pages, ...(sourceData ? { sources: { [sourceId]: sourceData } } : {}) }
  return { doc, texts, substitutedFonts: [...substituted].sort(), keptAsImage: kept, sourceDropped }
}
