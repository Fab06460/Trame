import { nanoid } from 'nanoid'
import type { TrameDocument, TrameElement, TramePage } from '@/types'
import type { Outline, OutlineBlock } from './outline'

export type CutLevel = 1 | 2 | 3
export type ImportTheme = 'light' | 'dark'

export interface ImportOptions {
  /** les titres de ce niveau ou plus hauts démarrent une page */
  level: CutLevel
  theme: ImportTheme
  /** reprendre les images */
  images: boolean
  /** nom du document (celui du fichier) */
  name: string
  /** mot ajouté au titre d'une page de suite : « Titre (suite) » */
  continued: string
}

export interface ImportResult {
  doc: TrameDocument
  pages: number
  /** le document dépassait `MAX_PAGES` : la suite n'est pas reprise */
  truncated: boolean
}

export const MAX_PAGES = 150

const W = 1920
const H = 1080
const MARGIN_X = 160
const TOP = 96
const BOTTOM = 80
const CONTENT_W = W - 2 * MARGIN_X
/** colonne de texte quand la page a des images, et colonne d'images */
const TEXT_W_WITH_IMAGES = 940
const IMAGE_COL_X = MARGIN_X + TEXT_W_WITH_IMAGES + 60
const IMAGE_COL_W = W - MARGIN_X - IMAGE_COL_X
const LINE_HEIGHT = 1.25
/** largeur moyenne d'un caractère, en em (Inter, prudente : on préfère surestimer la place prise) */
const CHAR_W = 0.56
const BODY_SIZES = [52, 44, 38, 32]
const SPLIT_SIZE = 32
const FONT = '"Inter", sans-serif'

const COLORS: Record<ImportTheme, { bg: string; section: string; bar: string; title: string; body: string; accent: string }> = {
  light: { bg: '#ffffff', section: '#f5f3ff', bar: '#7c5cff', title: '#1e1f24', body: '#2b2d36', accent: '#5b3fd9' },
  dark: { bg: '#1e1f24', section: '#272830', bar: '#7c5cff', title: '#ffffff', body: '#e8e9ee', accent: '#b9a8ff' }
}

// ───────────────────────── mesure approchée du texte ─────────────────────────

/** Nombre de lignes d'un texte (ses retours à la ligne comptent) dans une largeur donnée. */
export function countLines(text: string, size: number, width: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * CHAR_W)))
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0)
}

// ───────────────────────── groupes : ce qui tient sous un même titre ─────────────────────────

type BodyBlock = Exclude<OutlineBlock, { kind: 'heading' | 'break' }> | { kind: 'sub'; text: string }

interface Group {
  title: string | null
  /** couverture ou section : titre seul, en grand */
  body: BodyBlock[]
}

function groupBlocks(outline: Outline, options: ImportOptions): Group[] {
  const groups: Group[] = []
  let cur: Group = { title: null, body: [] }
  const close = (): void => {
    if (cur.title !== null || cur.body.length) groups.push(cur)
  }
  const firstHeading = outline.blocks.find((b) => b.kind === 'heading')
  if (outline.title && !(firstHeading?.kind === 'heading' && firstHeading.text.trim() === outline.title.trim())) groups.push({ title: outline.title, body: [] })
  for (const b of outline.blocks) {
    if (b.kind === 'break') {
      close()
      cur = { title: null, body: [] }
    } else if (b.kind === 'heading') {
      if (b.level <= options.level) {
        close()
        cur = { title: b.text, body: [] }
      } else cur.body.push({ kind: 'sub', text: b.text })
    } else if (b.kind === 'image') {
      if (options.images) cur.body.push(b)
    } else cur.body.push(b)
  }
  close()
  return groups
}

// ───────────────────────── segments : des blocs voisins du même genre, un élément de texte chacun ─────────────────────────

interface Segment {
  kind: 'para' | 'sub' | 'bullet' | 'number'
  /** retrait des sous-listes (0 = premier niveau) */
  level: number
  items: string[]
  /** liste numérotée qui reprend après une sous-liste (ou sur la page suivante) : numéro du premier élément. Trame ne sait pas « reprendre à 3 » : les numéros sont alors écrits dans le texte. */
  start?: number
}

function segments(body: BodyBlock[]): Segment[] {
  const out: Segment[] = []
  for (const b of body) {
    if (b.kind === 'image') continue
    const kind = b.kind === 'item' ? (b.ordered ? 'number' : 'bullet') : b.kind
    const level = b.kind === 'item' ? Math.min(b.level, 3) : 0
    const last = out[out.length - 1]
    if (last && last.kind === kind && last.level === level && kind !== 'sub') last.items.push(b.text)
    else out.push({ kind, level, items: [b.text], ...(kind === 'number' ? continuation(out, level) : {}) })
  }
  return out
}

