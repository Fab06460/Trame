import { createTextNode } from '@/exportPages'
import { editedPng } from '@/imageRender'
import { hasImageEdits } from '@/imageStyle'
import { columnLayout, placeLine } from '@/columnStyle'
import { listIndent } from '@/listStyle'
import type { ListTextNode } from '@/listText'
import { baselineY, lineOffsetX } from '@/pdfMath'
import { diagnoseFont, loadFontBytes } from '@/pdfFonts'
import { hasShadow } from '@/shadowStyle'
import { scalePath } from '@/strokeStyle'
import { decorationGeometry, displayText, letterSpacingOf } from '@/textStyle'
import { escXml, fontAttrs, gradientDef, n, shadowFilterDef, strokeAttrs } from '@/svgParts'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

export interface SvgOptions {
  /** incorpore les polices utilisées (@font-face en base64) : le fichier s'affiche pareil partout. Par défaut : oui. */
  embedFonts?: boolean
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** `@font-face` des variantes réellement utilisées par les textes des pages données (les autres polices restent celles du système). */
export async function fontFaces(pages: TramePage[]): Promise<string> {
  const seen = new Map<string, string>()
  for (const el of pages.flatMap((p) => p.elements)) {
    if (el.hidden || el.type !== 'text' || !displayText(el).trim()) continue
    const d = diagnoseFont(el.fontFamily, el.fontStyle)
    if (!d.ok) continue
    const key = `${d.choice.def.name}|${d.choice.variant}`
    if (seen.has(key)) continue
    const bytes = await loadFontBytes(d.choice)
    if (!bytes) continue
    const italic = d.choice.variant.endsWith('italic')
    const mime = d.choice.def.installed ? 'font/woff2' : 'font/woff'
    const format = d.choice.def.installed ? 'woff2' : 'woff'
    seen.set(key, `@font-face{font-family:'${escXml(d.choice.def.name)}';font-weight:${d.choice.variant.startsWith('700') ? 700 : 400};font-style:${italic ? 'italic' : 'normal'};src:url(data:${mime};base64,${bytesToBase64(bytes)}) format('${format}')}`)
  }
  return [...seen.values()].join('')
}

/**
 * Une page en SVG : formes, dégradés, ombres et contours en éléments vectoriels, texte en vrai `<text>` (mêmes lignes et mêmes
 * positions que l'éditeur, par la mise en page de Konva), images en `<image>` (retouches incluses). Les polices utilisées sont
 * incorporées. Un calque masqué n'est jamais exporté.
 */
export async function pageToSvg(doc: Pick<TrameDocument, 'width' | 'height' | 'name'>, page: TramePage, options: SvgOptions = {}): Promise<string> {
  const defs: string[] = []
  const body: string[] = []
  let seq = 0
  const uid = (prefix: string): string => `${prefix}${++seq}`

  for (const el of page.elements) {
    if (el.hidden) continue
    const parts: string[] = []
    let fill = escXml(el.fill)
    if (el.gradient && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'path')) {
      const gid = uid('g')
      defs.push(gradientDef(gid, el.gradient, el.width, el.height))
      fill = `url(#${gid})`
    }
    const stroke = strokeAttrs(el)

    if (el.type === 'rect') {
      const r = Math.min(el.cornerRadius ?? 0, el.width / 2, el.height / 2)
      parts.push(`<rect width="${n(el.width)}" height="${n(el.height)}"${r > 0 ? ` rx="${n(r)}" ry="${n(r)}"` : ''} fill="${fill}"${stroke}/>`)
    } else if (el.type === 'ellipse') {
      parts.push(`<ellipse cx="${n(el.width / 2)}" cy="${n(el.height / 2)}" rx="${n(el.width / 2)}" ry="${n(el.height / 2)}" fill="${fill}"${stroke}/>`)
    } else if (el.type === 'path' && el.path) {
      // coordonnées étirées plutôt que `transform: scale` : le contour garde la même épaisseur partout (comme à l'écran)
      const d = scalePath(el.path, el.width / 100, el.height / 100)
      parts.push(
        d
          ? `<path d="${escXml(d)}" fill="${fill}"${stroke}/>`
          : `<path d="${escXml(el.path)}" transform="scale(${n(el.width / 100)} ${n(el.height / 100)})" fill="${fill}"${stroke ? stroke + ' vector-effect="non-scaling-stroke"' : ''}/>`
      )
    } else if (el.type === 'image' && el.src) {
      const href = hasImageEdits(el) || !el.src.startsWith('data:') ? await editedPng(el) : el.src
      parts.push(`<image width="${n(el.width)}" height="${n(el.height)}" preserveAspectRatio="none" href="${escXml(href)}"${el.alt ? `><title>${escXml(el.alt)}</title></image>` : '/>'}`)
      if (stroke) parts.push(`<rect width="${n(el.width)}" height="${n(el.height)}" fill="none"${stroke}/>`)
    } else if (el.type === 'text') {
      parts.push(textSvg(el))
    }
    if (parts.length === 0) continue

    let filter = ''
    if (hasShadow(el)) {
      const fid = uid('s')
      defs.push(shadowFilterDef(fid, el))
      filter = ` filter="url(#${fid})"`
    }
    const transform = `translate(${n(el.x)} ${n(el.y)})${el.rotation ? ` rotate(${n(el.rotation)})` : ''}`
    const opacity = el.opacity < 1 ? ` opacity="${n(el.opacity)}"` : ''
    body.push(`<g transform="${transform}"${opacity}${filter}>${parts.join('')}</g>`)
  }

