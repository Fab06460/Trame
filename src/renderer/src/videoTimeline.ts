import { stepsOf } from '@/builds'
import { pageTransition, TRANSITION_MS, type PageTransition } from '@/transition'
import type { TrameDocument } from '@/types'

export const FPS_CHOICES = [24, 30, 60] as const
/** Plus grand côté de la vidéo, en pixels : 480p, 720p et 1080p pour une page 16:9. */
export const SIZE_CHOICES = [854, 1280, 1920] as const

export interface VideoOptions {
  /** durée de chaque page, en secondes */
  secondsPerPage: number
  fps: (typeof FPS_CHOICES)[number]
  longSide: (typeof SIZE_CHOICES)[number]
  /** transitions entre pages et apparition pas à pas ; sinon des coupes franches, éléments tous visibles */
  effects: boolean
}

export const DEFAULT_VIDEO: VideoOptions = { secondsPerPage: 5, fps: 30, longSide: 1920, effects: true }
export const MIN_SECONDS = 1
export const MAX_SECONDS = 120
/** Durée totale maximale : la vidéo est construite en mémoire avant d'être enregistrée. */
export const MAX_VIDEO_SECONDS = 1200

export type VideoProblem = 'noPages' | 'tooLong' | 'badSeconds'

export function videoProblem(doc: Pick<TrameDocument, 'pages'>, o: Pick<VideoOptions, 'secondsPerPage'>): VideoProblem | null {
  if (doc.pages.length === 0) return 'noPages'
  if (!(o.secondsPerPage >= MIN_SECONDS && o.secondsPerPage <= MAX_SECONDS)) return 'badSeconds'
  return doc.pages.length * o.secondsPerPage > MAX_VIDEO_SECONDS ? 'tooLong' : null
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

/** Dimensions de la vidéo : le grand côté fait `longSide`, les proportions de la page sont gardées, les deux côtés sont pairs (exigence des codecs). */
export function videoSize(doc: Pick<TrameDocument, 'width' | 'height'>, longSide: number): { width: number; height: number } {
  const k = longSide / Math.max(doc.width, doc.height)
  return { width: even(doc.width * k), height: even(doc.height * k) }
}

export const totalSeconds = (doc: Pick<TrameDocument, 'pages'>, o: Pick<VideoOptions, 'secondsPerPage'>): number => doc.pages.length * o.secondsPerPage
export const totalFrames = (doc: Pick<TrameDocument, 'pages'>, o: Pick<VideoOptions, 'secondsPerPage' | 'fps'>): number => Math.round(totalSeconds(doc, o) * o.fps)

/** Une page (à une étape d'apparition) dessinée dans l'image, avec sa position et son opacité. Les couches se dessinent dans l'ordre. */
export interface Layer {
  page: number
  step: number
  alpha: number
  /** décalage horizontal, en largeurs d'image (0 = en place, 1 = tout à droite hors cadre) */
  tx: number
  scale: number
  /** ombre portée sur la page de dessous (transition « recouvrement ») */
  shadow: boolean
}

const layer = (page: number, step: number, extra: Partial<Layer> = {}): Layer => ({ page, step, alpha: 1, tx: 0, scale: 1, shadow: false, ...extra })

/** Courbe « ease » de CSS (cubic-bezier 0,25 0,1 0,25 1) : la même que les transitions de la présentation. */
export function easeCss(x: number): number {
  const p = Math.min(1, Math.max(0, x))
  const cx = 3 * 0.25
  const bx = 3 * (0.25 - 0.25) - cx
  const ax = 1 - cx - bx
  const cy = 3 * 0.1
  const by = 3 * (1 - 0.1) - cy
  const ay = 1 - cy - by
  const sx = (t: number): number => ((ax * t + bx) * t + cx) * t
  const sy = (t: number): number => ((ay * t + by) * t + cy) * t
  // inversion de x(t) par dichotomie
  let lo = 0
  let hi = 1
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    if (sx(mid) < p) lo = mid
    else hi = mid
  }
  return sy((lo + hi) / 2)
}

/** Durée de la transition d'arrivée sur une page : celle de la présentation, réduite si la page est très courte. */
export const transitionSeconds = (secondsPerPage: number): number => Math.min(TRANSITION_MS / 1000, secondsPerPage / 3)

/** Instants (secondes depuis le début de la page) où apparaissent les étapes 1 à n, et durée du fondu de chacune. */
export function revealTimes(secondsPerPage: number, steps: number): { at: number[]; fade: number } {
  const tr = transitionSeconds(secondsPerPage)
  const slot = (secondsPerPage - tr) / (steps + 1)
  return { at: Array.from({ length: steps }, (_, k) => tr + (k + 1) * slot), fade: Math.min(TRANSITION_MS / 1000, slot * 0.6) }
}

function transitionLayers(kind: PageTransition, e: number, from: [number, number], to: [number, number]): Layer[] {
  switch (kind) {
    case 'fade':
      return [layer(...from), layer(...to, { alpha: e })]
    case 'slide':
      return [layer(...from, { tx: -e }), layer(...to, { tx: 1 - e })]
    case 'cover':
      return [layer(...from), layer(...to, { tx: 1 - e, shadow: true })]
    case 'zoom':
      return [layer(...from, { scale: 1 + 0.12 * e, alpha: 1 - e }), layer(...to, { scale: 0.85 + 0.15 * e, alpha: e })]
    default:
      return [layer(...to)]
  }
}

/** Ce qui est à l'image à l'instant `t` (secondes depuis le début de la vidéo). */
export function layersAt(doc: Pick<TrameDocument, 'pages' | 'transition'>, o: VideoOptions, t: number): Layer[] {
  const n = doc.pages.length
  const d = o.secondsPerPage
  const page = Math.min(n - 1, Math.max(0, Math.floor(t / d)))
  const steps = stepsOf(doc.pages[page])
  if (!o.effects) return [layer(page, steps)]
  const local = t - page * d
  const tr = transitionSeconds(d)
  if (page > 0 && local < tr) {
    const kind = pageTransition(doc, page)
    const from: [number, number] = [page - 1, stepsOf(doc.pages[page - 1])]
    return transitionLayers(kind, easeCss(local / tr), from, [page, 0])
  }
  if (steps === 0) return [layer(page, 0)]
  const { at, fade } = revealTimes(d, steps)
  let current = 0
  for (let k = 0; k < steps; k++) if (local >= at[k]) current = k + 1
  if (current > 0 && local < at[current - 1] + fade) return [layer(page, current - 1), layer(page, current, { alpha: easeCss((local - at[current - 1]) / fade) })]
  return [layer(page, current)]
}

/** Les pages-étapes qu'il faut avoir sous la main pour dessiner l'image `frame` (clés « page:étape »). */
export const layerKeys = (layers: readonly Layer[]): string[] => layers.map((l) => `${l.page}:${l.step}`)
