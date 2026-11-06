import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer'
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer'
import { pageAtStep } from '@/builds'
import { renderPage } from '@/exportPages'
import { decodeDataUrl } from '@/pdfMath'
import { addSounds, AUDIO_RATE, decodeAudio, mixTrack, silence, trimSound, type DecodedAudio, type MusicOptions, type SoundEvent } from '@/audioTrack'
import { clipUrl } from '@/clipActions'
import { clipSounds, clipsAt, layerKeys, layersAt, scheduleOf, videoSize, type ClipFrame, type Layer, type VideoOptions } from '@/videoTimeline'
import type { TrameDocument } from '@/types'

export type VideoFormat = 'mp4' | 'webm'

interface Codec {
  format: VideoFormat
  /** chaîne de codec de WebCodecs */
  codec: string
}

/** Codec son de chaque conteneur : AAC dans MP4, Opus dans WebM. */
const AUDIO_CODEC: Record<VideoFormat, string> = { mp4: 'mp4a.40.2', webm: 'opus' }
const audioConfig = (format: VideoFormat): AudioEncoderConfig => ({ codec: AUDIO_CODEC[format], sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 128_000 })

async function audioSupported(format: VideoFormat): Promise<boolean> {
  try {
    return typeof AudioEncoder !== 'undefined' && (await AudioEncoder.isConfigSupported(audioConfig(format))).supported === true
  } catch {
    return false
  }
}

export interface Music {
  audio: DecodedAudio
  options: MusicOptions
}

/** Codecs essayés dans l'ordre : H.264 (MP4, lisible partout) puis VP9 (WebM) quand l'encodeur H.264 manque (certains Linux). */
const CODECS: Codec[] = [
  { format: 'mp4', codec: 'avc1.64002a' },
  { format: 'mp4', codec: 'avc1.640028' },
  { format: 'mp4', codec: 'avc1.4d0028' },
  { format: 'webm', codec: 'vp09.00.40.08' }
]

export const videoSupported = (): boolean => typeof VideoEncoder !== 'undefined' && typeof createImageBitmap === 'function'

/** Débit visé : assez pour des pages nettes (aplats, texte) sans gonfler le fichier. */
const bitrateFor = (width: number, height: number, fps: number): number => Math.min(40_000_000, Math.max(1_000_000, Math.round(width * height * fps * 0.1)))

const config = (c: Codec, width: number, height: number, fps: number): VideoEncoderConfig => ({
  codec: c.codec,
  width,
  height,
  bitrate: bitrateFor(width, height, fps),
  framerate: fps,
  latencyMode: 'quality',
  ...(c.format === 'mp4' ? { avc: { format: 'avc' as const } } : {})
})

/** Le premier codec que cette machine sait encoder à cette taille (et, avec du son, dont le conteneur sait aussi encoder le son), ou null. */
export async function chooseCodec(width: number, height: number, fps: number, withAudio = false): Promise<Codec | null> {
  if (!videoSupported()) return null
  for (const c of CODECS) {
    try {
      if ((await VideoEncoder.isConfigSupported(config(c, width, height, fps))).supported && (!withAudio || (await audioSupported(c.format)))) return c
    } catch {
      /* configuration refusée : on essaie la suivante */
    }
  }
  return null
}

export interface VideoResult {
  bytes: Uint8Array
  format: VideoFormat
  width: number
  height: number
  seconds: number
}

export class VideoCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** Dessine une couche : position, échelle, opacité et ombre (transition « recouvrement ») de la page. */
function drawLayer(ctx: CanvasRenderingContext2D, image: ImageBitmap, l: Layer, w: number, h: number): void {
  ctx.save()
  ctx.globalAlpha = l.alpha
  if (l.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = (60 * w) / 1920
  }
  ctx.translate(w / 2 + l.tx * w, h / 2)
  ctx.scale(l.scale, l.scale)
  ctx.drawImage(image, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Un clip du document, lu par un lecteur vidéo hors écran que l'on fait avancer image par image (aucun lecteur ne tourne en temps réel). */
async function openClip(doc: TrameDocument, id: string): Promise<HTMLVideoElement | null> {
  const url = clipUrl(doc, id)
  if (!url) return null
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.onloadeddata = () => resolve(v)
    v.onerror = () => resolve(null)
    setTimeout(() => resolve(null), 20000)
    v.src = url
  })
}

