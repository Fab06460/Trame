import { tm } from './i18n'
/** Modèles de l'utilisateur : logique pure (les lectures/écritures de fichiers sont dans index.ts). */

export const MAX_NAME = 60
/** Une miniature est une petite image : au-delà, c'est qu'il y a un problème */
export const MAX_THUMBNAIL_CHARS = 600_000

export interface TemplateMeta {
  id: string
  name: string
  createdAt: number
  width: number
  height: number
  pageCount: number
  /** data URL de la première page (JPEG réduit), pour l'aperçu sans charger le document */
  thumbnail: string
  /** identifiant du modèle intégré que celui-ci remplace (version personnalisée) ; le modèle d'origine est alors masqué */
  basedOn?: string
}

/** L'identifiant sert de nom de fichier : on n'accepte que des caractères sûrs (aucun `/`, `..`, etc.). */
export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)

export function normalizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
  return name || tm('doc.untitled')
}

/** Identifiant d'un modèle intégré (ceux de templates.ts : minuscules, chiffres, tirets). */
export const isBuiltinId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)

const isPositiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

/** Vérifie et normalise les métadonnées envoyées par le renderer ; retourne null si inutilisables. */
export function sanitizeMeta(input: any, id: string, now: number): TemplateMeta | null {
  if (!input || !isPositiveInt(input.width) || !isPositiveInt(input.height) || !isPositiveInt(input.pageCount)) return null
  const t = input.thumbnail
  if (typeof t !== 'string' || !t.startsWith('data:image/') || t.length > MAX_THUMBNAIL_CHARS) return null
  return {
    id,
    name: normalizeName(input.name),
    createdAt: now,
    width: input.width,
    height: input.height,
    pageCount: input.pageCount,
    thumbnail: t,
    ...(isBuiltinId(input.basedOn) ? { basedOn: input.basedOn } : {})
  }
}

export function parseTemplateIndex(raw: string): TemplateMeta[] {
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.flatMap((e) => {
      if (!isValidId(e?.id) || !Number.isFinite(e.createdAt)) return []
      const meta = sanitizeMeta(e, e.id, e.createdAt)
      return meta ? [meta] : []
    })
  } catch {
    return []
  }
}

export const addMeta = (list: TemplateMeta[], meta: TemplateMeta): TemplateMeta[] => [
  meta,
  ...list.filter((m) => m.id !== meta.id)
]

export const removeMeta = (list: TemplateMeta[], id: string): TemplateMeta[] => list.filter((m) => m.id !== id)

/** Renomme un modèle ; la liste est inchangée si l'identifiant n'existe pas. */
export const renameMeta = (list: TemplateMeta[], id: string, name: unknown): TemplateMeta[] =>
  list.map((m) => (m.id === id ? { ...m, name: normalizeName(name) } : m))

/**
 * Remplace un modèle existant en gardant son identité (identifiant, date de création, modèle intégré remplacé).
 * `null` si l'identifiant est inconnu ou si les nouvelles métadonnées sont invalides.
 */
export function replaceMeta(list: TemplateMeta[], id: string, input: unknown): TemplateMeta[] | null {
  const old = list.find((m) => m.id === id)
  if (!old) return null
  const fresh = sanitizeMeta({ ...(input as object), basedOn: old.basedOn ?? (input as { basedOn?: unknown })?.basedOn }, id, old.createdAt)
  return fresh ? addMeta(list, fresh) : null
}

// ── Modèles intégrés masqués ──────────────────────────────────────────────────────────────────────────────
/** Lit la liste des modèles intégrés masqués ; tout contenu illisible donne une liste vide. */
export function parseHidden(raw: string): string[] {
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? [...new Set(data.filter(isBuiltinId))] : []
  } catch {
    return []
  }
}

export const addHidden = (list: string[], id: string): string[] => (list.includes(id) ? list : [...list, id])

/** Modèles intégrés à afficher : ni masqués par l'utilisateur, ni remplacés par une de ses versions personnalisées. */
export function visibleBuiltins<T extends { id: string }>(builtins: T[], hidden: string[], userTemplates: Array<{ basedOn?: string }>): T[] {
  const replaced = new Set(userTemplates.map((t) => t.basedOn).filter(Boolean))
  return builtins.filter((b) => !hidden.includes(b.id) && !replaced.has(b.id))
}

// ── Packs de modèles (un fichier .tramepack qui réunit plusieurs modèles pour les partager) ───────────────────
export const PACK_FORMAT = 'trame-template-pack'
export const PACK_EXTENSION = 'tramepack'
/** Au plus autant de modèles par pack : au-delà, c'est autre chose qu'un pack de modèles. */
export const MAX_PACK_TEMPLATES = 100
/** Document d'un modèle : même borne que l'enregistrement d'un modèle (voir `templates:save`). */
export const MAX_PACK_DOCUMENT_CHARS = 64 * 1024 * 1024

export interface PackEntry {
  meta: Pick<TemplateMeta, 'name' | 'width' | 'height' | 'pageCount' | 'thumbnail'>
  /** document du modèle (JSON `.trame`) */
  json: string
}

/**
 * Contenu d'un pack : nom, taille, miniature et document de chaque modèle. L'identifiant, la date et le modèle intégré remplacé
 * (`basedOn`) ne sont pas repris : ils n'ont de sens que sur le poste d'origine.
 */
export function buildPack(entries: PackEntry[]): string {
  const templates = entries.flatMap((e) => {
    try {
      const { name, width, height, pageCount, thumbnail } = e.meta
      return [{ name, width, height, pageCount, thumbnail, document: JSON.parse(e.json) }]
    } catch {
      return [] // document illisible : on ne l'embarque pas
    }
  })
  return JSON.stringify({ format: PACK_FORMAT, version: 1, templates })
}

/**
 * Lit un pack. `null` si ce n'est pas un pack de Trame ; sinon les modèles valides (métadonnées assainies, document de pages
 * non vide) et le nombre de ceux qui ont été écartés (illisibles, trop lourds, au-delà de la limite).
 */
export function parsePack(raw: string): { entries: PackEntry[]; skipped: number } | null {
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || data.format !== PACK_FORMAT || !Array.isArray(data.templates)) return null
  const entries: PackEntry[] = []
  let skipped = 0
  for (const item of data.templates.slice(0, MAX_PACK_TEMPLATES)) {
    const meta = sanitizeMeta(item, 'pack-entry', 0)
    const doc = item?.document
    if (!meta || !doc || typeof doc !== 'object' || !Array.isArray(doc.pages) || doc.pages.length === 0) {
      skipped++
      continue
    }
    const json = JSON.stringify(doc)
    if (json.length > MAX_PACK_DOCUMENT_CHARS) {
      skipped++
      continue
    }
    entries.push({ meta: { name: meta.name, width: meta.width, height: meta.height, pageCount: meta.pageCount, thumbnail: meta.thumbnail }, json })
  }
  return { entries, skipped: skipped + Math.max(0, data.templates.length - MAX_PACK_TEMPLATES) }
}
