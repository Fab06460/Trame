import { buildNumbers, pageAtStep, stepsOf } from '@/builds'
import { pageVoice, VOICE_DELAY, voiceNeed } from '@/voiceOver'
import { clipElements, clipLength, clipSourceTime, clipRange, clipSpeed } from '@/videoClips'
import { pageTransition, TRANSITION_MS, type PageTransition } from '@/transition'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

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
  /** une page qui porte un clip plus long qu'elle dure assez longtemps pour le montrer en entier */
  fitClips: boolean
  /** une page dont la voix off est plus longue qu'elle dure assez longtemps pour l'entendre en entier */
  fitVoices: boolean
}

export const DEFAULT_VIDEO: VideoOptions = { secondsPerPage: 5, fps: 30, longSide: 1920, effects: true, fitClips: true, fitVoices: true }
export const MIN_SECONDS = 1
export const MAX_SECONDS = 120
/** Durée totale maximale : la vidéo est construite en mémoire avant d'être enregistrée. */
export const MAX_VIDEO_SECONDS = 1200

export type VideoProblem = 'noPages' | 'tooLong' | 'badSeconds'

export function videoProblem(doc: Pick<TrameDocument, 'pages'>, o: VideoOptions): VideoProblem | null {
  if (doc.pages.length === 0) return 'noPages'
  if (!(o.secondsPerPage >= MIN_SECONDS && o.secondsPerPage <= MAX_SECONDS)) return 'badSeconds'
  return totalSeconds(doc, o) > MAX_VIDEO_SECONDS ? 'tooLong' : null
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2)

/** Dimensions de la vidéo : le grand côté fait `longSide`, les proportions de la page sont gardées, les deux côtés sont pairs (exigence des codecs). */
export function videoSize(doc: Pick<TrameDocument, 'width' | 'height'>, longSide: number): { width: number; height: number } {
  const k = longSide / Math.max(doc.width, doc.height)
  return { width: even(doc.width * k), height: even(doc.height * k) }
}

/** Début et durée de chaque page dans la vidéo, en secondes. */
export interface Schedule {
  starts: number[]
  durations: number[]
  total: number
}

const BASE_TRANSITION = TRANSITION_MS / 1000

/** Position d'un clip dans sa page : l'instant (depuis le début de la page) où il apparaît, d'après son numéro d'apparition. */
function clipStartIn(page: Pick<TramePage, 'elements'>, el: TrameElement, seconds: number, effects: boolean): number {
  if (!effects || !el.build) return 0
  const numbers = buildNumbers(page)
  const k = numbers.indexOf(el.build)
  return k < 0 ? 0 : revealTimes(seconds, numbers.length).at[k]
}

/** Durée d'une page : celle choisie, allongée si un clip qui ne tourne pas en boucle ne tiendrait pas en entier. */
function pageSeconds(page: TramePage, o: VideoOptions): number {
  const base = page.seconds ?? o.secondsPerPage
  let need = base
  if (o.fitVoices && page.voice) need = Math.max(need, voiceNeed(page.voice.duration))
  const n = buildNumbers(page).length
  for (const el of o.fitClips ? clipElements(page.elements) : []) {
    if (!el.video || el.video.loop) continue
    // un clip qui apparaît à l'étape k (sur n) démarre à tr + k × (D − tr) / (n + 1) : il tient si cet instant + sa durée ≤ D
    const k = o.effects && el.build ? buildNumbers(page).indexOf(el.build) + 1 : 0
    const length = clipLength(el.video)
    need = Math.max(need, k === 0 ? length : BASE_TRANSITION + (length * (n + 1)) / (n + 1 - k))
  }
  // au dixième supérieur, sans que le bruit des nombres flottants (10,700000000000001) ajoute un dixième de trop
  return Math.ceil(need * 10 - 1e-9) / 10
}

export function scheduleOf(doc: Pick<TrameDocument, 'pages'>, o: VideoOptions): Schedule {
  const starts: number[] = []
  const durations: number[] = []
  let at = 0
  for (const page of doc.pages) {
    starts.push(at)
    const d = pageSeconds(page as TramePage, o)
    durations.push(d)
    at += d
  }
  return { starts, durations, total: at }
}

