import Konva from 'konva'
import { fontkit, type FontkitFont } from '@/fontkit'
import {
  PDFArray, PDFDict, PDFDocument, PDFEmbeddedPage, PDFFont, PDFHexString, PDFImage, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, PDFPage,
  beginText, concatTransformationMatrix, endText, moveText, popGraphicsState, pushGraphicsState, rgb,
  TextRenderingMode, setCharacterSpacing, setDashPattern, setFillingColor, setFontAndSize, setGraphicsState, setLineWidth,
  appendBezierCurve, clip, closePath, endPath, lineTo, moveTo, setStrokingColor, setTextRenderingMode
} from 'pdf-lib'
import { createTextNode, loadImage } from '@/exportPages'
import { renderElementImage } from '@/elementImage'
import {
  PT_PER_PX, baselineY, decodeDataUrl, ellipsePath, elementMatrix, lineOffsetX, parseColor, roundedRectPath, svgPathToSegments, tjAdjustment
} from '@/pdfMath'
import { diagnoseFont, loadFontBytes, type FontChoice } from '@/pdfFonts'
import { checkText, type TextIssue } from '@/pdfTextCheck'
import type { PdfFallback } from '@/pdfFallbacks'
import { dashPattern, hasStroke, scalePath } from '@/strokeStyle'
import { boundsOf } from '@/geometry'
import { linearGradientLine, radialGradientCircle } from '@/gradient'
import { listIndent } from '@/listStyle'
import type { ListTextNode } from '@/listText'
import { editedPng } from '@/imageRender'
import { hasImageEdits } from '@/imageStyle'
import { hasShadow, shadowMargin } from '@/shadowStyle'
import { decorationGeometry, displayText, letterSpacingOf } from '@/textStyle'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

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
  const ctx = new ExportContext(pdf, h, doc.sources)
  for (const [pageIndex, page] of doc.pages.entries()) {
    const p = pdf.addPage([w, h])
    ctx.page = pageIndex + 1
    const bg = parseColor(page.background)
    p.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(bg.r, bg.g, bg.b) })
    for (const el of page.elements) if (!el.hidden) await ctx.drawElement(p, el) // un calque masqué n'est jamais exporté
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
    private pageHeight: number,
    private sources: Record<string, string> = {}
  ) {}

  /** PDF d'origine chargés (une fois) et pages déjà intégrées : un fond importé redevient la page vectorielle d'origine. */
  private sourceDocs = new Map<string, PDFDocument | null>()
  private sourcePages = new Map<string, PDFEmbeddedPage | null>()

  private async embedSourcePage(el: TrameElement): Promise<PDFEmbeddedPage | null> {
    const ref = el.pdfSource
    if (!ref || !this.sources[ref.id]) return null
    const key = `${ref.id}:${ref.page}`
    if (this.sourcePages.has(key)) return this.sourcePages.get(key) ?? null
    let page: PDFEmbeddedPage | null = null
    try {
      if (!this.sourceDocs.has(ref.id)) this.sourceDocs.set(ref.id, await PDFDocument.load(this.sources[ref.id], { ignoreEncryption: false }).catch(() => null))
      const src = this.sourceDocs.get(ref.id)
      const srcPage = src && ref.page <= src.getPageCount() ? src.getPage(ref.page - 1) : null
      // une page tournée (/Rotate) serait mal orientée : l'image de fond, qui suit l'affichage, est alors plus fidèle
      if (srcPage && srcPage.getRotation().angle === 0) {
        const box = srcPage.getCropBox()
        page = await this.pdf.embedPage(srcPage, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height })
      }
    } catch {
      page = null // source illisible : repli sur l'image
    }
    this.sourcePages.set(key, page)
    return page
  }

  async drawElement(p: PDFPage, el: TrameElement): Promise<void> {
    // 1. Cas rendus ENTIÈREMENT en image, décidés avant toute opération de dessin (pour ne jamais dessiner une ombre deux fois) :
    //    Konva compose l'élément d'un bloc puis applique l'opacité à l'ensemble ; un PDF qui peindrait fond, contour et ombre un par un
    //    avec une transparence mélangerait leurs parties communes (bande plus sombre, ombre visible à travers le fond).
    if (el.type !== 'text' && el.opacity < 1 && (hasStroke(el) || hasShadow(el))) return this.drawElementImage(p, el)
    if (el.type === 'text') {
      const issue = await this.textIssue(el)
      if (issue) return this.fallBackToImage(p, el, issue)
    }
    // 2. Ombre : une image, placée SOUS l'élément, qui lui reste vectoriel (et son texte, du vrai texte)
    if (hasShadow(el)) await this.drawShadowImage(p, el)

    // 3. L'élément lui-même. Repère local (voir elementMatrix) : origine en haut à gauche, y vers le haut, unités = px de design
    let lateIssue: TextIssue | null = null
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(...elementMatrix(el, this.pageHeight)))
    try {
      const color = parseColor(el.fill)
      const fill = rgb(color.r, color.g, color.b)
      // Contour centré sur le bord, comme Konva ; absent des options quand il n'y en a pas
      const stroke = hasStroke(el) ? parseColor(el.stroke) : null
      const border = stroke
        ? {
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: el.strokeWidth,
            borderOpacity: el.opacity,
            ...(el.strokeDashed ? { borderDashArray: dashPattern(el.strokeWidth as number) } : {})
          }
        : {}
      /** Peint la forme : dégradé (détourage + shading) s'il y en a un et qu'on sait le détourer, sinon couleur unie ; puis contour. */
      const paintShape = (d: string): void => {
        const gradientDone = !!el.gradient && this.paintGradient(p, el, d)
        if (!gradientDone) p.drawSvgPath(d, { x: 0, y: 0, color: fill, opacity: el.opacity, ...border })
        // dégradé déjà peint : seul le contour reste à tracer. Sans fond ni contour, drawSvgPath tracerait quand même un trait fin par défaut.
        else if (stroke) p.drawSvgPath(d, { x: 0, y: 0, ...border })
      }
      if (el.type === 'rect') {
        paintShape(roundedRectPath(el.width, el.height, el.cornerRadius))
      } else if (el.type === 'ellipse') {
        paintShape(ellipsePath(el.width, el.height))
      } else if (el.type === 'path' && el.path) {
        // Le chemin vit dans un viewBox 100×100. On étire ses COORDONNÉES vers la boîte de l'élément (et non le dessin) : un trait
        // dessiné dans un repère étiré aurait une épaisseur différente en largeur et en hauteur.
        const scaled = scalePath(el.path, el.width / 100, el.height / 100)
        if (scaled) {
          paintShape(scaled)
        } else {
          p.pushOperators(pushGraphicsState(), concatTransformationMatrix(el.width / 100, 0, 0, el.height / 100, 0, 0))
          p.drawSvgPath(el.path, { x: 0, y: 0, color: fill, opacity: el.opacity })
          p.pushOperators(popGraphicsState())
        }
      } else if (el.type === 'image' && el.src) {
        const source = hasImageEdits(el) ? null : await this.embedSourcePage(el)
        if (source) {
          p.drawPage(source, { x: 0, y: -el.height, width: el.width, height: el.height, opacity: el.opacity })
        } else {
          const img = hasImageEdits(el) ? await this.pdf.embedPng(decodeDataUrl(await editedPng(el))!.bytes) : await this.embedImage(el.src)
          p.drawImage(img, { x: 0, y: -el.height, width: el.width, height: el.height, opacity: el.opacity })
        }
        // Konva trace le contour d'une image après l'image : un rectangle, sans remplissage
        if (stroke) p.drawSvgPath(roundedRectPath(el.width, el.height, 0), { x: 0, y: 0, ...border })
      } else if (el.type === 'text') {
        lateIssue = await this.drawTextVector(p, el) // cause tardive (rare) : rien n'a été dessiné dans ce cas
      }
    } finally {
      p.pushOperators(popGraphicsState())
    }
    if (lateIssue) await this.fallBackToImage(p, el, lateIssue)
  }

  /** Le texte ne peut pas être écrit en vrai texte ? (même verdict que l'avertissement en direct de l'éditeur) */
  private async textIssue(el: TrameElement): Promise<TextIssue | null> {
    if (!displayText(el).trim()) return null
    return checkText(el, async (choice) => (await this.loadFont(choice))?.layout ?? null)
  }

  private async fallBackToImage(p: PDFPage, el: TrameElement, why: TextIssue): Promise<void> {
    this.fallbacks.push({ page: this.page, text: el.text ?? '', ...why })
    await this.drawElementImage(p, el)
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

  /**
   * Dégradé : objet « shading » PDF natif (axial ou radial, deux couleurs, prolongé au-delà des extrémités) peint dans le détourage
   * de la forme (`W n`, puis `sh`). Le chemin est écrit dans le repère SVG (y vers le bas) puis le repère est rétabli : le détourage,
   * lui, reste acquis. Retourne false si le chemin n'est pas convertible (l'appelant peint alors la couleur unie).
   */
  private paintGradient(p: PDFPage, el: TrameElement, pathD: string): boolean {
    const g = el.gradient
    const segments = g ? svgPathToSegments(pathD) : null
    if (!g || !segments) return false
    const c0 = parseColor(g.from)
    const c1 = parseColor(g.to)
    const fn = this.pdf.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [c0.r, c0.g, c0.b], C1: [c1.r, c1.g, c1.b], N: 1 })
    // coordonnées dans le repère local de l'élément (y vers le HAUT) : on inverse y par rapport au repère de l'élément (y vers le bas)
    let shading: PDFDict
    if (g.type === 'radial') {
      const { cx, cy, r } = radialGradientCircle(el.width, el.height)
      shading = this.pdf.context.obj({ ShadingType: 3, ColorSpace: 'DeviceRGB', Coords: [cx, -cy, 0, cx, -cy, r], Function: fn, Extend: [true, true] }) as PDFDict
    } else {
      const l = linearGradientLine(el.width, el.height, g.angle)
      shading = this.pdf.context.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [l.x0, -l.y0, l.x1, -l.y1], Function: fn, Extend: [true, true] }) as PDFDict
    }
    const resources = p.node.Resources() ?? (p.node.set(PDFName.of('Resources'), this.pdf.context.obj({})), p.node.Resources()!)
    let dict = resources.lookupMaybe(PDFName.of('Shading'), PDFDict)
    if (!dict) {
      dict = this.pdf.context.obj({})
      resources.set(PDFName.of('Shading'), dict)
    }
    const name = PDFName.of(`Sh${dict.keys().length + 1}`)
    dict.set(name, this.pdf.context.register(shading))

    const flip = concatTransformationMatrix(1, 0, 0, -1, 0, 0)
    const ops = [pushGraphicsState()]
    if (el.opacity < 1) ops.push(setGraphicsState(this.gstate(p, el.opacity)))
    ops.push(flip)
    for (const sg of segments) {
      if (sg.op === 'M') ops.push(moveTo(sg.x, sg.y))
      else if (sg.op === 'L') ops.push(lineTo(sg.x, sg.y))
      else if (sg.op === 'C') ops.push(appendBezierCurve(sg.x1, sg.y1, sg.x2, sg.y2, sg.x, sg.y))
      else ops.push(closePath())
    }
    ops.push(clip(), endPath(), flip, PDFOperator.of(PDFOperatorNames.ShadingFill, [name]), popGraphicsState())
    p.pushOperators(...ops)
    return true
  }

  private gstate(p: PDFPage, opacity: number): ReturnType<PDFPage['node']['newExtGState']> {
    // les ressources (dont les états graphiques) sont propres à chaque page
    return p.node.newExtGState('GS', this.pdf.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }))
  }

  /** Dessine le texte en vrai texte PDF. Retourne null si c'est fait, sinon la cause (l'élément sera rendu en image). */
  private async drawTextVector(p: PDFPage, el: TrameElement): Promise<TextIssue | null> {
    if (!displayText(el).trim()) return null // rien à dessiner
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
    const spacing = letterSpacingOf(el)
    type Line = { x: number; baseline: number; width: number; operand: PDFArray }
    const lines: Line[] = []
    const markerLines: Line[] = [] // marqueurs d'une liste : dans la colonne de retrait, jamais soulignés ni barrés
    const indent = el.list ? listIndent(el.fontSize) : 0
    const entries = [
      ...node.textArr.map((line, i) => ({ text: line.text, width: line.width, i, x: indent + lineOffsetX(el.align, el.width - indent, line.width), into: lines })),
      ...((node as ListTextNode).listMarkers ?? []).map((m) => ({ text: m.text, width: node.measureSize(m.text).width, i: m.line, x: 0, into: markerLines }))
    ]
    for (const { text, width, i, x, into } of entries) {
      const line = { text, width }
      const items: Array<PDFHexString | PDFNumber> = []
      // Avec un interlettrage, Konva dessine lettre par lettre : ni crénage ni ligatures. On fait de même (une mise en page par
      // caractère), l'espacement lui-même étant porté par l'opérateur Tc ; sinon la ligne entière est composée avec son crénage.
      const runs = spacing !== 0 ? [...line.text].map((ch) => layout.layout(ch)) : [layout.layout(line.text)]
      for (const run of runs) {
        for (const [g, glyph] of run.glyphs.entries()) {
          if (!glyph.codePoints.length) return { reason: 'missing-glyph', family: el.fontFamily ?? '' } // glyphe sans caractère d'origine : on ne sait pas l'encoder
          items.push(pdfFont.encodeText(String.fromCodePoint(...glyph.codePoints)) as PDFHexString)
          const adj = spacing !== 0 ? 0 : tjAdjustment(run.positions[g].xAdvance, glyph.advanceWidth, layout.unitsPerEm)
          if (adj !== 0) items.push(PDFNumber.of(adj))
        }
      }
      into.push({
        x,
        baseline: baselineY(i, fontSize, lineHeight, ascent, descent),
        width: line.width,
        operand: this.pdf.context.obj(items) as PDFArray
      })
    }

    const color = parseColor(el.fill)
    // pdf-lib n'émet l'opérateur Tf que dans drawText : comme on écrit les opérateurs nous-mêmes, on déclare la police
    // dans les ressources de la page et on la sélectionne explicitement
    const fontName = p.node.newFontDictionary(pdfFont.name, pdfFont.ref)
    if (el.opacity < 1) p.pushOperators(setGraphicsState(this.gstate(p, el.opacity)))
    p.pushOperators(beginText(), setFontAndSize(fontName, fontSize), setFillingColor(rgb(color.r, color.g, color.b)))
    if (spacing !== 0) p.pushOperators(setCharacterSpacing(spacing))
    // Contour des lettres : remplissage puis trait centré sur le bord des glyphes (même ordre que Konva)
    const outline = hasStroke(el) ? parseColor(el.stroke) : null
    if (outline) {
      p.pushOperators(
        setStrokingColor(rgb(outline.r, outline.g, outline.b)),
        setLineWidth(el.strokeWidth as number),
        setTextRenderingMode(TextRenderingMode.FillAndOutline),
        ...(el.strokeDashed ? [setDashPattern(dashPattern(el.strokeWidth as number), 0)] : [])
      )
    }
    let prev = { x: 0, y: 0 } // Td est relatif à la ligne précédente
    for (const line of [...lines, ...markerLines]) {
      const pos = { x: line.x, y: -line.baseline }
      p.pushOperators(moveText(pos.x - prev.x, pos.y - prev.y), PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [line.operand]))
      prev = pos
    }
    p.pushOperators(endText())

    // Soulignement et barré : mêmes position, épaisseur et longueur arrondie que Konva
    if (el.underline || el.strike) {
      const g = decorationGeometry(fontSize)
      for (const line of lines) {
        for (const offset of [el.underline ? g.underlineOffset : null, el.strike ? g.strikeOffset : null]) {
          if (offset === null) continue
          p.drawRectangle({ x: line.x, y: -(line.baseline + offset) - g.thickness / 2, width: Math.round(line.width), height: g.thickness, color: rgb(color.r, color.g, color.b), borderWidth: 0 })
        }
      }
    }
    return null
  }

  /** Rend l'élément en image (voir `renderElementImage`) et l'intègre au PDF. */
  private async renderToImage(el: TrameElement, mode: 'full' | 'shadow'): Promise<{ img: PDFImage; x: number; y: number; w: number; h: number } | null> {
    const r = await renderElementImage(el, mode)
    return r && { img: await this.pdf.embedPng(decodeDataUrl(r.url)!.bytes), x: r.x, y: r.y, w: r.w, h: r.h }
  }

  private place(p: PDFPage, r: { img: PDFImage; x: number; y: number; w: number; h: number }, opacity: number): void {
    p.drawImage(r.img, { x: PT_PER_PX * r.x, y: this.pageHeight - PT_PER_PX * (r.y + r.h), width: PT_PER_PX * r.w, height: PT_PER_PX * r.h, opacity })
  }

  /** Repli : l'élément entier en image haute résolution (opacité incluse dans l'image). */
  private async drawElementImage(p: PDFPage, el: TrameElement): Promise<void> {
    const r = await this.renderToImage(el, 'full')
    if (r) this.place(p, r, 1)
  }

  /** Ombre seule, en image, à peindre avant l'élément vectoriel. */
  private async drawShadowImage(p: PDFPage, el: TrameElement): Promise<void> {
    const r = await this.renderToImage(el, 'shadow')
    if (r) this.place(p, r, 1)
  }
}

export type { TramePage }
