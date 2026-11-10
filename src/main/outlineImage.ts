import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Formats d'image repris d'un fichier Markdown. */
export const DOCUMENT_IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
/** Taille maximale d'une image reprise. */
export const MAX_DOCUMENT_IMAGE_BYTES = 10_000_000

/**
 * Chemin d'une image citée par un fichier Markdown (`![](img/schema.png)`), ou null si on ne doit pas la lire : seul un chemin relatif
 * qui reste **dans le dossier du fichier ou ses sous-dossiers** est accepté (jamais `..` pour en sortir, un chemin absolu, une lettre
 * de lecteur ni une adresse), avec une extension d'image connue. L'interface ne choisit donc jamais un fichier au hasard du disque.
 */
export function resolveDocumentImage(dir: string, ref: string): { path: string; mime: string } | null {
  let rel = ref.trim()
  if (!rel || rel.includes('\0')) return null
  rel = rel.replace(/[?#].*$/, '')
  try {
    rel = decodeURIComponent(rel)
  } catch {
    return null
  }
  // Markdown écrit ses chemins avec « / » : une barre oblique inverse (retour en arrière sous Windows) est refusée partout
  if (rel.includes('\0') || rel.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('/') || isAbsolute(rel)) return null
  const mime = DOCUMENT_IMAGE_MIME[rel.split('.').pop()?.toLowerCase() ?? '']
  if (!mime) return null
  const path = resolve(dir, rel)
  const inside = relative(resolve(dir), path)
  if (!inside || inside.split(sep)[0] === '..' || isAbsolute(inside)) return null
  return { path, mime }
}
