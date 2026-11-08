import { nanoid } from 'nanoid'
import { PX_PER_MM, pageInBox, sheetSize } from '@/mergeSheets'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/**
 * Notes de l'orateur et polycopiés en PDF : deux mises en page, fabriquées comme des « feuilles » (pages à la taille du papier où les
 * diapositives sont réduites, comme pour le livret) que l'export PDF ordinaire écrit : les textes restent du vrai texte.
 * - `notes` : une diapositive par feuille portrait, ses notes de l'orateur en dessous (suite sur d'autres feuilles si elles sont longues) ;
 * - `lines` : 2, 3, 4 ou 6 diapositives par feuille portrait, avec des lignes pour que l'auditoire prenne ses notes.
 */
export type HandoutLayout = 'notes' | 'lines'
export type HandoutPaper = 'a4' | 'letter'

export const LINES_PER_PAGE = [2, 3, 4, 6] as const

export interface HandoutOptions {
  layout: HandoutLayout
  paper: HandoutPaper
  /** diapositives par feuille (mise en page `lines`) */
  perPage: (typeof LINES_PER_PAGE)[number]
  /** cadre fin autour de chaque diapositive (utile pour un fond blanc) */
  border: boolean
}

export interface HandoutLabels {
  /** titre de la zone de notes */
  notes: string
  /** ajouté au numéro d'une feuille qui continue les notes de la précédente */
  continued: string
}

/** Hauteur (px de design) qu'occupe un texte de la taille de police donnée, une fois mis en forme dans la largeur donnée. */
export type Measure = (text: string, fontSize: number, width: number) => number

export interface HandoutResult {
  doc: TrameDocument
  /** nombre de feuilles du PDF */
  sheets: number
  /** feuilles ajoutées pour des notes trop longues pour tenir sous la diapositive */
  continued: number
}

const MARGIN = Math.round(15 * PX_PER_MM)
const HEADER = 22
const INK = '#1e1f24'
const GREY = '#6b7280'
const RULE = '#c3c8d0'
const FRAME = '#9aa0aa'
const FONT = '"Inter", sans-serif'
/** tailles essayées pour des notes, de la plus grande à la plus petite */
const NOTE_SIZES = [15, 14, 13, 12, 11, 10]
const NOTE_LINE_HEIGHT = 1.35
const LINE_STEP = 24

const el = (props: Partial<TrameElement> & Pick<TrameElement, 'type' | 'x' | 'y' | 'width' | 'height'>): TrameElement => ({ id: nanoid(8), rotation: 0, opacity: 1, fill: INK, ...props }) as TrameElement
const rect = (x: number, y: number, width: number, height: number, fill: string): TrameElement => el({ type: 'rect', x, y, width, height, fill })
const label = (x: number, y: number, width: number, value: string, fontSize: number, extra: Partial<TrameElement> = {}): TrameElement =>
  el({ type: 'text', x, y, width, height: Math.ceil(fontSize * 1.3), text: value, fontSize, fontFamily: FONT, fontStyle: 'normal', align: 'left', fill: GREY, ...extra })

/** Quatre filets fins autour d'un cadre. */
const frame = (x: number, y: number, w: number, h: number): TrameElement[] => [rect(x - 1, y - 1, w + 2, 1, FRAME), rect(x - 1, y + h, w + 2, 1, FRAME), rect(x - 1, y, 1, h, FRAME), rect(x + w, y, 1, h, FRAME)]

/** Des lignes à remplir à la main, de `from` à `to` (px), dans la largeur donnée. */
function ruledLines(x: number, width: number, from: number, to: number): TrameElement[] {
  const out: TrameElement[] = []
  for (let y = from; y <= to; y += LINE_STEP) out.push(rect(x, y, width, 0.75, RULE))
  return out
}

/** La plus grande taille de `NOTE_SIZES` où le texte tient dans la hauteur donnée, ou null s'il n'en tient aucune. */
function fittingSize(text: string, width: number, height: number, measure: Measure): number | null {
  return NOTE_SIZES.find((size) => measure(text, size, width) <= height) ?? null
}

/** Coupe un texte au dernier mot qui tient dans la hauteur donnée à cette taille : [début, reste]. Au moins un mot par morceau. */
function splitToFit(text: string, size: number, width: number, height: number, measure: Measure): [string, string] {
  const tokens = text.split(/(\s+)/)
  const head = (k: number): string => tokens.slice(0, k).join('').trimEnd()
  let lo = 1
  let hi = tokens.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(head(mid), size, width) <= height) lo = mid
    else hi = mid - 1
  }
  return [head(lo), tokens.slice(lo).join('').trimStart()]
}

/** Les morceaux de notes d'une page : le premier sous la diapositive (hauteur `firstHeight`), les suivants sur des feuilles entières. */
export function noteChunks(text: string, width: number, firstHeight: number, nextHeight: number, measure: Measure): Array<{ text: string; size: number }> {
  const chunks: Array<{ text: string; size: number }> = []
  let rest = text.trim()
  let height = firstHeight
  for (let guard = 0; rest && guard < 40; guard++) {
    const size = fittingSize(rest, width, height, measure)
    if (size !== null) {
      chunks.push({ text: rest, size })
      break
    }
    const minimum = NOTE_SIZES[NOTE_SIZES.length - 1]
    const [head, tail] = splitToFit(rest, minimum, width, height, measure)
    chunks.push({ text: head, size: minimum })
    rest = tail
    height = nextHeight
  }
  return chunks
}

const header = (doc: TrameDocument, width: number, right: string): TrameElement[] => [
  label(MARGIN, MARGIN, width, doc.name, 10, { fontStyle: 'bold' }),
  label(MARGIN, MARGIN, width, right, 10, { align: 'right' })
]