/** Une liste numérotée interrompue seulement par des sous-listes reprend sa numérotation (« 1, 2, sous-liste, 3 »). */
function continuation(before: Segment[], level: number): { start: number } | Record<string, never> {
  for (let i = before.length - 1; i >= 0; i--) {
    const seg = before[i]
    if (seg.kind === 'number' && seg.level === level) return { start: (seg.start ?? 1) + seg.items.length }
    if (!((seg.kind === 'bullet' || seg.kind === 'number') && seg.level > level)) break
  }
  return {}
}

/** Texte d'un segment : une liste qui reprend (`start`) porte ses numéros écrits. */
const segText = (seg: Segment): string => (seg.kind === 'number' && seg.start && seg.start > 1 ? seg.items.map((t, i) => `${seg.start! + i}. ${t}`).join('\n') : seg.items.join('\n'))

const LEVEL_INDENT = 72

interface Geo {
  x: number
  width: number
  size: number
}

function segGeo(seg: Segment, size: number, columnX: number, columnWidth: number): Geo {
  if (seg.kind === 'sub') return { x: columnX, width: columnWidth, size: Math.round(size * 1.12) }
  if (seg.level > 0) return { x: columnX + LEVEL_INDENT * seg.level, width: columnWidth - LEVEL_INDENT * seg.level, size: Math.round(size * 0.9) }
  return { x: columnX, width: columnWidth, size }
}

/** Hauteur d'un segment : les puces et les numéros reculent le texte d'un retrait. */
function segHeight(seg: Segment, size: number, columnX: number, columnWidth: number): number {
  const g = segGeo(seg, size, columnX, columnWidth)
  const textWidth = seg.kind === 'bullet' || seg.kind === 'number' ? g.width - g.size * 1.3 : g.width
  const lines = seg.items.reduce((n, t) => n + countLines(t, g.size, textWidth), 0)
  return Math.ceil(lines * g.size * LINE_HEIGHT)
}

const gapAfter = (seg: Segment, size: number): number => Math.round(seg.kind === 'sub' ? size * 0.25 : size * 0.6)

const totalHeight = (segs: Segment[], size: number, columnX: number, columnWidth: number): number =>
  segs.reduce((h, s, i) => h + segHeight(s, size, columnX, columnWidth) + (i < segs.length - 1 ? gapAfter(s, size) : 0), 0)

