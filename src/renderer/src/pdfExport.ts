import Konva from 'konva'
import { fontkit, type FontkitFont } from '@/fontkit'
import {
  PDFArray, PDFDocument, PDFFont, PDFHexString, PDFImage, PDFNumber, PDFOperator, PDFOperatorNames, PDFPage,
  beginText, concatTransformationMatrix, endText, moveText, popGraphicsState, pushGraphicsState, rgb,
  setFillingColor, setFontAndSize, setGraphicsState
} from 'pdf-lib'
import { createTextNode, loadImage } from '@/exportPages'
import {
  PT_PER_PX, baselineY, decodeDataUrl, ellipsePath, elementMatrix, lineOffsetX, parseColor, roundedRectPath, tjAdjustment
} from '@/pdfMath'
import { diagnoseFont, loadFontBytes, type FontChoice } from '@/pdfFonts'
import { checkText, type TextIssue } from '@/pdfTextCheck'
import type { PdfFallback } from '@/pdfFallbacks'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Résolution (× la taille du design) des rendus en image de repli, pour rester nets en zoom. */
const FALLBACK_PIXEL_RATIO = 3

interface LoadedFont {
  pdfFont: PDFFont
  layout: FontkitFont
}

/**
 * Export PDF **vectoriel** : fonds, formes et textes sont de vrais objets PDF (texte sélectionnable, net à tout zoom).
 * Seuls les cas que le PDF ne peut pas reproduire fidèlement retombent sur une image de l'élément seul :
 * police système ou inconnue, graisse/style simulé par le navigateur, caractère absent de la police.
 */
export interface PdfExportResult {
  /** `data:application/pdf;base64,…` */
  dataUrl: string
  /** textes écrits en image plutôt qu'en vrai texte, avec la cause (à signaler à l'utilisateur) */
  fallbacks: PdfFallback[]
}

export async function exportPdf(doc: TrameDocument): Promise<PdfExportResult> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(doc.name)
  pdf.setCreator('Trame')
  const w = doc.width * PT_PER_PX
  const h = doc.height * PT_PER_PX
  const ctx = new ExportContext(pdf, h)
  for (const [pageIndex, page] of doc.pages.entries()) {
    const p = pdf.addPage([w, h])
    ctx.page = pageIndex + 1
    const bg = parseColor(page.background)
    p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(bg.r, bg.g, bg.b) })
    for (const el of page.elements) await ctx.drawElement(p, el)
  }
  return { dataUrl: 'data:application/pdf;base64,' + (await pdf.saveAsBase64()), fallbacks: ctx.fallbacks }
}

class ExportContext {
  private fonts = new Map<string, LoadedFont | null>()
  /** page en cours (à partir de 1) et replis rencontrés */
  page = 1
  readonly fallbacks: PdfFallback[] = []

  constructor(
    private pdf: PDFDocument,
    private pageHeight: number
  ) {}

