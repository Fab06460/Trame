import { useEffect, useState } from 'react'
import { cssFilter, editKey, hasImageEdits } from '@/imageStyle'
import type { TrameElement } from '@/types'
import { t } from '@/i18n'

/** Plus grand côté du rendu d'une image retouchée (au-delà, on réduit : la mémoire d'un canvas n'est pas illimitée). */
const MAX_SIDE = 4096

type ImageEl = Pick<TrameElement, 'src' | 'width' | 'filters' | 'crop' | 'flipX' | 'flipY'>
export type Drawable = HTMLImageElement | HTMLCanvasElement

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('imp.imageUnreadable')))
    img.src = src
  })

/** Petit cache LRU (les plus récentes en dernier) : retoucher une image ne doit pas la redécoder à chaque réglage. */
class Lru<V> {
  private map = new Map<string, V>()
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.map.get(k)
    if (v !== undefined) {
      this.map.delete(k)
      this.map.set(k, v)
    }
    return v
  }
  delete(k: string): void {
    this.map.delete(k)
  }
  set(k: string, v: V): void {
    this.map.delete(k)
    this.map.set(k, v)
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }
}

const sources = new Lru<Promise<HTMLImageElement>>(12)
const edited = new Lru<HTMLCanvasElement>(8)

export const loadCached = (src: string): Promise<HTMLImageElement> => {
  let p = sources.get(src)
  if (!p) {
    p = loadImage(src)
    sources.set(src, p)
    p.catch(() => sources.delete(src)) // une image illisible ne reste pas en cache
  }
  return p
}

/**
 * L'image telle qu'elle doit être dessinée : l'originale si l'élément n'a aucune retouche, sinon un canvas contenant la zone recadrée,
 * retournée et filtrée. C'est la SEULE fabrication des retouches : éditeur, export image, export PDF et miniatures la partagent.
 */
export async function editedImage(el: ImageEl): Promise<Drawable> {
  const img = await loadCached(el.src as string)
  if (!hasImageEdits(el)) return img
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const c = el.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const sx = c.x * nw
  const sy = c.y * nh
  const sw = Math.max(1, c.width * nw)
  const sh = Math.max(1, c.height * nh)
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  // le flou est réglé en pixels de design : on le convertit en pixels du rendu
  const blurScale = el.width > 0 ? w / el.width : 1
  const key = `${el.src}|${editKey(el)}|${el.filters?.blur ? Math.round(blurScale * 100) : 0}`
  const hit = edited.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.filter = cssFilter(el, blurScale)
  ctx.translate(el.flipX ? w : 0, el.flipY ? h : 0)
  ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  edited.set(key, canvas)
  return canvas
}

/** Image retouchée en PNG (PDF, miniatures). */
export async function editedPng(el: ImageEl): Promise<string> {
  const d = await editedImage(el)
  if (d instanceof HTMLCanvasElement) return d.toDataURL('image/png')
  return el.src as string
}

/** Hook : l'image à dessiner pour un élément, mise à jour quand ses retouches changent (garde l'ancienne pendant le calcul). */
export function useEditedImage(el: ImageEl): Drawable | undefined {
  const [img, setImg] = useState<Drawable>()
  const key = `${el.src}|${editKey(el)}|${el.filters?.blur ? Math.round(el.width) : 0}`
  useEffect(() => {
    let live = true
    if (!el.src) {
      setImg(undefined)
      return
    }
    editedImage(el).then(
      (d) => live && setImg(d),
      () => live && setImg(undefined)
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return img
}
