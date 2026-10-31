import type { TrameDocument, TrameElement, TramePage } from '@/types'

/**
 * Vérifications d'accessibilité d'un document, sans dépendance à l'éditeur : contraste des textes (WCAG 2, niveau AA), taille du
 * texte, ordre de lecture. Les descriptions d'images ont leur propre contrôle (`altCheck.ts`).
 */

export type Rgb = [number, number, number]

/** « #rgb » ou « #rrggbb » (sans tenir compte de la casse) ; autre chose (« transparent », nom de couleur, dégradé) : null. */
export function parseHex(color: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export const toHex = (c: Rgb): string => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

/** Luminance relative WCAG (0 noir, 1 blanc). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Rapport de contraste WCAG entre deux couleurs (de 1 à 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Pose une couleur d'opacité `alpha` sur un fond. */
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => mix(bg, fg, alpha)

/** Texte « grand » pour WCAG : au moins 18 pt (24 px), ou 14 pt (18,67 px) en gras : il se contente d'un rapport de 3 au lieu de 4,5. */
export const isLargeText = (e: Pick<TrameElement, 'fontSize' | 'fontStyle'>): boolean => {
  const size = e.fontSize ?? 12
  return size >= 24 || (size >= 18.67 && !!e.fontStyle?.includes('bold'))
}

export const requiredContrast = (e: Pick<TrameElement, 'fontSize' | 'fontStyle'>): number => (isLargeText(e) ? 3 : 4.5)

/** Ce qui se trouve derrière un texte : une ou plusieurs couleurs possibles (un dégradé en donne deux), ou « inconnu » (image, forme tournée). */
export type Backdrop = { colors: Rgb[] } | { unknown: 'image' | 'shape' }

const WHITE: Rgb = [255, 255, 255]

/** Le centre de la boîte du texte est-il dans la forme (rectangle ou ellipse non pivotés) ? */
function covers(shape: TrameElement, cx: number, cy: number): boolean {
  if (shape.rotation) return false
  if (shape.type === 'ellipse') {
    const rx = shape.width / 2
    const ry = shape.height / 2
    return ((cx - shape.x - rx) / rx) ** 2 + ((cy - shape.y - ry) / ry) ** 2 <= 1
  }
  return cx >= shape.x && cx <= shape.x + shape.width && cy >= shape.y && cy <= shape.y + shape.height
}

/**
 * Fond d'un texte : on part de la couleur de la page et on empile, dans l'ordre, les rectangles, ellipses et formes pleines placés
 * sous le texte et qui recouvrent son centre (opacité comprise). Une image qui le recouvre, ou une forme pivotée, rend le fond
 * inconnu (rien n'est affirmé). Un dégradé donne deux couleurs : le contraste doit tenir avec les deux.
 */
export function backdropOf(page: Pick<TramePage, 'background' | 'elements'>, text: TrameElement): Backdrop {
  const base = parseHex(page.background) ?? WHITE
  let colors: Rgb[] = [base]
  const cx = text.x + text.width / 2
  const cy = text.y + text.height / 2
  const at = page.elements.indexOf(text)
  for (const e of page.elements.slice(0, at < 0 ? undefined : at)) {
    if (e.hidden || e.id === text.id || e.opacity <= 0) continue
    if (e.type === 'image') {
      if (!e.rotation && covers(e, cx, cy)) return { unknown: 'image' }
      continue
    }
    if (e.type === 'text') continue
    if (e.rotation) {
      // une forme pivotée : on ne sait pas simplement si elle passe derrière le texte ; on le dit si son cadre le recouvre
      if (covers({ ...e, rotation: 0 }, cx, cy)) return { unknown: 'shape' }
      continue
    }
    if (!covers(e, cx, cy)) continue
    // une forme libre (étoile, secteur…) : son cadre recouvre le texte mais pas forcément son contour : on ne l'affirme pas
    if (e.type === 'path') return { unknown: 'shape' }
    const fills = e.gradient ? [parseHex(e.gradient.from), parseHex(e.gradient.to)] : [parseHex(e.fill)]
    if (fills.some((f) => f === null)) {
      if (!e.gradient && e.fill.trim().toLowerCase() === 'transparent') continue
      return { unknown: 'shape' }
    }
    colors = (fills as Rgb[]).flatMap((f) => colors.map((c) => over(f, e.opacity, c)))
  }
  return { colors }
}

export type A11yIssue =
  | { kind: 'contrast'; pageId: string; pageIndex: number; elementId: string; ratio: number; required: number; fg: string; bg: string }
  | { kind: 'small'; pageId: string; pageIndex: number; elementId: string; size: number; min: number }
  | { kind: 'order'; pageId: string; pageIndex: number; elementIds: string[] }

/** Texte visible et non vide : le seul à contrôler. */
const readable = (e: TrameElement): boolean => e.type === 'text' && !e.hidden && !!e.text?.trim() && e.opacity > 0

/**
 * Taille minimale lisible : en présentation (page plus large que haute), 2,2 % de la hauteur de la page (24 px sur 1 080) ; sur une
 * page de document (affiche, A4…), 12 px.
 */
export const minTextSize = (doc: Pick<TrameDocument, 'width' | 'height'>): number => (doc.width > doc.height ? Math.max(12, Math.round(doc.height * 0.022)) : 12)

/** Contraste insuffisant : le texte (couleur et opacité) sur son fond. */
export function contrastIssues(doc: Pick<TrameDocument, 'pages'>): A11yIssue[] {
  const out: A11yIssue[] = []
  doc.pages.forEach((page, pageIndex) => {
    for (const e of page.elements) {
      if (!readable(e)) continue
      const fg = parseHex(e.fill)
      if (!fg) continue
      const back = backdropOf(page, e)
      if (!('colors' in back)) continue
      const required = requiredContrast(e)
      // opacité du texte : on le pose sur chaque fond possible
      const ratios = back.colors.map((bg) => ({ bg, ratio: contrastRatio(over(fg, e.opacity, bg), bg) }))
      const worst = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a))
      if (worst.ratio + 1e-9 < required) out.push({ kind: 'contrast', pageId: page.id, pageIndex, elementId: e.id, ratio: Math.round(worst.ratio * 100) / 100, required, fg: toHex(fg), bg: toHex(worst.bg) })
    }
  })
  return out
}

