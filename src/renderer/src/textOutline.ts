import type { FontkitFont } from '@/fontkit'
import { fontkit } from '@/fontkit'
import { createTextNode } from '@/exportPages'
import { loadFontBytes, diagnoseFont } from '@/pdfFonts'
import { checkText, type TextIssue } from '@/pdfTextCheck'
import { normalizedOutline, paperScope, type Combined } from '@/pathBoolean'
import { baselineY, lineOffsetX } from '@/pdfMath'
import { columnLayout, placeLine } from '@/columnStyle'
import { listIndent } from '@/listStyle'
import type { ListTextNode } from '@/listText'
import { decorationGeometry, displayText, letterSpacingOf } from '@/textStyle'
import type { TrameElement } from '@/types'
import { nanoid } from 'nanoid'

const n = (v: number): string => String(Math.round(v * 1000) / 1000)

interface Cmd {
  command: string
  args: number[]
}

/**
 * Les contours des lettres d'une ligne, en données de chemin SVG absolues (`M`, `L`, `C`, `Z`) dans le repère de la boîte du texte (y vers le bas) :
 * la ligne de base est à `baseline`, la première lettre à `x`. La ligne entière est composée avec son crénage et ses ligatures ; avec un interlettrage,
 * comme l'éditeur, lettre par lettre (ni crénage ni ligatures) et l'espacement s'ajoute après chaque lettre.
 */
export function lineOutline(font: FontkitFont, text: string, x: number, baseline: number, size: number, spacing: number): string {
  const scale = size / font.unitsPerEm
  const out: string[] = []
  let pen = x
  const runs = spacing !== 0 ? [...text].map((ch) => font.layout(ch)) : [font.layout(text)]
  for (const run of runs) {
    run.glyphs.forEach((glyph, g) => {
      const pos = run.positions[g]
      const ox = pen + pos.xOffset * scale
      const oy = baseline - pos.yOffset * scale
      let cx = 0
      let cy = 0 // point courant, en unités de la police (pour les courbes quadratiques)
      const px = (v: number): string => n(ox + v * scale)
      const py = (v: number): string => n(oy - v * scale)
      for (const c of ((glyph.path as unknown as { commands?: Cmd[] }).commands ?? [])) {
        const a = c.args
        if (c.command === 'moveTo') {
          out.push(`M${px(a[0])} ${py(a[1])}`)
          ;[cx, cy] = a
        } else if (c.command === 'lineTo') {
          out.push(`L${px(a[0])} ${py(a[1])}`)
          ;[cx, cy] = a
        } else if (c.command === 'quadraticCurveTo') {
          // quadratique (TrueType) → cubique : les poignées aux deux tiers du chemin vers le point de contrôle
          const [qx, qy, x1, y1] = a
          out.push(`C${px(cx + (2 / 3) * (qx - cx))} ${py(cy + (2 / 3) * (qy - cy))} ${px(x1 + (2 / 3) * (qx - x1))} ${py(y1 + (2 / 3) * (qy - y1))} ${px(x1)} ${py(y1)}`)
          cx = x1
          cy = y1
        } else if (c.command === 'bezierCurveTo') {
          out.push(`C${px(a[0])} ${py(a[1])} ${px(a[2])} ${py(a[3])} ${px(a[4])} ${py(a[5])}`)
          cx = a[4]
          cy = a[5]
        } else if (c.command === 'closePath') out.push('Z')
      }
      pen += pos.xAdvance * scale + (spacing !== 0 ? spacing : 0)
    })
  }
  return out.join('')
}

/** Un rectangle (soulignement, barré) en données de chemin. */
const rectOutline = (x: number, y: number, w: number, h: number): string => `M${n(x)} ${n(y)}L${n(x + w)} ${n(y)}L${n(x + w)} ${n(y + h)}L${n(x)} ${n(y + h)}Z`

/** Des contours de lettres fondus en un seul tracé (les recouvrements disparaissent, les trous restent), normalisé dans un repère 100 × 100 avec sa boîte. */
export async function mergedOutline(data: string): Promise<Combined | null> {
  const s = await paperScope()
  const merged = new s.CompoundPath({ pathData: data, fillRule: 'nonzero', insert: false }).unite(new s.Path({ insert: false }), { insert: false })
  return normalizedOutline(s, merged)
}

export type TextPathResult = { element: TrameElement } | { issue: TextIssue } | { empty: true }

