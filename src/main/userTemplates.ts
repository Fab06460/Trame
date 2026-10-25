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
}

/** L'identifiant sert de nom de fichier : on n'accepte que des caractères sûrs (aucun `/`, `..`, etc.). */
export const isValidId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)

export function normalizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
  return name || 'Sans titre'
}

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
    thumbnail: t
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
