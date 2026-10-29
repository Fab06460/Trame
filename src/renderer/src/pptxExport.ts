import PptxGenJS from 'pptxgenjs'
import { renderElementImage } from '@/elementImage'
import { createTextNode } from '@/exportPages'
import { hasImageEdits } from '@/imageStyle'
import { hasShadow } from '@/shadowStyle'
import { hasStroke } from '@/strokeStyle'
import { listIndent } from '@/listStyle'
import { decodeDataUrl } from '@/pdfMath'
import { displayText } from '@/textStyle'
import JSZip from 'jszip'
import { stripPlaceholderAlt } from '@/pptxAlt'
import { insertTransition } from '@/pptxTransition'
import { transitionBetween } from '@/transition'
import type { TrameDocument, TrameElement } from '@/types'

const IN = 1 / 96 // pouces par pixel de design
const PT = 0.75 // points par pixel de design

export interface PptxExportResult {
  /** `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,…` */
  dataUrl: string
  /** éléments exportés en image (PowerPoint ne sait pas les reproduire en objet modifiable) : nombre et causes */
  rasterized: Array<{ page: number; reason: 'gradient' | 'vector' | 'imageBorder' | 'edited' | 'format' }>
}

const hex = (c: string): string => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return '000000'
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]
  return h.toUpperCase()
}

/** Boîte non pivotée de même centre : PowerPoint pivote autour du centre, Trame autour du coin haut-gauche. */
function centredBox(el: TrameElement, width: number, height: number): { x: number; y: number } {
  const r = (el.rotation * Math.PI) / 180
  const cx = el.x + (width / 2) * Math.cos(r) - (height / 2) * Math.sin(r)
  const cy = el.y + (width / 2) * Math.sin(r) + (height / 2) * Math.cos(r)
  return { x: cx - width / 2, y: cy - height / 2 }
}

const shadowOf = (el: TrameElement): PptxGenJS.ShadowProps | undefined => {
  if (!hasShadow(el)) return undefined
  const s = el.shadow!
  const dist = Math.hypot(s.offsetX, s.offsetY)
  return { type: 'outer', color: hex(s.color), opacity: s.opacity, blur: s.blur * PT, offset: dist * PT, angle: ((Math.atan2(s.offsetY, s.offsetX) * 180) / Math.PI + 360) % 360 }
}

const lineOf = (el: TrameElement): PptxGenJS.ShapeLineProps | undefined =>
  hasStroke(el) ? { color: hex(el.stroke!), width: el.strokeWidth! * PT, ...(el.strokeDashed ? { dashType: 'dash' as const } : {}) } : undefined