export const totalSeconds = (doc: Pick<TrameDocument, 'pages'>, o: VideoOptions): number => scheduleOf(doc, o).total
export const totalFrames = (doc: Pick<TrameDocument, 'pages'>, o: VideoOptions): number => Math.round(totalSeconds(doc, o) * o.fps)

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
export function layersAt(doc: Pick<TrameDocument, 'pages' | 'transition'>, o: VideoOptions, t: number, schedule: Schedule = scheduleOf(doc, o)): Layer[] {
  let page = 0
  for (let i = 0; i < schedule.starts.length; i++) if (t >= schedule.starts[i]) page = i
  const d = schedule.durations[page]
  const steps = stepsOf(doc.pages[page])
  if (!o.effects) return [layer(page, steps)]
  const local = t - schedule.starts[page]
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

/** Un clip à dessiner sur une couche : l'élément et l'instant du clip à montrer. */
export interface ClipFrame {
  el: TrameElement
  time: number
}

/**
 * Les clips visibles sur une couche à l'instant `t` (secondes depuis le début de la vidéo) et l'instant de chacun. Un clip démarre avec
 * sa page (ou à son étape d'apparition), recommence s'il tourne en boucle, sinon s'arrête sur sa dernière image. `time` est un instant du
 * clip d'origine (le montage — début, fin, vitesse — est déjà appliqué). Une page quittée
 * pendant une transition garde son horloge : son clip continue de jouer le temps du mouvement.
 */
export function clipsAt(doc: Pick<TrameDocument, 'pages'>, o: VideoOptions, schedule: Schedule, l: Layer, t: number): ClipFrame[] {
  const page = doc.pages[l.page] as TramePage
  const out: ClipFrame[] = []
  for (const el of clipElements(pageAtStep(page, l.step).elements)) {
    const clip = el.video
    if (!clip) continue
    const elapsed = t - schedule.starts[l.page] - clipStartIn(page, el, schedule.durations[l.page], o.effects)
    if (elapsed < 0) continue
    out.push({ el, time: clipSourceTime(clip, elapsed) })
  }
  return out
}

/** Un son de clip à placer dans la bande son : où il commence, où il doit s'arrêter au plus tard (fin de la page), et ses réglages. */
export interface ClipSound {
  id: string
  at: number
  until: number
  volume: number
  loop: boolean
  /** le morceau gardé du clip (secondes du clip d'origine) et la vitesse de lecture */
  start: number
  end: number
  speed: number
}

/** Les sons des clips non muets, dans l'ordre des pages. */
export function clipSounds(doc: Pick<TrameDocument, 'pages'>, o: VideoOptions, schedule: Schedule): ClipSound[] {
  const out: ClipSound[] = []
  doc.pages.forEach((p, i) => {
    for (const el of clipElements(p.elements)) {
      const clip = el.video
      if (!clip || clip.muted) continue
      const volume = typeof clip.volume === 'number' ? Math.min(1, Math.max(0, clip.volume)) : 1
      if (volume <= 0) continue
      out.push({ id: clip.id, at: schedule.starts[i] + clipStartIn(p as TramePage, el, schedule.durations[i], o.effects), until: schedule.starts[i] + schedule.durations[i], volume, loop: !!clip.loop, ...clipRange(clip), speed: clipSpeed(clip) })
    }
  })
  return out
}

/** La voix off d'une page à placer dans la bande son : où elle commence et où elle doit s'arrêter au plus tard (fin de la page). */
export interface VoiceSound {
  id: string
  at: number
  until: number
}

/** Les voix off, dans l'ordre des pages. */
export function voiceSounds(doc: Pick<TrameDocument, 'pages' | 'voices'>, schedule: Schedule): VoiceSound[] {
  const out: VoiceSound[] = []
  doc.pages.forEach((p, i) => {
    const v = pageVoice(doc, p)
    if (v) out.push({ id: v.id, at: schedule.starts[i] + VOICE_DELAY, until: schedule.starts[i] + schedule.durations[i] })
  })
  return out
}