  const fonts = options.embedFonts === false ? '' : await fontFaces([page])
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(doc.width)}" height="${n(doc.height)}" viewBox="0 0 ${n(doc.width)} ${n(doc.height)}">` +
    `<title>${escXml(doc.name)}</title>` +
    (defs.length || fonts ? `<defs>${fonts ? `<style>${fonts}</style>` : ''}${defs.join('')}</defs>` : '') +
    `<rect width="${n(doc.width)}" height="${n(doc.height)}" fill="${escXml(page.background)}"/>` +
    body.join('') +
    `</svg>\n`
  )
}

/** Texte d'un élément : une ligne SVG par ligne de l'éditeur (retours à la ligne de Konva), marqueurs de liste compris. */
function textSvg(el: TrameElement): string {
  if (!displayText(el).trim()) return ''
  const node = createTextNode(el)
  const metrics = node.measureSize('M')
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
  const fontSize = el.fontSize ?? 12
  const lineHeight = node.lineHeight()
  const indent = el.list ? listIndent(el.fontSize) : 0
  const spacing = letterSpacingOf(el)
  // avec un interlettrage, l'éditeur dessine lettre par lettre : ni crénage ni ligatures (le SVG fait de même)
  const attrs = `${fontAttrs(el)} fill="${escXml(el.fill)}"${spacing !== 0 ? ` letter-spacing="${n(spacing)}" style="font-kerning:none;font-variant-ligatures:none"` : ''}${strokeAttrs(el)} xml:space="preserve"`

  const out: string[] = []
  const cols = columnLayout(el, node.textArr.length)
  const lines = node.textArr.map((line, i) => {
    const at = placeLine(i, cols.rows, cols.width, cols.gap)
    return { text: line.text, width: line.width, x: at.x + indent + lineOffsetX(el.align, cols.width - indent, line.width), y: baselineY(at.row, fontSize, lineHeight, ascent, descent) }
  })
  for (const l of lines) if (l.text) out.push(`<text x="${n(l.x)}" y="${n(l.y)}" ${attrs}>${escXml(l.text)}</text>`)
  for (const m of (node as ListTextNode).listMarkers ?? []) {
    const at = placeLine(m.line, cols.rows, cols.width, cols.gap)
    out.push(`<text x="${n(at.x)}" y="${n(baselineY(at.row, fontSize, lineHeight, ascent, descent))}" ${attrs}>${escXml(m.text)}</text>`)
  }

  // soulignement et barré : rectangles (mêmes position et épaisseur que Konva), reconnus par tous les logiciels de dessin
  if (el.underline || el.strike) {
    const g = decorationGeometry(fontSize)
    for (const l of lines) {
      if (!l.text) continue
      for (const offset of [el.underline ? g.underlineOffset : null, el.strike ? g.strikeOffset : null]) {
        if (offset === null) continue
        out.push(`<rect x="${n(l.x)}" y="${n(l.y + offset - g.thickness / 2)}" width="${n(Math.round(l.width))}" height="${n(g.thickness)}" fill="${escXml(el.fill)}"/>`)
      }
    }
  }
  return out.join('')
}