/**
 * Le texte d'un élément transformé en tracé : mêmes lignes, mêmes colonnes, mêmes marqueurs de liste, même soulignement que l'éditeur et le PDF
 * (la mise en page vient de Konva comme pour eux). Les lettres qui se recouvrent sont fondues (une lettre à contours croisés ne laisse pas de trou) et le
 * résultat est un seul tracé pair-impair. Il garde la position, la rotation, le style (couleur, dégradé, contour, ombre) et le lien du texte.
 * Une police absente de Trame (police du système) ou un caractère qu'elle n'a pas rend la cause (`issue`), comme pour le PDF.
 */
export async function textToPathElement(el: TrameElement): Promise<TextPathResult> {
  if (el.type !== 'text' || !displayText(el).trim()) return { empty: true }
  const loaded = new Map<string, FontkitFont | null>()
  const getFont = async (choice: NonNullable<ReturnType<typeof diagnoseFont> & { ok: true }>['choice']): Promise<FontkitFont | null> => {
    const key = `${choice.def.slug}/${choice.variant}`
    if (!loaded.has(key)) {
      try {
        const bytes = await loadFontBytes(choice)
        loaded.set(key, bytes ? (fontkit.create(bytes) as FontkitFont) : null)
      } catch {
        loaded.set(key, null)
      }
    }
    return loaded.get(key) ?? null
  }
  const issue = await checkText(el, getFont)
  if (issue) return { issue }
  const diagnosis = diagnoseFont(el.fontFamily, el.fontStyle)
  if (!diagnosis.ok) return { empty: true } // inatteignable : checkText a déjà répondu
  const font = (await getFont(diagnosis.choice))!

  const node = createTextNode(el)
  const metrics = node.measureSize('M')
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
  const fontSize = el.fontSize ?? 12
  const lineHeight = node.lineHeight()
  const spacing = letterSpacingOf(el)
  const indent = el.list ? listIndent(el.fontSize) : 0
  const cols = columnLayout(el, node.textArr.length)
  const parts: string[] = []
  const decoration = decorationGeometry(fontSize)
  node.textArr.forEach((line, i) => {
    if (!line.text) return
    const at = placeLine(i, cols.rows, cols.width, cols.gap)
    const x = at.x + indent + lineOffsetX(el.align, cols.width - indent, line.width)
    const base = baselineY(at.row, fontSize, lineHeight, ascent, descent)
    parts.push(lineOutline(font, line.text, x, base, fontSize, spacing))
    for (const offset of [el.underline ? decoration.underlineOffset : null, el.strike ? decoration.strikeOffset : null]) {
      if (offset !== null) parts.push(rectOutline(x, base + offset - decoration.thickness / 2, Math.round(line.width), decoration.thickness))
    }
  })
  for (const m of (node as ListTextNode).listMarkers ?? []) {
    const at = placeLine(m.line, cols.rows, cols.width, cols.gap)
    parts.push(lineOutline(font, m.text, at.x, baselineY(at.row, fontSize, lineHeight, ascent, descent), fontSize, spacing))
  }
  const data = parts.join('')
  if (!data) return { empty: true }

  // fondre les contours qui se recouvrent (une lettre dont les traits se croisent) : le résultat est alors fiable en pair-impair
  const c = await mergedOutline(data)
  if (!c) return { empty: true }

  // la boîte du tracé est dans le repère du texte : on la ramène à la page (le texte pivote autour de son coin haut gauche)
  const r = ((el.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const { gradient, stroke, strokeWidth, strokeDashed, shadow, link, build, groupId } = el
  const label = displayText(el).replace(/\s+/g, ' ').trim().slice(0, 40)
  return {
    element: {
      id: nanoid(8),
      type: 'path',
      name: label,
      x: Math.round((el.x + c.x * cos - c.y * sin) * 1000) / 1000,
      y: Math.round((el.y + c.x * sin + c.y * cos) * 1000) / 1000,
      width: c.width,
      height: c.height,
      rotation: el.rotation ?? 0,
      opacity: el.opacity,
      fill: el.fill,
      ...(gradient ? { gradient } : {}),
      ...(stroke ? { stroke } : {}),
      ...(strokeWidth ? { strokeWidth } : {}),
      ...(strokeDashed ? { strokeDashed } : {}),
      ...(shadow ? { shadow } : {}),
      ...(link ? { link } : {}),
      ...(build ? { build } : {}),
      ...(groupId ? { groupId } : {}),
      path: c.path,
      fillRule: 'evenodd'
    }
  }
}
