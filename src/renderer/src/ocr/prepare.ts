import type { Crop } from '@/types'

/** Côté le plus long (px) visé pour la reconnaissance : en dessous, le texte est trop petit pour le moteur ; au-dessus, c'est lent et lourd. */
export const MIN_SIDE = 1500
export const MAX_SIDE = 3000
const MAX_UPSCALE = 2

/** Facteur d'échelle d'une image avant reconnaissance : agrandie (jusqu'à ×2) si elle est petite, réduite si elle est immense. */
export function ocrScale(width: number, height: number): number {
  const side = Math.max(width, height)
  if (!(side > 0)) return 1
  if (side > MAX_SIDE) return MAX_SIDE / side
  if (side < MIN_SIDE) return Math.min(MAX_UPSCALE, MIN_SIDE / side)
  return 1
}

/** La zone de l'image à lire : le recadrage s'il y en a un (borné à l'image), sinon l'image entière. */
export function sourceRect(natural: { width: number; height: number }, crop?: Crop): { x: number; y: number; width: number; height: number } {
  if (!crop) return { x: 0, y: 0, width: natural.width, height: natural.height }
  const x = Math.min(Math.max(0, Math.round(crop.x)), natural.width - 1)
  const y = Math.min(Math.max(0, Math.round(crop.y)), natural.height - 1)
  return { x, y, width: Math.max(1, Math.min(Math.round(crop.width), natural.width - x)), height: Math.max(1, Math.min(Math.round(crop.height), natural.height - y)) }
}

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })

/** Dessine la partie visible de l'image sur fond blanc (un PNG transparent serait lu en noir), à la bonne échelle. */
export async function prepareImage(src: string, crop?: Crop): Promise<HTMLCanvasElement> {
  const img = await load(src)
  const r = sourceRect({ width: img.naturalWidth, height: img.naturalHeight }, crop)
  const scale = ocrScale(r.width, r.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(r.width * scale))
  canvas.height = Math.max(1, Math.round(r.height * scale))
  const g = canvas.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, canvas.width, canvas.height)
  return canvas
}
