/** Géométrie d'une feuille à imprimer : les pages d'un document sont en pixels de design à 96 points par pouce. */
export const PX_PER_INCH = 96
const MM_PER_INCH = 25.4

export const pxToMm = (px: number): number => (px * MM_PER_INCH) / PX_PER_INCH

export interface SheetGeometry {
  widthMm: number
  heightMm: number
  /** la feuille est plus large que haute */
  landscape: boolean
  /** dimensions en microns, orientation portrait (celle que le système attend avec l'indicateur « paysage ») */
  portraitMicrons: { width: number; height: number }
}

/** Formats de papier courants (largeur × hauteur en mm, portrait) : une feuille à moins de 0,6 mm de l'un d'eux est ramenée à sa taille exacte, que l'imprimante reconnaît. */
const STANDARD_PAPERS: Array<[number, number]> = [[297, 420], [210, 297], [148, 210], [215.9, 279.4], [215.9, 355.6], [279.4, 431.8]]
const SNAP_MM = 0.6

function snapToPaper(widthMm: number, heightMm: number): [number, number] {
  const [short, long] = [Math.min(widthMm, heightMm), Math.max(widthMm, heightMm)]
  const hit = STANDARD_PAPERS.find(([w, h]) => Math.abs(w - short) <= SNAP_MM && Math.abs(h - long) <= SNAP_MM)
  if (!hit) return [widthMm, heightMm]
  return widthMm > heightMm ? [hit[1], hit[0]] : [hit[0], hit[1]]
}

/** Taille de feuille à demander au système d'impression pour des pages de `widthPx` × `heightPx`. Null si les dimensions sont absurdes. */
export function sheetGeometry(widthPx: unknown, heightPx: unknown): SheetGeometry | null {
  if (typeof widthPx !== 'number' || typeof heightPx !== 'number' || !Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return null
  if (widthPx < 50 || heightPx < 50 || widthPx > 20000 || heightPx > 20000) return null
  const [widthMm, heightMm] = snapToPaper(Math.round(pxToMm(widthPx) * 1000) / 1000, Math.round(pxToMm(heightPx) * 1000) / 1000)
  const landscape = widthMm > heightMm
  const short = Math.round(Math.min(widthMm, heightMm) * 1000)
  const long = Math.round(Math.max(widthMm, heightMm) * 1000)
  return { widthMm, heightMm, landscape, portraitMicrons: { width: short, height: long } }
}

export type Duplex = 'simplex' | 'shortEdge' | 'longEdge'
export const isDuplex = (v: unknown): v is Duplex => v === 'simplex' || v === 'shortEdge' || v === 'longEdge'
