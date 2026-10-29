import type { TrameElement } from '@/types'
import { aiLayerName } from '@/aiImage'
import { insertImage } from '@/clipboardActions'
import { editedPng } from '@/imageRender'
import { coverCrop, hasImageEdits } from '@/imageStyle'
import { downscaleImage } from '@/photoImport'
import { selectPage, useEditor } from '@/store/editor'
import type { AiResult } from '@/store/ai'
import { t } from '@/i18n'

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('imp.imageUnreadable')))
    img.src = src
  })

export interface PreparedSource {
  dataUrl: string
  width: number
  height: number
}

/**
 * L'image telle qu'on la voit (recadrage, miroirs et filtres compris), réduite à `maxSide` px au plus et ré-encodée en PNG : un format
 * que tous les services lisent, quel que soit celui du fichier d'origine (GIF, SVG, WebP…).
 */
export async function prepareEditSource(el: Pick<TrameElement, 'src' | 'width' | 'filters' | 'crop' | 'flipX' | 'flipY'>, maxSide: number, format: 'png' | 'jpeg' = 'png'): Promise<PreparedSource> {
  if (!el.src) throw new Error('no image')
  const shown = hasImageEdits(el) ? await editedPng(el) : el.src
  const img = await load(shown)
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * k))
  const height = Math.max(1, Math.round(img.naturalHeight * k))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff' // le JPEG n'a pas de transparence : fond blanc plutôt que noir
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return { dataUrl: format === 'jpeg' ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png'), width, height }
}

/** Image à décrire : telle qu'on la voit, réduite à 1 024 px au plus et en JPEG (bien plus léger que le PNG pour une photo). */
export const prepareDescribeSource = (el: Parameters<typeof prepareEditSource>[0]): Promise<PreparedSource> => prepareEditSource(el, 1024, 'jpeg')

/** Boîte d'une image retouchée posée à côté de l'originale : dans la même zone (proportions du résultat), décalée pour rester visible. */
export function nextToBox(source: Pick<TrameElement, 'x' | 'y' | 'width' | 'height'>, w: number, h: number, offset = 24): Pick<TrameElement, 'x' | 'y' | 'width' | 'height'> {
  const k = Math.min(source.width / w, source.height / h)
  return { x: source.x + offset, y: source.y + offset, width: w * k, height: h * k }
}

/**
 * Place un résultat de retouche ou de variante : « insert » l'ajoute à côté de l'original (au centre s'il n'est plus sur la page),
 * « replace » prend la place de l'original (même position et même taille, un seul pas d'historique : annulable).
 */
export async function placeResult(r: AiResult, mode: 'insert' | 'replace'): Promise<void> {
  const src = await downscaleImage(r.dataUrl)
  const img = await load(src)
  const { updateElement, addElement } = useEditor.getState()
  const source = r.sourceId ? selectPage(useEditor.getState()).elements.find((e) => e.id === r.sourceId) : undefined
  const extra = { name: aiLayerName(r.prompt), ai: r.info }
  if (source && mode === 'replace') {
    updateElement(source.id, { src, ...extra, crop: coverCrop(source.width, source.height, img.naturalWidth, img.naturalHeight), filters: undefined, flipX: undefined, flipY: undefined, credit: undefined, pdfSource: undefined })
  } else if (source) {
    addElement({ type: 'image', src, ...nextToBox(source, img.naturalWidth, img.naturalHeight), ...extra })
  } else {
    await insertImage(src, extra)
  }
}