const seekTo = (v: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    if (Math.abs(v.currentTime - time) < 0.0005) return resolve()
    v.onseeked = () => resolve()
    setTimeout(resolve, 3000)
    v.currentTime = time
  })

/** Dessine l'image d'un clip à la place de son élément, dans le même repère que la page de sa couche (position, échelle, opacité). */
function drawClip(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, c: ClipFrame, l: Layer, w: number, h: number, k: number): void {
  const { el } = c
  ctx.save()
  ctx.globalAlpha = l.alpha * el.opacity
  ctx.translate(w / 2 + l.tx * w, h / 2)
  ctx.scale(l.scale, l.scale)
  ctx.translate(-w / 2, -h / 2)
  ctx.scale(k, k)
  ctx.translate(el.x, el.y)
  ctx.rotate((el.rotation * Math.PI) / 180)
  ctx.drawImage(video, 0, 0, el.width, el.height)
  ctx.restore()
}

/**
 * Le document en vidéo : chaque page dure `secondsPerPage` (plus si elle porte un clip plus long), avec les transitions de la présentation,
 * l'apparition pas à pas (fondu) et les clips vidéo des pages, lus image par image. Les pages sont rendues comme à l'export (mêmes
 * polices, effets, ombres), assemblées sur un canevas, encodées par WebCodecs (plus vite que le temps réel) puis placées dans un
 * conteneur MP4 ou WebM. Le son : musique de fond facultative et son des clips.
 */
