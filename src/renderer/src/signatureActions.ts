import { inkShape, removePaper, SIGNATURE_PAGE_SHARE, visibleBounds, type Ink, type PaperOptions, type StoredSignature } from '@/signature'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'

/** Plus grand côté d'une image de signature gardée : une signature n'a pas besoin de plus. */
export const SIGNATURE_IMAGE_SIDE = 800

/** Insère une signature dessinée, au centre de la page, sous forme de forme vectorielle pleine. Retourne faux s'il n'y a rien à poser. */
export function insertInk(ink: Ink): boolean {
  const { doc, addElement } = useEditor.getState()
  const shape = inkShape(ink, Math.round(doc.width * SIGNATURE_PAGE_SHARE))
  if (!shape) return false
  addElement({ type: 'path', path: shape.path, width: shape.width, height: shape.height, fill: ink.color, name: t('sig.name') })
  return true
}

/** Insère une signature importée (PNG à fond transparent), au centre de la page, à la même largeur qu'une signature dessinée. */
export function insertSignatureImage(src: string, aspect: number): void {
  const { doc, addElement } = useEditor.getState()
  const width = Math.round(doc.width * SIGNATURE_PAGE_SHARE)
  addElement({ type: 'image', src, width, height: Math.max(1, Math.round(width / aspect)), name: t('sig.name'), alt: t('sig.alt') })
}

export function insertStored(s: StoredSignature): void {
  if (s.kind === 'ink') insertInk(s.ink)
  else insertSignatureImage(s.src, s.aspect)
}

export interface SourcePixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Décode une image choisie par l'utilisateur et la ramène à 800 px au plus. */
export function readSourcePixels(dataUrl: string): Promise<SourcePixels> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const k = Math.min(1, SIGNATURE_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve({ data: d.data, width: d.width, height: d.height })
    }
    img.onerror = () => reject(new Error(t('imp.imageUnreadable')))
    img.src = dataUrl
  })
}

/** Papier retiré et image rognée sur l'encre, en PNG ; null si l'image ne contient aucune encre. */
export function paperlessPng(source: SourcePixels, options: PaperOptions): { src: string; aspect: number } | null {
  const data = new Uint8ClampedArray(source.data)
  removePaper(data, options)
  const box = visibleBounds(data, source.width, source.height)
  if (!box) return null
  const full = document.createElement('canvas')
  full.width = source.width
  full.height = source.height
  full.getContext('2d')!.putImageData(new ImageData(data, source.width, source.height), 0, 0)
  const out = document.createElement('canvas')
  out.width = box.width
  out.height = box.height
  out.getContext('2d')!.drawImage(full, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  return { src: out.toDataURL('image/png'), aspect: box.width / box.height }
}
