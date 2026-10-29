import { t } from '@/i18n'
/** Plus grand côté d'une photo insérée : au-delà, elle est réduite (un document n'a pas besoin d'une image de 6 000 px). */
export const MAX_PHOTO_SIDE = 2400

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('imp.imageUnreadable')))
    img.src = src
  })

/** Réduit une image trop grande (JPEG à 92 %, ou PNG si la source en est un) ; une image assez petite est rendue telle quelle, sans perte. */
export async function downscaleImage(dataUrl: string, maxSide = MAX_PHOTO_SIDE): Promise<string> {
  const img = await load(dataUrl)
  const big = Math.max(img.naturalWidth, img.naturalHeight)
  if (big <= maxSide) return dataUrl
  const k = maxSide / big
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * k)
  canvas.height = Math.round(img.naturalHeight * k)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return dataUrl.startsWith('data:image/png') ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
}

/** Crédits (sans doublon) de toutes les photos en ligne d'un document, un par ligne. */
export function documentCredits(doc: { pages: Array<{ elements: Array<{ credit?: string; hidden?: boolean }> }> }): string[] {
  const seen = new Set<string>()
  for (const p of doc.pages) for (const e of p.elements) if (e.credit) seen.add(e.credit)
  return [...seen]
}
