import { degrees, PDFDocument } from 'pdf-lib'

/**
 * Outils PDF (fusionner, réordonner, extraire, pivoter, scinder) : ce module ne touche ni au document ouvert ni au DOM. Il assemble de
 * nouveaux PDF à partir de pages de PDF existants (`pdf-lib` : les pages sont copiées telles quelles, texte et dessin restent vectoriels).
 * Ne sont PAS conservés : signets, champs de formulaire, étiquettes de page et métadonnées du PDF d'origine.
 */

/** Une page d'un PDF source, avec la rotation que l'utilisateur lui ajoute (par quarts de tour). */
export interface PageRef {
  /** identifiant du PDF source (clé de `sources`) */
  src: string
  /** position dans le PDF source, à partir de 0 */
  index: number
  /** rotation ajoutée, en degrés : 0, 90, 180 ou 270 */
  rotate: number
}

/** Au-delà, les miniatures et l'assemblage deviennent trop lourds pour une boîte de dialogue. */
export const MAX_TOOL_PAGES = 400

/** Ajoute `delta` degrés (multiple de 90) à une rotation, ramenée à 0, 90, 180 ou 270. */
export const turn = (rotate: number, delta: number): number => (((Math.round((rotate + delta) / 90) * 90) % 360) + 360) % 360

/** Déplace l'élément `from` à la place `to` (copie). Hors limites : liste inchangée. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const out = list.slice()
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item)
  return out
}

/**
 * Pages désignées par un texte comme « 1-3, 5, 8- » (numéros à partir de 1 ; « 8- » va jusqu'à la fin, « -3 » depuis le début). Retourne
 * les positions (à partir de 0) triées et sans doublon, ou null si le texte est vide, mal écrit ou ne désigne aucune page existante.
 */
export function parsePageRanges(text: string, total: number): number[] | null {
  const chosen = new Set<number>()
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)(?:(-)(\d*))?$/.exec(part)
    if (!m || (!m[1] && !m[3])) return null
    const from = m[1] ? Number(m[1]) : 1
    const to = m[2] ? (m[3] ? Number(m[3]) : total) : from
    if (from < 1 || to < from) return null
    for (let p = from; p <= Math.min(to, total); p++) chosen.add(p - 1)
  }
  return chosen.size ? [...chosen].sort((a, b) => a - b) : null
}

export type SplitMode = { kind: 'each' } | { kind: 'every'; n: number }

/** Groupes de positions (à partir de 0) pour scinder `total` pages : une page par fichier, ou tous les `n` pages. */
export function splitGroups(total: number, mode: SplitMode): number[][] {
  const size = mode.kind === 'each' ? 1 : Math.max(1, Math.floor(mode.n) || 1)
  const out: number[][] = []
  for (let i = 0; i < total; i += size) out.push(Array.from({ length: Math.min(size, total - i) }, (_, k) => i + k))
  return out
}

/** Nom du fichier n° `i` (à partir de 0) d'une scission en `count` fichiers : `Rapport-01.pdf`. */
export function partName(stem: string, i: number, count: number): string {
  return `${stem}-${String(i + 1).padStart(Math.max(2, String(count).length), '0')}.pdf`
}

/** Nombre de pages d'un PDF, ou une erreur claire (fichier illisible, protégé par un mot de passe). */
export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount()
}

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(/encrypt/i.test(msg) ? 'encrypted' : 'unreadable')
  }
}

/** Nouveau PDF fait des pages données, dans cet ordre (le même PDF source peut revenir plusieurs fois). */
export async function buildPdf(sources: Record<string, Uint8Array>, pages: PageRef[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const loaded = new Map<string, PDFDocument>()
  for (const ref of pages) {
    let doc = loaded.get(ref.src)
    if (!doc) {
      const bytes = sources[ref.src]
      if (!bytes) throw new Error('unreadable')
      doc = await load(bytes)
      loaded.set(ref.src, doc)
    }
    if (ref.index < 0 || ref.index >= doc.getPageCount()) throw new Error('unreadable')
    const [page] = await out.copyPages(doc, [ref.index])
    if (ref.rotate) page.setRotation(degrees(turn(page.getRotation().angle, ref.rotate)))
    out.addPage(page)
  }
  out.setProducer('Trame')
  out.setCreator('Trame')
  return out.save()
}
