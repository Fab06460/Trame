import type { TrameDocument } from '@/types'

/** PDF d'origine conservé dans le document (base64) au-delà de cette taille, l'export retombe sur l'image de fond. */
export const MAX_SOURCE_CHARS = 55_000_000

/** Retire des `sources` celles qu'aucun élément ne référence (pages supprimées, fonds remplacés) : elles alourdiraient le fichier pour rien. */
export function pruneSources(doc: TrameDocument): TrameDocument {
  if (!doc.sources) return doc
  const used = new Set<string>()
  for (const p of doc.pages) for (const e of p.elements) if (e.pdfSource) used.add(e.pdfSource.id)
  const kept = Object.fromEntries(Object.entries(doc.sources).filter(([id]) => used.has(id)))
  const { sources: _drop, ...rest } = doc
  void _drop
  return Object.keys(kept).length ? { ...rest, sources: kept } : rest
}

/** Nettoyage à la lecture : références et sources invalides retirées (jamais devinées). Modifie en place. */
export function sanitizeSources(doc: { sources?: unknown; pages: Array<{ elements: Array<Record<string, unknown>> }> }): void {
  const raw = doc.sources
  let clean: Record<string, string> | undefined
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>).filter(([id, v]) => id.length > 0 && id.length <= 40 && typeof v === 'string' && v.length > 0 && v.length <= MAX_SOURCE_CHARS)
    if (entries.length) clean = Object.fromEntries(entries) as Record<string, string>
  }
  if (clean) doc.sources = clean
  else delete doc.sources
  for (const p of doc.pages) {
    for (const e of p.elements) {
      const s = e.pdfSource as { id?: unknown; page?: unknown } | undefined
      if (s === undefined) continue
      if (e.type !== 'image' || !s || typeof s.id !== 'string' || !Number.isInteger(s.page) || (s.page as number) < 1) delete e.pdfSource
      else e.pdfSource = { id: s.id, page: s.page }
    }
  }
}
