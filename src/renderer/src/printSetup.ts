import { boundsOf } from '@/geometry'
import type { TrameDocument, TramePage } from '@/types'

/** Réglages d'impression professionnelle d'un document : fond perdu, marge de sécurité, traits de coupe. */
export interface PrintSetup {
  /** fond perdu en mm : le PDF s'agrandit de cette largeur sur chaque côté et le fond, les images qui dépassent y sont dessinés */
  bleedMm: number
  /** marge de sécurité en mm : ce qui est important (le texte) reste à l'intérieur ; repère affiché dans l'éditeur, jamais exporté */
  safeMm: number
  /** traits de coupe et d'assemblage dans le PDF */
  marks: boolean
}

export const PRINT_LIMITS = { bleedMm: { min: 0, max: 10 }, safeMm: { min: 0, max: 30 } } as const

export const NO_PRINT_SETUP: PrintSetup = { bleedMm: 0, safeMm: 0, marks: false }

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Pixels de design par mm (96 dpi, comme les formats de page de Trame). */
export const PX_PER_MM = 96 / 25.4
const PT_MM = 72 / 25.4

export const mmToPx = (mm: number): number => mm * PX_PER_MM

/** Réglages d'un document (valeurs par défaut quand il n'en a pas). */
export const printSetupOf = (doc: Pick<TrameDocument, 'print'>): PrintSetup => ({ ...NO_PRINT_SETUP, ...doc.print })

/** Vrai quand le PDF diffère d'un export ordinaire (fond perdu ou traits de coupe). */
export const hasPrintMarks = (s: PrintSetup): boolean => s.bleedMm > 0 || s.marks

/** Nettoyage à la lecture : valeurs hors bornes ramenées dans les bornes, réglage neutre retiré. Modifie en place. */
export function sanitizePrintSetup(doc: { print?: unknown }): void {
  const p = doc.print as Partial<Record<keyof PrintSetup, unknown>> | undefined
  if (p === undefined) return
  const num = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, min, max) * 100) / 100 : 0)
  const clean: PrintSetup = {
    bleedMm: num(p?.bleedMm, PRINT_LIMITS.bleedMm.min, PRINT_LIMITS.bleedMm.max),
    safeMm: num(p?.safeMm, PRINT_LIMITS.safeMm.min, PRINT_LIMITS.safeMm.max),
    marks: p?.marks === true
  }
  if (clean.bleedMm || clean.safeMm || clean.marks) doc.print = clean
  else delete doc.print
}

/** Zone de sécurité de la page (pixels de design) ; null sans marge ou si la marge ne laisse rien. */
export function safeBox(doc: Pick<TrameDocument, 'width' | 'height'>, setup: PrintSetup): { x: number; y: number; width: number; height: number } | null {
  const m = mmToPx(setup.safeMm)
  if (m <= 0 || doc.width - 2 * m <= 0 || doc.height - 2 * m <= 0) return null
  return { x: m, y: m, width: doc.width - 2 * m, height: doc.height - 2 * m }
}

/** Textes dont la boîte sort de la zone de sécurité (les fonds et images « pleine page » sortent exprès : ils ne comptent pas). */
export function textsOutsideSafe(page: TramePage, doc: Pick<TrameDocument, 'width' | 'height'>, setup: PrintSetup): string[] {
  const safe = safeBox(doc, setup)
  if (!safe) return []
  const eps = 0.5
  return page.elements
    .filter((e) => e.type === 'text' && !e.hidden)
    .filter((e) => {
      const b = boundsOf(e)
      return b.x < safe.x - eps || b.y < safe.y - eps || b.x + b.width > safe.x + safe.width + eps || b.y + b.height > safe.y + safe.height + eps
    })
    .map((e) => e.id)
}

/** Longueur d'un trait de coupe et distance minimale entre le trait et le bord fini, en mm. */
export const MARK_LENGTH_MM = 5
export const MARK_MIN_OFFSET_MM = 2

/** Géométrie d'une page de PDF avec fond perdu et traits de coupe (points). L'origine du dessin de la page se place à (`margin`, `margin`). */
export interface PdfPageLayout {
  /** fond perdu, distance des traits au bord fini, marge totale autour du bord fini */
  bleed: number
  markOffset: number
  margin: number
  width: number
  height: number
}

export function pdfPageLayout(widthPt: number, heightPt: number, setup: PrintSetup): PdfPageLayout {
  const bleed = setup.bleedMm * PT_MM
  const markOffset = Math.max(bleed, MARK_MIN_OFFSET_MM * PT_MM)
  const margin = setup.marks ? markOffset + MARK_LENGTH_MM * PT_MM : bleed
  return { bleed, markOffset, margin, width: widthPt + 2 * margin, height: heightPt + 2 * margin }
}


/**
 * Traits de coupe : à chaque coin, un trait horizontal et un vertical qui partent à `markOffset` du bord fini et vont vers l'extérieur.
 * Segments [x1, y1, x2, y2] dans le repère de la page de PDF (origine en bas à gauche).
 */
export function cropMarkSegments(widthPt: number, heightPt: number, layout: PdfPageLayout): Array<[number, number, number, number]> {
  const m = layout.margin
  const o = layout.markOffset
  const len = MARK_LENGTH_MM * PT_MM
  const left = m
  const right = m + widthPt
  const bottom = m
  const top = m + heightPt
  const out: Array<[number, number, number, number]> = []
  for (const x of [left, right]) {
    const dir = x === left ? -1 : 1
    for (const y of [bottom, top]) {
      out.push([x + dir * o, y, x + dir * (o + len), y]) // horizontal, hors de la page
      const vdir = y === bottom ? -1 : 1
      out.push([x, y + vdir * o, x, y + vdir * (o + len)]) // vertical, hors de la page
    }
  }
  return out
}
