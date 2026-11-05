/**
 * Bibliothèque de médias locale : logique pure partagée entre le processus principal (lecture du dossier, étiquettes enregistrées)
 * et l'interface (recherche, filtre par étiquette). Aucune lecture de fichier ici.
 */

export const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] as const
/** Au plus autant d'images listées : au-delà, le dossier est trop gros pour une grille de vignettes. */
export const MAX_MEDIA_FILES = 3000
/** Profondeur de recherche dans les sous-dossiers (0 = le dossier seul). */
export const MAX_MEDIA_DEPTH = 4
/** Une image plus lourde n'est pas lue (le document la contiendrait en entier). */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024
export const MAX_TAG_LENGTH = 30
export const MAX_TAGS_PER_IMAGE = 20

export interface MediaItem {
  /** chemin relatif au dossier choisi, avec des « / » : c'est aussi la clé des étiquettes */
  path: string
  name: string
  size: number
  tags: string[]
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export const isMediaFile = (name: string): boolean => !name.startsWith('.') && (MEDIA_EXTENSIONS as readonly string[]).includes(extensionOf(name))

export function mediaMime(name: string): string {
  const ext = extensionOf(name)
  return ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
}

/** Un chemin relatif sûr : non vide, ni absolu, ni `..`, ni caractère nul ni antislash. Le renderer n'en fournit jamais d'autre. */
export function isSafeRelative(path: unknown): path is string {
  if (typeof path !== 'string' || path === '' || path.length > 1024) return false
  if (path.startsWith('/') || path.includes('\0') || path.includes('\\') || /^[A-Za-z]:/.test(path)) return false
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** Nom d'étiquette : espaces réduits, « # » de tête retiré, borné ; `null` s'il ne reste rien. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const tag = raw.trim().replace(/\s+/g, ' ').replace(/^#+\s*/, '').slice(0, MAX_TAG_LENGTH).trim()
  return tag || null
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Étiquettes nettoyées, sans doublon (casse et accents ignorés : la première graphie est gardée), en nombre borné. */
export function normalizeTags(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const tag = normalizeTag(raw)
    if (!tag || seen.has(fold(tag))) continue
    seen.add(fold(tag))
    out.push(tag)
    if (out.length >= MAX_TAGS_PER_IMAGE) break
  }
  return out
}

export interface MediaState {
  /** dossier choisi (chemin absolu), ou null */
  folder: string | null
  /** étiquettes par chemin relatif */
  tags: Record<string, string[]>
}

/** Relit l'état enregistré ; tout contenu illisible ou douteux est écarté. */
export function parseMediaState(raw: string): MediaState {
  try {
    const data = JSON.parse(raw)
    const folder = typeof data?.folder === 'string' && data.folder.length > 0 && data.folder.length < 4096 ? data.folder : null
    const tags: Record<string, string[]> = {}
    if (data?.tags && typeof data.tags === 'object' && !Array.isArray(data.tags))
      for (const [path, list] of Object.entries(data.tags)) {
        const clean = normalizeTags(list)
        if (isSafeRelative(path) && clean.length) tags[path] = clean
      }
    return { folder, tags }
  } catch {
    return { folder: null, tags: {} }
  }
}

/** Même état avec les étiquettes d'une image remplacées (entrée supprimée si la liste est vide). */
export function withTags(state: MediaState, path: string, tags: unknown): MediaState {
  const clean = normalizeTags(tags)
  const next = { ...state.tags }
  if (clean.length) next[path] = clean
  else delete next[path]
  return { ...state, tags: next }
}

/** Images dont le nom ou une étiquette contient chaque mot de `query` (et portant l'étiquette `tag` si fournie), triées par nom. */
export function searchMedia(items: MediaItem[], query: string, tag: string | null): MediaItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const wanted = tag ? fold(tag) : null
  return items
    .filter((m) => {
      if (wanted && !m.tags.some((t) => fold(t) === wanted)) return false
      const haystack = fold(`${m.path} ${m.tags.join(' ')}`)
      return words.every((w) => haystack.includes(w))
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
}

/** Étiquettes utilisées, les plus fréquentes d'abord. */
export function allTags(items: MediaItem[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const m of items)
    for (const t of m.tags) {
      const key = fold(t)
      const entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { tag: t, count: 1 })
    }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
