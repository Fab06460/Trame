import { insertImage } from '@/clipboardActions'
import { downscaleImage } from '@/photoImport'

/** Formats d'image acceptés au dépôt (les mêmes que « Image… »). */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
/** Au-delà, un fichier est ignoré : il serait lu entièrement en mémoire puis stocké dans le document. */
export const MAX_DROP_BYTES = 40 * 1024 * 1024
/** Décalage (en px de page) entre deux images déposées ensemble, pour qu'elles ne se recouvrent pas exactement. */
export const DROP_STEP = 24

type FileInfo = { type: string; name: string; size: number }

/** Vrai si le fichier est une image acceptée et de taille raisonnable (le type du système, à défaut l'extension). */
export const isDroppableImage = (f: FileInfo): boolean =>
  f.size > 0 && f.size <= MAX_DROP_BYTES && (IMAGE_TYPES.includes(f.type) || (f.type === '' && IMAGE_EXT.test(f.name)))

/** Centre de la i-ème image d'un dépôt : le point lâché, décalé en cascade, ramené dans la page. */
export function dropCenter(at: { x: number; y: number }, index: number, page: { width: number; height: number }): { x: number; y: number } {
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max)
  return { x: clamp(at.x + index * DROP_STEP, page.width), y: clamp(at.y + index * DROP_STEP, page.height) }
}

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/**
 * Insère les images déposées sur la page, centrées sur le point lâché (coordonnées de page).
 * Les fichiers qui ne sont pas des images, trop gros ou illisibles sont ignorés ; renvoie le nombre d'images insérées.
 */
export async function dropImages(files: File[], at: { x: number; y: number }, page: { width: number; height: number }): Promise<number> {
  let n = 0
  for (const file of files.filter(isDroppableImage)) {
    try {
      let src = await readDataUrl(file)
      // un fichier sans type MIME (rare) : l'extension le dit
      if (src.startsWith('data:application/octet-stream')) src = src.replace('application/octet-stream', file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : `image/${file.name.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg')}`)
      if (!src.startsWith('data:image/svg')) src = await downscaleImage(src)
      await insertImage(src, {}, dropCenter(at, n, page))
      n++
    } catch {
      /* image illisible : ignorée, les autres sont insérées */
    }
  }
  return n
}
