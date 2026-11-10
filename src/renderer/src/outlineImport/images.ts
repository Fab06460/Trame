import type { Outline, OutlineBlock } from './outline'

/** Images reprises au plus d'un document Markdown (comme pour Word). */
export const MAX_DOCUMENT_IMAGES = 60
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/
/** Taille maximale d'une data URL reprise (environ 10 Mo d'image). */
const MAX_DATA_URL_CHARS = 14_000_000

export interface ImageDeps {
  /** lit une image citée par son chemin relatif (data URL), ou null */
  read: (ref: string) => Promise<string | null>
  /** largeur / hauteur d'une image, ou null si elle est illisible */
  measure: (dataUrl: string) => Promise<number | null>
}

/**
 * Rend utilisables les images d'un plan Markdown : les data URL sont vérifiées, les chemins relatifs lus dans le dossier du fichier, leurs
 * proportions mesurées. Une image distante (Trame ne télécharge rien), introuvable, illisible, d'un format inconnu ou en trop grand
 * nombre est retirée du plan et comptée dans `notes.skippedImages`. Rend un nouveau plan.
 */
export async function resolveOutlineImages(outline: Outline, deps: ImageDeps): Promise<Outline> {
  const blocks: OutlineBlock[] = []
  let skipped = 0
  let kept = 0
  for (const b of outline.blocks) {
    if (b.kind !== 'image') {
      blocks.push(b)
      continue
    }
    if (kept >= MAX_DOCUMENT_IMAGES) {
      skipped++
      continue
    }
    let src: string | null = null
    if (b.src.startsWith('data:')) src = b.src.length <= MAX_DATA_URL_CHARS && DATA_IMAGE.test(b.src) ? b.src : null
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(b.src) && !b.src.startsWith('//')) src = await deps.read(b.src).catch(() => null)
    const ratio = src ? (b.ratio ?? (await deps.measure(src).catch(() => null))) : null
    if (!src || !ratio || !Number.isFinite(ratio) || ratio <= 0) {
      skipped++
      continue
    }
    kept++
    blocks.push({ ...b, src, ratio })
  }
  return { ...outline, blocks, notes: { ...outline.notes, skippedImages: outline.notes.skippedImages + skipped } }
}

/** Proportions d'une image, mesurées dans le navigateur (null si elle ne se charge pas). */
export function measureInBrowser(dataUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = window.setTimeout(() => resolve(null), 8000)
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = dataUrl
  })
}

/** Texte d'un fichier : UTF-8, ou à défaut Windows-1252 (fichier texte enregistré par un vieux logiciel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