  async drawElement(p: PDFPage, el: TrameElement): Promise<void> {
    // Repère local de l'élément (voir elementMatrix) : origine en haut à gauche, y vers le haut, unités = px de design
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(...elementMatrix(el, this.pageHeight)))
    try {
      const color = parseColor(el.fill)
      const fill = rgb(color.r, color.g, color.b)
      if (el.type === 'rect') {
        p.drawSvgPath(roundedRectPath(el.width, el.height, el.cornerRadius), { x: 0, y: 0, color: fill, opacity: el.opacity })
      } else if (el.type === 'ellipse') {
        p.drawSvgPath(ellipsePath(el.width, el.height), { x: 0, y: 0, color: fill, opacity: el.opacity })
      } else if (el.type === 'path' && el.path) {
        // le chemin vit dans un viewBox 100×100 : mise à l'échelle non uniforme vers la boîte de l'élément
        p.pushOperators(pushGraphicsState(), concatTransformationMatrix(el.width / 100, 0, 0, el.height / 100, 0, 0))
        p.drawSvgPath(el.path, { x: 0, y: 0, color: fill, opacity: el.opacity })
        p.pushOperators(popGraphicsState())
      } else if (el.type === 'image' && el.src) {
        const img = await this.embedImage(el.src)
        p.drawImage(img, { x: 0, y: -el.height, width: el.width, height: el.height, opacity: el.opacity })
      } else if (el.type === 'text') {
        const why = await this.drawTextVector(p, el)
        if (why) {
          this.fallbacks.push({ page: this.page, text: el.text ?? '', ...why })
          await this.drawTextImage(p, el)
        }
      }
    } finally {
      p.pushOperators(popGraphicsState())
    }
  }

  private async embedImage(src: string): Promise<PDFImage> {
    const d = decodeDataUrl(src)
    if (d?.mime === 'image/png') return this.pdf.embedPng(d.bytes)
    if (d?.mime === 'image/jpeg') return this.pdf.embedJpg(d.bytes)
    // GIF, WebP, SVG… : on laisse le navigateur les décoder puis on les ré-encode en PNG
    const img = await loadImage(src)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    return this.pdf.embedPng(decodeDataUrl(canvas.toDataURL('image/png'))!.bytes)
  }

  /** Police PDF d'une variante (chargée une seule fois), ou null si elle est illisible. */
  private async loadFont(choice: FontChoice): Promise<LoadedFont | null> {
    const key = `${choice.def.slug}/${choice.variant}`
    if (!this.fonts.has(key)) {
      let loaded: LoadedFont | null = null
      try {
        const bytes = await loadFontBytes(choice)
        if (bytes) loaded = { pdfFont: await this.pdf.embedFont(bytes, { subset: true }), layout: fontkit.create(bytes) }
      } catch {
        loaded = null // police illisible : le texte sera rendu en image plutôt que de faire échouer l'export
      }
      this.fonts.set(key, loaded)
    }
    return this.fonts.get(key)!
  }

  private gstate(p: PDFPage, opacity: number): ReturnType<PDFPage['node']['newExtGState']> {
    // les ressources (dont les états graphiques) sont propres à chaque page
    return p.node.newExtGState('GS', this.pdf.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }))
  }

  /** Dessine le texte en vrai texte PDF. Retourne null si c'est fait, sinon la cause (l'élément sera rendu en image). */
  private async drawTextVector(p: PDFPage, el: TrameElement): Promise<TextIssue | null> {
    if (!(el.text ?? '').trim()) return null // rien à dessiner
    // même verdict que l'avertissement en direct de l'éditeur (pdfTextCheck)
    const issue = await checkText(el, async (choice) => (await this.loadFont(choice))?.layout ?? null)
    if (issue) return issue
    const diagnosis = diagnoseFont(el.fontFamily, el.fontStyle)
    if (!diagnosis.ok) return null // inatteignable : checkText a déjà répondu
    const font = (await this.loadFont(diagnosis.choice))!

    // Même mise en page que l'écran : Konva fournit les lignes (retours à la ligne) et les métriques de la police
    const node = createTextNode(el)
    const metrics = node.measureSize('M')
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
    const fontSize = el.fontSize ?? 12
    const lineHeight = node.lineHeight()

    const { layout, pdfFont } = font
    const lines: Array<{ x: number; baseline: number; operand: PDFArray }> = []
    for (const [i, line] of node.textArr.entries()) {
      const run = layout.layout(line.text)
      const items: Array<PDFHexString | PDFNumber> = []
      for (const [g, glyph] of run.glyphs.entries()) {
        if (!glyph.codePoints.length) return { reason: 'missing-glyph', family: el.fontFamily ?? '' } // glyphe sans caractère d'origine : on ne sait pas l'encoder
        items.push(pdfFont.encodeText(String.fromCodePoint(...glyph.codePoints)) as PDFHexString)
        const adj = tjAdjustment(run.positions[g].xAdvance, glyph.advanceWidth, layout.unitsPerEm)
        if (adj !== 0) items.push(PDFNumber.of(adj))
      }
      lines.push({
        x: lineOffsetX(el.align, el.width, line.width),
        baseline: baselineY(i, fontSize, lineHeight, ascent, descent),
        operand: this.pdf.context.obj(items) as PDFArray
      })
    }

    const color = parseColor(el.fill)
    // pdf-lib n'émet l'opérateur Tf que dans drawText : comme on écrit les opérateurs nous-mêmes, on déclare la police
    // dans les ressources de la page et on la sélectionne explicitement
    const fontName = p.node.newFontDictionary(pdfFont.name, pdfFont.ref)
    if (el.opacity < 1) p.pushOperators(setGraphicsState(this.gstate(p, el.opacity)))
    p.pushOperators(beginText(), setFontAndSize(fontName, fontSize), setFillingColor(rgb(color.r, color.g, color.b)))
    let prev = { x: 0, y: 0 } // Td est relatif à la ligne précédente
    for (const line of lines) {
      const pos = { x: line.x, y: -line.baseline }
      p.pushOperators(moveText(pos.x - prev.x, pos.y - prev.y), PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [line.operand]))
      prev = pos
    }
    p.pushOperators(endText())
    return null
  }

  /**
   * Repli : le texte seul, rendu par le navigateur sur fond transparent, placé comme une image.
   * La boîte de texte de Konva est plus serrée que les glyphes (jambages, italiques, accents) : on ajoute une marge.
   */
  private async drawTextImage(p: PDFPage, el: TrameElement): Promise<void> {
    const pad = Math.ceil((el.fontSize ?? 12) * 0.35)
    const node = createTextNode(el, { x: pad, y: pad })
    const width = Math.ceil(el.width) + 2 * pad
    const height = Math.ceil(node.height()) + 2 * pad
    const stage = new Konva.Stage({ container: document.createElement('div'), width, height })
    const layer = new Konva.Layer()
    layer.add(node)
    stage.add(layer)
    layer.draw()
    const url = stage.toDataURL({ mimeType: 'image/png', pixelRatio: FALLBACK_PIXEL_RATIO })
    stage.destroy()
    const img = await this.pdf.embedPng(decodeDataUrl(url)!.bytes)
    // repère local : l'image dépasse de `pad` autour de la boîte de l'élément (haut-gauche = (0, 0), y vers le haut)
    p.drawImage(img, { x: -pad, y: pad - height, width, height, opacity: el.opacity })
  }
}

export type { TramePage }
