import type { EmbeddedFont, TrameDocument } from '@/types'

/** Une police ajoutée pèse quelques dizaines de Ko ; au-delà de ces bornes un fichier est refusé plutôt que chargé. */
export const MAX_EMBEDDED_FONTS = 16
export const MAX_VARIANT_CHARS = 2_000_000
const VARIANTS = ['400', '700', '400-italic', '700-italic']
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,80}$/

/** Familles CSS utilisées par les textes d'un document. */
export function usedFamilies(doc: Pick<TrameDocument, 'pages'>): Set<string> {
  const out = new Set<string>()
  for (const p of doc.pages) for (const e of p.elements) if (e.type === 'text' && e.fontFamily) out.add(e.fontFamily)
  return out
}

interface Known {
  id: string
  name: string
  family: string
  category: string
  license: string
  data: Record<string, string>
}

/**
 * Ajoute au document les polices en ligne qu'il utilise (les polices embarquées dans l'application n'ont pas besoin de l'être) et
 * retire celles dont aucun texte ne se sert : le fichier s'affiche et s'exporte à l'identique sur un poste qui ne les a pas installées.
 */
export function embedFonts(doc: TrameDocument, known: Known[]): TrameDocument {
  const used = usedFamilies(doc)
  const fonts: Record<string, EmbeddedFont> = {}
  for (const k of known) {
    if (!used.has(k.family)) continue
    fonts[k.id] = { name: k.name, family: k.family, category: k.category, license: k.license, variants: k.data }
  }
  const { fonts: _drop, ...rest } = doc
  void _drop
  return Object.keys(fonts).length ? { ...rest, fonts } : rest
}

/** Nettoyage à la lecture : une entrée invalide est ignorée (jamais devinée). Modifie en place. */
export function sanitizeFonts(doc: { fonts?: unknown }): void {
  const raw = doc.fonts
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    delete doc.fonts
    return
  }
  const out: Record<string, EmbeddedFont> = {}
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_EMBEDDED_FONTS) break
    const f = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const variants: Record<string, string> = {}
    if (f.variants && typeof f.variants === 'object') {
      for (const [name, data] of Object.entries(f.variants as Record<string, unknown>)) {
        if (VARIANTS.includes(name) && typeof data === 'string' && data.length > 0 && data.length <= MAX_VARIANT_CHARS && /^[A-Za-z0-9+/=]+$/.test(data)) variants[name] = data
      }
    }
    const ok = SAFE_ID.test(id) && typeof f.name === 'string' && f.name.length > 0 && f.name.length <= 60 && !/["\\<>]/.test(f.name) && typeof f.family === 'string' && /^"[^"\\<>]{1,60}", [a-z-]+$/.test(f.family) && !!variants['400']
    if (ok) out[id] = { name: f.name as string, family: f.family as string, category: typeof f.category === 'string' ? f.category.slice(0, 20) : 'sans-serif', license: typeof f.license === 'string' ? f.license.slice(0, 40) : '', variants }
  }
  if (Object.keys(out).length) doc.fonts = out
  else delete doc.fonts
}