function notesSheets(doc: TrameDocument, options: HandoutOptions, labels: HandoutLabels, measure: Measure, size: { width: number; height: number }): { pages: TramePage[]; continued: number } {
  const innerW = size.width - 2 * MARGIN
  const top = MARGIN + HEADER
  const slideMaxH = (size.height - MARGIN - top) * 0.48
  const s = Math.min(innerW / doc.width, slideMaxH / doc.height)
  const slideW = doc.width * s
  const slideH = doc.height * s
  const slideX = MARGIN + (innerW - slideW) / 2
  const notesTop = top + slideH + 22
  const bottom = size.height - MARGIN
  const firstHeight = bottom - (notesTop + 20)
  const nextHeight = bottom - (top + 4)
  const pages: TramePage[] = []
  let continued = 0
  for (const [index, page] of doc.pages.entries()) {
    const counter = `${index + 1} / ${doc.pages.length}`
    const elements: TrameElement[] = [...header(doc, innerW, counter), ...pageInBox(page, doc, { x: slideX, y: top, width: slideW, height: slideH }).elements]
    if (options.border) elements.push(...frame(slideX, top, slideW, slideH))
    elements.push(label(MARGIN, notesTop, innerW, labels.notes, 11, { fontStyle: 'bold' }))
    const chunks = page.notes ? noteChunks(page.notes, innerW, firstHeight, nextHeight, measure) : []
    if (chunks.length === 0) elements.push(...ruledLines(MARGIN, innerW, notesTop + 44, bottom))
    else elements.push(el({ type: 'text', x: MARGIN, y: notesTop + 20, width: innerW, height: firstHeight, text: chunks[0].text, fontSize: chunks[0].size, fontFamily: FONT, fontStyle: 'normal', align: 'left', lineHeight: NOTE_LINE_HEIGHT }))
    pages.push({ id: nanoid(8), background: '#ffffff', elements })
    for (const chunk of chunks.slice(1)) {
      continued++
      pages.push({
        id: nanoid(8),
        background: '#ffffff',
        elements: [
          ...header(doc, innerW, `${counter} · ${labels.continued}`),
          el({ type: 'text', x: MARGIN, y: top + 4, width: innerW, height: nextHeight, text: chunk.text, fontSize: chunk.size, fontFamily: FONT, fontStyle: 'normal', align: 'left', lineHeight: NOTE_LINE_HEIGHT })
        ]
      })
    }
  }
  return { pages, continued }
}

function linesSheets(doc: TrameDocument, options: HandoutOptions, size: { width: number; height: number }): TramePage[] {
  const n = options.perPage
  const innerW = size.width - 2 * MARGIN
  const top = MARGIN + HEADER
  const innerH = size.height - MARGIN - top
  const pages: TramePage[] = []
  for (let first = 0; first < doc.pages.length; first += n) {
    const group = doc.pages.slice(first, first + n)
    const last = first + group.length
    const elements: TrameElement[] = header(doc, innerW, `${first + 1}${last > first + 1 ? `–${last}` : ''} / ${doc.pages.length}`)
    if (n <= 4) {
      // une colonne de diapositives à gauche, des lignes à droite de chacune
      const numberW = 22
      const rowH = innerH / n
      const colW = innerW * 0.46 - numberW
      for (const [k, page] of group.entries()) {
        const s = Math.min(colW / doc.width, (rowH - 16) / doc.height)
        const w = doc.width * s
        const h = doc.height * s
        const x = MARGIN + numberW
        const y = top + k * rowH + 4
        elements.push(...pageInBox(page, doc, { x, y, width: w, height: h }).elements)
        if (options.border) elements.push(...frame(x, y, w, h))
        elements.push(label(MARGIN, y, numberW - 6, String(first + k + 1), 11, { align: 'right' }))
        elements.push(...ruledLines(x + w + 24, MARGIN + innerW - (x + w + 24), y + LINE_STEP, y + h))
      }
    } else {
      // deux colonnes de trois : la diapositive, puis des lignes en dessous
      const gap = 24
      const cellW = (innerW - gap) / 2
      const cellH = innerH / 3
      for (const [k, page] of group.entries()) {
        const col = k % 2
        const row = Math.floor(k / 2)
        const s = Math.min(cellW / doc.width, (cellH * 0.56) / doc.height)
        const w = doc.width * s
        const h = doc.height * s
        const x = MARGIN + col * (cellW + gap)
        const y = top + row * cellH + 4
        elements.push(...pageInBox(page, doc, { x, y, width: w, height: h }).elements)
        if (options.border) elements.push(...frame(x, y, w, h))
        elements.push(label(x, y + h + 4, cellW, String(first + k + 1), 10))
        elements.push(...ruledLines(x, cellW, y + h + 4 + LINE_STEP, top + (row + 1) * cellH - 6))
      }
    }
    pages.push({ id: nanoid(8), background: '#ffffff', elements })
  }
  return pages
}

/** Le document de feuilles à exporter en PDF. */
export function handoutDocument(doc: TrameDocument, options: HandoutOptions, labels: HandoutLabels, measure: Measure): HandoutResult {
  const size = sheetSize({ paper: options.paper, landscape: false })
  const { pages, continued } = options.layout === 'notes' ? notesSheets(doc, options, labels, measure, size) : { pages: linesSheets(doc, options, size), continued: 0 }
  const { print: _print, mailMerge: _merge, ...rest } = doc
  void _print
  void _merge
  return { doc: { ...rest, width: size.width, height: size.height, pages }, sheets: pages.length, continued }
}

/** Nombre de feuilles d'une mise en page « lignes » pour ce nombre de diapositives. */
export const linesSheetCount = (pageCount: number, perPage: number): number => Math.ceil(pageCount / Math.max(1, perPage))