/** Coupe un texte trop long pour une page en morceaux d'au plus `chars` caractères, aux espaces. */
function chunkText(text: string, chars: number): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > chars) {
    let cut = rest.lastIndexOf(' ', chars)
    if (cut < chars * 0.5) cut = chars
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/** Ce qui reste d'un segment une fois ses `n` premiers éléments placés (une liste numérotée garde sa numérotation). */
const rest = (seg: Segment, n: number): Segment => ({ ...seg, items: seg.items.slice(n), ...(seg.kind === 'number' ? { start: (seg.start ?? 1) + n } : {}) })

/**
 * Répartit des segments sur des pages de hauteur `room` à la taille `size` : on remplit la page, un segment de plusieurs éléments se
 * coupe entre deux éléments, un paragraphe trop long se coupe aux espaces.
 */
function paginate(segs: Segment[], size: number, columnX: number, columnWidth: number, room: number): Segment[][] {
  const pages: Segment[][] = []
  let page: Segment[] = []
  let used = 0
  const next = (): void => {
    if (page.length) pages.push(page)
    page = []
    used = 0
  }
  const queue = [...segs]
  while (queue.length) {
    const seg = queue.shift()!
    const gap = page.length ? gapAfter(page[page.length - 1], size) : 0
    const h = segHeight(seg, size, columnX, columnWidth)
    if (used + gap + h <= room) {
      page.push(seg)
      used += gap + h
      continue
    }
    // combien d'éléments tiennent encore ici ?
    let fit = 0
    for (let k = 1; k <= seg.items.length; k++) {
      if (used + gap + segHeight({ ...seg, items: seg.items.slice(0, k) }, size, columnX, columnWidth) <= room) fit = k
      else break
    }
    if (fit > 0 && fit < seg.items.length) {
      page.push({ ...seg, items: seg.items.slice(0, fit) })
      queue.unshift(rest(seg, fit))
      next()
    } else if (page.length) {
      queue.unshift(seg)
      next()
    } else if (seg.items.length > 1) {
      // une page vide ne peut pas accueillir même le premier élément : on le coupe
      queue.unshift(rest(seg, 1))
      queue.unshift({ ...seg, items: seg.items.slice(0, 1) })
    } else {
      // un seul élément plus haut qu'une page : coupé en morceaux qui tiennent chacun
      const g = segGeo(seg, size, columnX, columnWidth)
      const perLine = Math.max(1, Math.floor((seg.kind === 'para' || seg.kind === 'sub' ? g.width : g.width - g.size * 1.3) / (g.size * CHAR_W)))
      const maxLines = Math.max(1, Math.floor(room / (g.size * LINE_HEIGHT)))
      const parts = chunkText(seg.items[0], Math.max(20, Math.floor(perLine * maxLines * 0.85)))
      if (parts.length <= 1) {
        page.push(seg) // introuvable : on le garde tel quel plutôt que de boucler
        next()
      } else queue.unshift(...parts.map((p) => ({ ...seg, items: [p] })))
    }
  }
  next()
  return pages
}

// ───────────────────────── éléments ─────────────────────────

const base = { rotation: 0, opacity: 1 }

function text(x: number, y: number, width: number, value: string, size: number, fill: string, height: number, extra: Partial<TrameElement> = {}): TrameElement {
  return { id: nanoid(8), type: 'text', x, y, width, height, ...base, fill, text: value, fontSize: size, fontFamily: FONT, fontStyle: 'normal', align: 'left', lineHeight: LINE_HEIGHT, ...extra }
}

const bar = (theme: ImportTheme): TrameElement => ({ id: nanoid(8), type: 'rect', x: 0, y: 0, width: 48, height: H, ...base, fill: COLORS[theme].bar })

/** Taille du titre d'une page : la plus grande qui tient sur deux lignes. */
function titleSize(title: string): number {
  for (const s of [80, 68, 56, 48]) if (countLines(title, s, CONTENT_W) <= 2) return s
  return 44
}

/** Page « titre seul » : couverture du document ou début de section. */
function sectionPage(title: string, options: ImportOptions): TramePage {
  const c = COLORS[options.theme]
  let size = 64
  for (const s of [120, 104, 88, 72]) {
    if (countLines(title, s, CONTENT_W - 100) <= 3) {
      size = s
      break
    }
  }
  const lines = Math.min(4, countLines(title, size, CONTENT_W - 100))
  const height = Math.ceil(lines * size * 1.15)
  return { id: nanoid(8), background: c.section, elements: [bar(options.theme), text(MARGIN_X, Math.round((H - height) / 2), CONTENT_W - 100, title, size, c.title, height, { fontStyle: 'bold', lineHeight: 1.15 })] }
}

interface Img {
  src: string
  alt?: string
  ratio: number
}

/** Place des images dans un cadre : chacune dans sa case, à ses proportions, centrée. */
function placeImages(images: Img[], box: { x: number; y: number; width: number; height: number }, rowLayout: boolean): TrameElement[] {
  const n = images.length
  const gap = 32
  const out: TrameElement[] = []
  images.forEach((img, i) => {
    const cell = rowLayout
      ? { x: box.x + ((box.width - gap * (n - 1)) / n + gap) * i, y: box.y, width: (box.width - gap * (n - 1)) / n, height: box.height }
      : { x: box.x, y: box.y + ((box.height - gap * (n - 1)) / n + gap) * i, width: box.width, height: (box.height - gap * (n - 1)) / n }
    const ratio = img.ratio > 0 && Number.isFinite(img.ratio) ? img.ratio : 4 / 3
    const w = Math.min(cell.width, cell.height * ratio)
    const h = w / ratio
    out.push({
      id: nanoid(8),
      type: 'image',
      x: Math.round(cell.x + (cell.width - w) / 2),
      // à côté du texte, l'image part du haut comme lui ; seule, ou en rangée, elle est centrée dans sa case
      y: Math.round(rowLayout ? cell.y + (cell.height - h) / 2 : cell.y),
      width: Math.round(w),
      height: Math.round(h),
      ...base,
      fill: '#000000',
      src: img.src,
      ...(img.alt ? { alt: img.alt } : {})
    })
  })
  return out
}

const MAX_IMAGES_BESIDE_TEXT = 3

function contentPages(group: Group, options: ImportOptions): TramePage[] {
  const c = COLORS[options.theme]
  const segs = segments(group.body)
  const allImages: Img[] = group.body.filter((b): b is Extract<BodyBlock, { kind: 'image' }> => b.kind === 'image').map((b) => ({ src: b.src, alt: b.alt, ratio: b.ratio ?? 4 / 3 }))

  const title = group.title ? group.title.slice(0, 200) : null
  const tSize = title ? titleSize(title) : 0
  const titleHeight = title ? Math.ceil(Math.min(3, countLines(title, tSize, CONTENT_W)) * tSize * 1.15) : 0
  const bodyTop = title ? TOP + titleHeight + 48 : TOP
  const room = H - BOTTOM - bodyTop

  // texte et images côte à côte quand il y en a ; une page d'images seules les étale
  const withText = segs.length > 0
  const beside = withText ? allImages.slice(0, MAX_IMAGES_BESIDE_TEXT) : []
  const columnW = beside.length ? TEXT_W_WITH_IMAGES : CONTENT_W
  const extraImages = withText ? allImages.slice(MAX_IMAGES_BESIDE_TEXT) : allImages

  let textPages: Segment[][] = []
  let size = SPLIT_SIZE
  if (withText) {
    const fit = BODY_SIZES.find((s) => totalHeight(segs, s, MARGIN_X, columnW) <= room)
    if (fit) {
      size = fit
      textPages = [segs]
    } else textPages = paginate(segs, SPLIT_SIZE, MARGIN_X, columnW, room)
  }

  const pages: TramePage[] = []
  const heading = (n: number): TrameElement | null =>
    title ? text(MARGIN_X, TOP, CONTENT_W, n === 0 ? title : `${title} (${options.continued})`, tSize, c.title, titleHeight, { fontStyle: 'bold', lineHeight: 1.15 }) : null

  textPages.forEach((page, n) => {
    const els: TrameElement[] = [bar(options.theme)]
    const h = heading(n)
    if (h) els.push(h)
    let y = bodyTop
    page.forEach((seg, i) => {
      const g = segGeo(seg, size, MARGIN_X, columnW)
      const sh = segHeight(seg, size, MARGIN_X, columnW)
      const isSub = seg.kind === 'sub'
      els.push(
        text(g.x, y, g.width, segText(seg), g.size, isSub ? c.accent : c.body, sh, {
          ...(seg.kind === 'bullet' ? { list: 'bullet' as const } : seg.kind === 'number' && !(seg.start && seg.start > 1) ? { list: 'number' as const } : {}),
          ...(isSub ? { fontStyle: 'bold' } : {})
        })
      )
      y += sh + (i < page.length - 1 ? gapAfter(seg, size) : 0)
    })
    if (n === 0 && beside.length) els.push(...placeImages(beside, { x: IMAGE_COL_X, y: bodyTop, width: IMAGE_COL_W, height: room }, false))
    pages.push({ id: nanoid(8), background: c.bg, elements: els })
  })

  // images sans texte à côté : une page, ou une page par groupe de deux
  for (let i = 0; i < extraImages.length; i += withText ? 1 : 2) {
    const chunk = extraImages.slice(i, i + (withText ? 1 : 2))
    const els: TrameElement[] = [bar(options.theme)]
    const h = heading(pages.length)
    if (h) els.push(h)
    els.push(...placeImages(chunk, { x: MARGIN_X, y: bodyTop, width: CONTENT_W, height: room }, true))
    pages.push({ id: nanoid(8), background: c.bg, elements: els })
  }
  return pages
}

/**
 * Niveau de titre qui découpe le mieux : le plus haut qui donne au moins quatre pages ; sinon le plus haut qui donne autant de pages
 * que le niveau 3 (inutile de descendre plus bas que le dernier niveau de titre utilisé).
 */
export function suggestLevel(outline: Outline): CutLevel {
  const count = (max: number): number => outline.blocks.filter((b) => b.kind === 'heading' && b.level <= max).length
  for (const l of [1, 2, 3] as const) if (count(l) >= 4) return l
  const most = count(3)
  if (most === 0) return 1
  for (const l of [1, 2, 3] as const) if (count(l) === most) return l
  return 3
}

/** Plan → document de diapositives 16:9 : une page par titre du niveau choisi (ou par saut de page), le texte réparti dessous. */
export function outlineToDocument(outline: Outline, options: ImportOptions): ImportResult {
  const pages: TramePage[] = []
  for (const group of groupBlocks(outline, options)) {
    if (group.title !== null && group.body.length === 0) pages.push(sectionPage(group.title.slice(0, 200), options))
    else pages.push(...contentPages(group, options))
    if (pages.length > MAX_PAGES) break
  }
  const truncated = pages.length > MAX_PAGES
  if (!pages.length) pages.push({ id: nanoid(8), background: COLORS[options.theme].bg, elements: [bar(options.theme)] })
  return { doc: { version: 2, name: options.name, width: W, height: H, pages: pages.slice(0, MAX_PAGES) }, pages: Math.min(pages.length, MAX_PAGES), truncated }
}