export async function exportVideo(doc: TrameDocument, options: VideoOptions, onProgress: (done: number, total: number) => void, signal: AbortSignal, music?: Music): Promise<VideoResult> {
  const { width, height } = videoSize(doc, options.longSide)
  const schedule = scheduleOf(doc, options)
  const frames = Math.round(schedule.total * options.fps)
  const sounds = clipSounds(doc, options, schedule)
  const withAudio = !!music || sounds.length > 0
  const codec = await chooseCodec(width, height, options.fps, withAudio)
  if (!codec) throw new Error('codec')

  const target = codec.format === 'mp4' ? new Mp4Target() : new WebmTarget()
  const muxer =
    codec.format === 'mp4'
      ? new Mp4Muxer({
          target: target as Mp4Target,
          video: { codec: 'avc', width, height, frameRate: options.fps },
          ...(withAudio ? { audio: { codec: 'aac' as const, numberOfChannels: 2, sampleRate: AUDIO_RATE } } : {}),
          fastStart: 'in-memory'
        })
      : new WebmMuxer({
          target: target as WebmTarget,
          video: { codec: 'V_VP9', width, height, frameRate: options.fps },
          ...(withAudio ? { audio: { codec: 'A_OPUS' as const, numberOfChannels: 2, sampleRate: AUDIO_RATE } } : {})
        })

  let failure: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => (muxer as Mp4Muxer<Mp4Target>).addVideoChunk(chunk, meta),
    error: (e) => (failure = e)
  })
  encoder.configure(config(codec, width, height, options.fps))

  // son : la musique mise à la durée de la vidéo, encodée par blocs de 0,1 s au fur et à mesure des images (les conteneurs veulent des pistes entrelacées)
  let audioEncoder: AudioEncoder | null = null
  let track: [Float32Array, Float32Array] | null = null
  let audioAt = 0
  if (withAudio) {
    const seconds = frames / options.fps
    track = music ? mixTrack(music.audio.channels, seconds, music.options) : silence(seconds)
    // son des clips : chaque clip est décodé une fois (un clip sans piste son est ignoré), puis placé à son instant
    const decoded = new Map<string, DecodedAudio | null>()
    const events: SoundEvent[] = []
    for (const sound of sounds) {
      if (!decoded.has(sound.id)) {
        const data = doc.clips?.[sound.id]
        const parts = data ? decodeDataUrl(data) : null
        decoded.set(sound.id, parts ? await decodeAudio(parts.bytes).catch(() => null) : null)
      }
      const audio = decoded.get(sound.id)
      if (audio && audio.channels.length) events.push({ source: trimSound(audio.channels, sound.start, sound.end, sound.speed), at: sound.at, until: sound.until, volume: sound.volume, loop: sound.loop })
    }
    addSounds(track, events)
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => (muxer as Mp4Muxer<Mp4Target>).addAudioChunk(chunk, meta),
      error: (e) => (failure = e)
    })
    audioEncoder.configure(audioConfig(codec.format))
  }
  const BLOCK = AUDIO_RATE / 10
  /** Encode la musique jusqu'à l'instant `untilSample` (exclu). */
  const feedAudio = (untilSample: number): void => {
    if (!audioEncoder || !track) return
    while (audioAt < Math.min(untilSample, track[0].length)) {
      const n = Math.min(BLOCK, track[0].length - audioAt)
      const data = new Float32Array(n * 2)
      data.set(track[0].subarray(audioAt, audioAt + n), 0)
      data.set(track[1].subarray(audioAt, audioAt + n), n)
      const block = new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((audioAt * 1_000_000) / AUDIO_RATE), data })
      audioEncoder.encode(block)
      block.close()
      audioAt += n
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // clips : un lecteur par clip et par page où il paraît (deux pages peuvent montrer le même clip à des instants différents)
  const players = new Map<string, HTMLVideoElement | null>()
  const lastTime = new Map<string, number>()
  const clipPlayer = async (page: number, id: string): Promise<HTMLVideoElement | null> => {
    const key = `${page}:${id}`
    if (!players.has(key)) players.set(key, await openClip(doc, id))
    return players.get(key) ?? null
  }

  // images des pages (à une étape d'apparition) : rendues à la demande, celles que le film a dépassées sont libérées
  const images = new Map<string, ImageBitmap>()
  const need = async (keys: string[]): Promise<void> => {
    for (const key of keys) {
      if (images.has(key)) continue
      const [p, s] = key.split(':').map(Number)
      const url = await renderPage(doc, pageAtStep(doc.pages[p], s), 'image/jpeg', undefined, { scale: width / doc.width, quality: 0.95 })
      // pas de `fetch` sur une adresse data: (la politique de sécurité de la page l'interdit) : on décode soi-même
      const parts = decodeDataUrl(url)
      if (!parts) throw new Error('image')
      images.set(key, await createImageBitmap(new Blob([parts.bytes.slice()], { type: parts.mime })))
    }
    const first = Math.min(...keys.map((k) => Number(k.split(':')[0])))
    for (const [key, bmp] of images) if (Number(key.split(':')[0]) < first - 1) (bmp.close(), images.delete(key))
    for (const [key, v] of players) {
      if (Number(key.split(':')[0]) < first - 1) {
        if (v) (v.removeAttribute('src'), v.load())
        players.delete(key)
        lastTime.delete(key)
      }
    }
  }

  try {
    for (let f = 0; f < frames; f++) {
      if (signal.aborted) throw new VideoCancelled()
      if (failure) throw failure
      const layers = layersAt(doc, options, f / options.fps, schedule)
      await need(layerKeys(layers))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      for (const l of layers) {
        drawLayer(ctx, images.get(`${l.page}:${l.step}`)!, l, width, height)
        for (const c of clipsAt(doc, options, schedule, l, f / options.fps)) {
          const player = await clipPlayer(l.page, c.el.video!.id)
          if (!player) continue // clip introuvable ou illisible : son image d'aperçu, déjà dans la page, reste visible
          const key = `${l.page}:${c.el.video!.id}`
          if (lastTime.get(key) !== c.time) {
            await seekTo(player, c.time)
            lastTime.set(key, c.time)
          }
          drawClip(ctx, player, c, l, width, height, width / doc.width)
        }
      }
      feedAudio(Math.round(((f + 1) / options.fps + 0.5) * AUDIO_RATE))
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1_000_000) / options.fps), duration: Math.round(1_000_000 / options.fps) })
      encoder.encode(frame, { keyFrame: f % (options.fps * 2) === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 6) await tick()
      if (f % 4 === 0) {
        onProgress(f, frames)
        await tick()
      }
    }
    feedAudio(Number.MAX_SAFE_INTEGER)
    await encoder.flush()
    await audioEncoder?.flush()
    if (failure) throw failure
    muxer.finalize()
    onProgress(frames, frames)
    return { bytes: new Uint8Array((target as Mp4Target).buffer), format: codec.format, width, height, seconds: frames / options.fps }
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close()
    for (const bmp of images.values()) bmp.close()
    for (const v of players.values()) if (v) (v.removeAttribute('src'), v.load())
  }
}
