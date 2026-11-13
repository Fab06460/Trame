import { nanoid } from 'nanoid'
import { decodeDataUrl } from '@/pdfMath'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'
import type { TrameDocument } from '@/types'
import type { MessageKey } from '@shared/i18n'

/** Plus grand côté de l'image d'aperçu d'un clip. */
const POSTER_SIDE = 1600

export const toBase64 = (bytes: Uint8Array): string => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Adresse de lecture (blob) d'un clip du document, gardée tant que l'application tourne : la conversion d'un gros clip coûte cher. */
const urls = new Map<string, string>()
export const clipUrl = (doc: Pick<TrameDocument, 'clips'>, id: string): string | null => embeddedUrl(doc.clips?.[id], id)

/** Adresse de lecture (blob) d'un média embarqué (clip, voix off), gardée pour ne pas le convertir à chaque affichage. */
export function embeddedUrl(data: string | undefined, id: string): string | null {
  if (!data) return null
  const key = `${id}:${data.length}`
  let url = urls.get(key)
  if (!url) {
    const parts = decodeDataUrl(data)
    if (!parts) return null
    url = URL.createObjectURL(new Blob([parts.bytes.slice()], { type: parts.mime }))
    urls.set(key, url)
  }
  return url
}

/** Charge les métadonnées d'un clip (taille, durée) dans un lecteur hors écran. */
function openVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    const fail = (): void => reject(new Error('unreadable'))
    v.onerror = fail
    v.onloadeddata = () => resolve(v)
    setTimeout(fail, 20000)
    v.src = url
  })
}

/** Image d'un lecteur vidéo à son instant courant, en JPEG, ramenée à `POSTER_SIDE`. */
export function captureFrame(video: HTMLVideoElement): string {
  const k = Math.min(1, POSTER_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(video.videoWidth * k))
  canvas.height = Math.max(1, Math.round(video.videoHeight * k))
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.9)
}

const seekTo = (v: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    if (Math.abs(v.currentTime - time) < 0.001) return resolve()
    v.onseeked = () => resolve()
    setTimeout(resolve, 5000)
    v.currentTime = time
  })

/** Image d'aperçu d'une vidéo du document à l'instant `time` (JPEG), ou `null` si elle ne se lit pas. */
export async function clipPosterAt(doc: Pick<TrameDocument, 'clips'>, id: string, time: number): Promise<string | null> {
  const url = clipUrl(doc, id)
  if (!url) return null
  try {
    const video = await openVideo(url)
    if (!video.videoWidth || !video.videoHeight) return null
    await seekTo(video, Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05)))
    return captureFrame(video)
  } catch {
    return null
  }
}

export type ClipResult = 'ok' | 'cancelled' | 'tooBig' | 'unreadable'

/** « Insérer un clip vidéo… » : choisit le fichier puis le place comme un clip (voir `insertClipBytes`). */
export async function insertClipFromFile(): Promise<ClipResult> {
  const picked = await window.trame.pickVideo()
  if (!picked) return 'cancelled'
  if ('error' in picked) return picked.error
  return insertClipBytes(picked.bytes, picked.mime)
}

/** Embarque une vidéo dans le document, en tire une image d'aperçu et pose cet aperçu sur la page (un clip : voir `ClipPanel`). */
export async function insertClipBytes(bytes: Uint8Array, mime: string): Promise<ClipResult> {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mime }))
  try {
    const video = await openVideo(url)
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) return 'unreadable'
    await seekTo(video, Math.min(0.5, video.duration / 4))
    const poster = captureFrame(video)
    const { doc, insertClip } = useEditor.getState()
    const ratio = Math.min(1, (doc.width * 0.6) / video.videoWidth, (doc.height * 0.6) / video.videoHeight)
    const id = nanoid(10)
    insertClip(id, `data:${mime};base64,${toBase64(bytes)}`, {
      type: 'image',
      src: poster,
      width: Math.round(video.videoWidth * ratio),
      height: Math.round(video.videoHeight * ratio),
      name: t('video.clip.name'),
      video: { id, duration: Math.round(video.duration * 100) / 100 }
    })
    return 'ok'
  } catch {
    return 'unreadable'
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const clipResultMessage = (r: ClipResult): MessageKey | null => (r === 'tooBig' ? 'clip.tooBig' : r === 'unreadable' ? 'clip.unreadable' : null)
