/** Images d'un publipostage : un dossier choisi par l'utilisateur, des noms de fichiers dans une colonne du tableau. */

export const MERGE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

/** Taille maximale d'une image lue (octets). */
export const MAX_MERGE_IMAGE_BYTES = 25 * 1024 * 1024

/** Nombre de fichiers listés au plus dans un dossier. */
export const MAX_MERGE_IMAGE_FILES = 5000

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

export const extensionOf = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

export const isMergeImageFile = (name: string): boolean => (MERGE_IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name))

export const mergeImageMime = (name: string): string | null => MIME[extensionOf(name)] ?? null

/** Fichier du dossier désigné par une valeur du tableau : nom exact, sans tenir compte de la casse, ou sans extension (« ada » → « ada.jpg »). Un chemin est réduit à son nom : on ne sort jamais du dossier. */
export function matchImageFile(files: readonly string[], value: string): string | null {
  const name = value.trim().split(/[\\/]/).pop()?.trim() ?? ''
  if (!name || name === '.' || name === '..') return null
  const lower = name.toLowerCase()
  const exact = files.find((f) => f.toLowerCase() === lower)
  if (exact) return exact
  for (const ext of MERGE_IMAGE_EXTENSIONS) {
    const f = files.find((x) => x.toLowerCase() === `${lower}.${ext}`)
    if (f) return f
  }
  return null
}