/** Texte plus petit que le minimum lisible. */
export function smallTextIssues(doc: Pick<TrameDocument, 'pages' | 'width' | 'height'>): A11yIssue[] {
  const min = minTextSize(doc)
  const out: A11yIssue[] = []
  doc.pages.forEach((page, pageIndex) => {
    for (const e of page.elements) if (readable(e) && (e.fontSize ?? 12) < min) out.push({ kind: 'small', pageId: page.id, pageIndex, elementId: e.id, size: e.fontSize ?? 12, min })
  })
  return out
}

/**
 * Ordre dans lequel on lirait les textes à l'écran : de haut en bas, puis de gauche à droite (deux textes dont le haut diffère de moins
 * de 24 px, ou de la moitié de leur taille, sont sur la même ligne).
 */
export function visualOrder(texts: TrameElement[]): TrameElement[] {
  const byTop = [...texts].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: TrameElement[][] = []
  for (const t of byTop) {
    const row = rows[rows.length - 1]
    const tol = Math.max(24, (t.fontSize ?? 12) * 0.5)
    if (row && t.y - row[0].y < tol) row.push(t)
    else rows.push([t])
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x))
}

/** Les lecteurs d'écran (PowerPoint, SVG, page web) lisent dans l'ordre des calques : un texte posé en bas avant celui du haut est lu à l'envers. */
export function readingOrderIssues(doc: Pick<TrameDocument, 'pages'>): A11yIssue[] {
  const out: A11yIssue[] = []
  doc.pages.forEach((page, pageIndex) => {
    const texts = page.elements.filter(readable)
    if (texts.length < 2) return
    const wanted = visualOrder(texts).map((e) => e.id)
    if (wanted.some((id, i) => id !== texts[i].id)) out.push({ kind: 'order', pageId: page.id, pageIndex, elementIds: wanted })
  })
  return out
}

/** Tous les problèmes de lisibilité d'un document (hors descriptions d'images), dans l'ordre des pages. */
export function accessibilityIssues(doc: Pick<TrameDocument, 'pages' | 'width' | 'height'>): A11yIssue[] {
  return [...contrastIssues(doc), ...smallTextIssues(doc), ...readingOrderIssues(doc)].sort((a, b) => a.pageIndex - b.pageIndex)
}

/**
 * Couleur la plus proche de `fg` qui atteint le contraste demandé sur `bg` : on mélange la couleur avec du noir ou du blanc (celui qui
 * contraste le plus avec le fond) jusqu'à y arriver ; le noir ou le blanc eux-mêmes si ce n'est pas assez.
 */
export function accessibleColor(fg: Rgb, bg: Rgb[] | Rgb, required: number): string {
  const backs: Rgb[] = Array.isArray(bg[0]) ? (bg as Rgb[]) : [bg as Rgb]
  const ok = (c: Rgb): boolean => backs.every((b) => contrastRatio(c, b) >= required)
  if (ok(fg)) return toHex(fg)
  const black: Rgb = [0, 0, 0]
  const white: Rgb = [255, 255, 255]
  const darkScore = Math.min(...backs.map((b) => contrastRatio(black, b)))
  const lightScore = Math.min(...backs.map((b) => contrastRatio(white, b)))
  const target = darkScore >= lightScore ? black : white
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = mix(fg, target, t)
    if (ok(c)) return toHex(c)
  }
  return toHex(target)
}

/** Textes dont le fond n'a pas pu être déterminé (posés sur une image, ou sur une forme pivotée) : le contraste n'est pas vérifié. */
export function unverifiedTexts(doc: Pick<TrameDocument, 'pages'>): number {
  let n = 0
  for (const page of doc.pages) for (const e of page.elements) if (readable(e) && parseHex(e.fill) && 'unknown' in backdropOf(page, e)) n++
  return n
}

/** Changement d'un texte qui règle un contraste insuffisant : la couleur la plus proche qui convient, et plus de transparence. */
export function contrastFix(doc: Pick<TrameDocument, 'pages'>, issue: Extract<A11yIssue, { kind: 'contrast' }>): { elementId: string; patch: Partial<TrameElement> } | null {
  const page = doc.pages.find((p) => p.id === issue.pageId)
  const e = page?.elements.find((x) => x.id === issue.elementId)
  const fg = e && parseHex(e.fill)
  if (!page || !e || !fg) return null
  const back = backdropOf(page, e)
  if (!('colors' in back)) return null
  return { elementId: e.id, patch: { fill: accessibleColor(fg, back.colors, requiredContrast(e)), ...(e.opacity < 1 ? { opacity: 1 } : {}) } }
}