const familyName = (family: string | undefined): string => (family ?? 'Inter').split(',')[0].replace(/["']/g, '').trim() || 'Inter'

/**
 * Export PowerPoint (.pptx) : une diapositive par page. Les éléments simples restent des **objets modifiables** (rectangles,
 * ellipses, zones de texte avec leur mise en forme, images) ; ceux que PowerPoint ne sait pas reproduire fidèlement (dégradés,
 * formes vectorielles, images retouchées, contours ou ombres d'image) sont posés en **image** à la même place.
 */
export async function exportPptx(doc: TrameDocument): Promise<PptxExportResult> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'TRAME', width: doc.width * IN, height: doc.height * IN })
  pptx.layout = 'TRAME'
  pptx.title = doc.name
  pptx.company = 'Trame'
  const rasterized: PptxExportResult['rasterized'] = []

  for (const [index, page] of doc.pages.entries()) {
    const slide = pptx.addSlide()
    slide.background = { color: hex(page.background) }
    if (page.notes) slide.addNotes(page.notes)
    const asImage = async (el: TrameElement, reason: PptxExportResult['rasterized'][number]['reason']): Promise<void> => {
      const r = await renderElementImage(el, 'full')
      if (!r) return
      slide.addImage({ data: r.url, x: r.x * IN, y: r.y * IN, w: r.w * IN, h: r.h * IN, ...(el.type === 'image' && el.alt ? { altText: el.alt } : {}) })
      rasterized.push({ page: index + 1, reason })
    }

    for (const el of page.elements) {
      if (el.hidden) continue // un calque masqué n'est jamais exporté
      const transparency = Math.round((1 - el.opacity) * 100)
      if (el.type === 'rect' || el.type === 'ellipse') {
        if (el.gradient) { await asImage(el, 'gradient'); continue }
        const { x, y } = centredBox(el, el.width, el.height)
        const round = el.type === 'rect' && (el.cornerRadius ?? 0) > 0
        slide.addShape(el.type === 'ellipse' ? pptx.ShapeType.ellipse : round ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          x: x * IN, y: y * IN, w: el.width * IN, h: el.height * IN, rotate: el.rotation,
          fill: { color: hex(el.fill), transparency },
          line: lineOf(el) ?? { type: 'none' },
          shadow: shadowOf(el),
          ...(round ? { rectRadius: Math.min(el.cornerRadius!, el.width / 2, el.height / 2) * IN } : {})
        })
      } else if (el.type === 'path') {
        await asImage(el, 'vector')
      } else if (el.type === 'image' && el.src) {
        if (hasStroke(el) || hasShadow(el)) { await asImage(el, 'imageBorder'); continue }
        const mime = decodeDataUrl(el.src)?.mime
        // une image retouchée est cuite (recadrage, miroir, filtres) ; un format que PowerPoint ne lit pas est converti
        if (hasImageEdits(el) || (mime !== 'image/png' && mime !== 'image/jpeg')) { await asImage({ ...el, stroke: undefined }, hasImageEdits(el) ? 'edited' : 'format'); continue }
        const { x, y } = centredBox(el, el.width, el.height)
        slide.addImage({ data: el.src, x: x * IN, y: y * IN, w: el.width * IN, h: el.height * IN, rotate: el.rotation, transparency, ...(el.alt ? { altText: el.alt } : {}) })
      } else if (el.type === 'text') {
        const text = displayText(el)
        if (!text.trim()) continue
        // la hauteur d'un texte est celle que Konva mesure (la hauteur enregistrée n'est qu'indicative)
        const height = createTextNode(el).height()
        const { x, y } = centredBox(el, el.width, height)
        const indent = el.list ? listIndent(el.fontSize) * PT : 0
        const runs = text.split('\n').map((para, i, all) => ({
          text: para,
          options: { breakLine: i < all.length - 1, ...(el.list && para.trim() ? { bullet: el.list === 'number' ? { type: 'number' as const, indent } : { code: '2022', indent } } : {}) }
        }))
        slide.addText(runs, {
          x: x * IN, y: y * IN, w: el.width * IN, h: height * IN, rotate: el.rotation,
          fontFace: familyName(el.fontFamily), fontSize: (el.fontSize ?? 32) * PT,
          bold: !!el.fontStyle?.includes('bold'), italic: !!el.fontStyle?.includes('italic'),
          color: hex(el.fill), transparency,
          underline: el.underline ? { style: 'sng' } : undefined, strike: el.strike ? 'sngStrike' : undefined,
          charSpacing: el.letterSpacing ? el.letterSpacing * PT : undefined,
          lineSpacingMultiple: Math.round(((el.lineHeight ?? 1) / 1.2) * 100) / 100,
          align: el.align ?? 'left', valign: 'top', margin: 0, wrap: true, fit: 'none',
          shadow: shadowOf(el)
        })
      }
    }
  }
  let base64 = (await pptx.write({ outputType: 'base64' })) as string
  // pptxgenjs ne sait pas écrire les transitions : on les ajoute au XML de chaque diapositive (celle de la page d'arrivée)
  // et on retire le faux texte alternatif (nom de fichier) que la bibliothèque met aux images qui n'en ont pas
  {
    const zip = await JSZip.loadAsync(base64, { base64: true })
    for (const [i] of doc.pages.entries()) {
      const path = `ppt/slides/slide${i + 1}.xml`
      const file = zip.file(path)
      if (file) zip.file(path, stripPlaceholderAlt(insertTransition(await file.async('string'), transitionBetween(doc, null, i))))
    }
    base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
  }
  return { dataUrl: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`, rasterized }
}
