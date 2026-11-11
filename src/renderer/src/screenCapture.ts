import { ArrayBufferTarget, Muxer } from 'webm-muxer'

/** Images par seconde de l'enregistrement : assez fluide pour montrer une manipulation, sans gonfler le fichier. */
export const CAPTURE_FPS = 24
/** Plus grand côté de la vidéo : un écran Retina (2 880 px) serait inutilement lourd. */
export const CAPTURE_MAX_SIDE = 1920
/** Débit de l'image : un écran est surtout fait d'aplats et de texte. */
export const CAPTURE_BITRATE = 1_800_000
/** Taille limite du fichier : celle d'un clip du document (voir `MAX_CLIP_CHARS`, en base 64). L'enregistrement s'arrête de lui-même juste avant. */
export const CAPTURE_MAX_BYTES = 48_000_000

/** Dimensions de la vidéo : l'écran ramené à `CAPTURE_MAX_SIDE`, en nombres pairs (l'encodeur l'exige). */
export function captureSize(width: number, height: number, maxSide = CAPTURE_MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height, 1))
  const even = (v: number): number => Math.max(2, Math.round((v * k) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/** « 1:05 » : le temps écoulé affiché pendant l'enregistrement. */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Plus petite zone gardée : en dessous, un simple clic est pris pour une absence de zone. */
export const MIN_ZONE = 8

/** Rectangle tiré entre deux points (dans n'importe quel sens), ramené à l'image ; `null` s'il est trop petit pour être une zone. */
export function zoneBetween(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): Rect | null {
  const clamp = (v: number, max: number): number => Math.min(max, Math.max(0, v))
  const x1 = clamp(Math.min(a.x, b.x), width)
  const y1 = clamp(Math.min(a.y, b.y), height)
  const x2 = clamp(Math.max(a.x, b.x), width)
  const y2 = clamp(Math.max(a.y, b.y), height)
  const w = Math.round(x2 - x1)
  const h = Math.round(y2 - y1)
  return w < MIN_ZONE || h < MIN_ZONE ? null : { x: Math.round(x1), y: Math.round(y1), width: w, height: h }
}

/** Découpe une zone d'une image (PNG en adresse de données). Sans zone, l'image est rendue telle quelle. */
export function cropImage(dataUrl: string, zone: Rect | null): Promise<string> {
  if (!zone) return Promise.resolve(dataUrl)
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = zone.width
      canvas.height = zone.height
      canvas.getContext('2d')!.drawImage(img, zone.x, zone.y, zone.width, zone.height, 0, 0, zone.width, zone.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('image'))
    img.src = dataUrl
  })
}

export type RecordProblem = 'denied' | 'unsupported' | 'micDenied' | 'noMic' | 'failed'
export interface Finished {
  bytes: Uint8Array
  seconds: number
  /** L'enregistrement s'est arrêté parce que le fichier atteignait la taille limite. */
  full: boolean
}
export interface ScreenRecorder {
  /** Secondes écoulées. */
  elapsed: () => number
  /** Termine et rend le fichier WebM (VP9, avec le micro en Opus s'il y en a un). */
  stop: () => Promise<Finished | { error: 'failed'; detail: string }>
  /** Abandonne sans rien garder. */
  cancel: () => void
}

/** L'encodeur sait-il faire du VP9 à cette taille ? (`false` sur un navigateur sans WebCodecs.) */
async function vp9Supported(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof MediaStreamTrackProcessor === 'undefined') return false
  try {
    return (await VideoEncoder.isConfigSupported({ codec: 'vp09.00.50.08', width, height, bitrate: CAPTURE_BITRATE, framerate: CAPTURE_FPS })).supported === true
  } catch {
    return false
  }
}

/**
 * Enregistre une source d'écran (déjà « armée » côté principal) en WebM : les images de l'écran, ramenées à `CAPTURE_MAX_SIDE`, sont encodées en
 * VP9 par WebCodecs au fil de l'eau ; le micro, s'il est demandé, en Opus. Le fichier est construit avec sa durée et ses repères de
 * navigation (contrairement à MediaRecorder, dont les WebM ne se déplacent pas), puis rendu à l'arrêt.
 */
export async function startScreenRecording(mic: boolean, onFull: () => void): Promise<ScreenRecorder | { error: RecordProblem; detail?: string }> {
  let display: MediaStream
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: CAPTURE_FPS }, audio: false })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    return name === 'NotAllowedError' || name === 'NotReadableError' ? { error: 'denied' } : { error: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
  const videoTrack = display.getVideoTracks()[0]
  const stopAll = (...streams: Array<MediaStream | null>): void => {
    for (const s of streams) for (const t of s?.getTracks() ?? []) t.stop()
  }
  if (!videoTrack) {
    stopAll(display)
    return { error: 'failed' }
  }
  const settings = videoTrack.getSettings()
  const { width, height } = captureSize(settings.width ?? 1280, settings.height ?? 720)
  if (!(await vp9Supported(width, height))) {
    stopAll(display)
    return { error: 'unsupported' }
  }

  let micStream: MediaStream | null = null
  if (mic) {
    if ((await window.trame.micAccess()) === 'denied') {
      stopAll(display)
      return { error: 'micDenied' }
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (err) {
      stopAll(display)
      const name = err instanceof DOMException ? err.name : ''
      return { error: name === 'NotFoundError' || name === 'OverconstrainedError' ? 'noMic' : 'micDenied' }
    }
  }

  // le micro fixe la configuration du son (fréquence, voies) : on lit son premier bloc avant de créer le conteneur
  const audioReader = micStream ? new MediaStreamTrackProcessor<AudioData>({ track: micStream.getAudioTracks()[0] }).readable.getReader() : null
  let firstAudio: AudioData | null = null
  if (audioReader) {
    const first = await Promise.race([audioReader.read(), new Promise<null>((r) => setTimeout(() => r(null), 3000))])
    if (!first || first.done) {
      stopAll(display, micStream)
      return { error: 'noMic' }
    }
    firstAudio = first.value
  }
  const channels = firstAudio ? Math.min(2, firstAudio.numberOfChannels) : 0
  const rate = firstAudio?.sampleRate ?? 48000

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP9', width, height, frameRate: CAPTURE_FPS },
    ...(firstAudio ? { audio: { codec: 'A_OPUS' as const, numberOfChannels: channels, sampleRate: rate } } : {}),
    firstTimestampBehavior: 'offset'
  })
  let failure: Error | null = null
  let bytes = 0
  let full = false
  const video = new VideoEncoder({
    output: (chunk, meta) => {
      bytes += chunk.byteLength
      muxer.addVideoChunk(chunk, meta)
      if (bytes > CAPTURE_MAX_BYTES && !full) {
        full = true
        onFull()
      }
    },
    error: (e) => (failure = e)
  })
  video.configure({ codec: 'vp09.00.50.08', width, height, bitrate: CAPTURE_BITRATE, framerate: CAPTURE_FPS, latencyMode: 'realtime' })
  let audio: AudioEncoder | null = null
  if (firstAudio) {
    audio = new AudioEncoder({
      output: (chunk, meta) => {
        bytes += chunk.byteLength
        muxer.addAudioChunk(chunk, meta)
      },
      error: (e) => (failure = e)
    })
    audio.configure({ codec: 'opus', sampleRate: rate, numberOfChannels: channels, bitrate: 64_000 })
  }

  const startedAt = performance.now()
  let last = 0
  let running = true
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  let lastKey = -Infinity
  let frames = 0

  const readVideo = async (): Promise<void> => {
    const reader = new MediaStreamTrackProcessor<VideoFrame>({ track: videoTrack }).readable.getReader()
    const interval = 1_000_000 / CAPTURE_FPS
    for (;;) {
      const { done, value } = await reader.read()
      if (done || !value) break
      try {
        const at = Math.round((performance.now() - startedAt) * 1000)
        if (!running || failure || at - last < interval * 0.8 || video.encodeQueueSize > 8) continue
        // l'image est posée dans le cadre fixe de la vidéo, centrée avec des bandes noires si la fenêtre change de proportions
        const k = Math.min(width / value.displayWidth, height / value.displayHeight)
        const w = value.displayWidth * k
        const h = value.displayHeight * k
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(value, (width - w) / 2, (height - h) / 2, w, h)
        const frame = new VideoFrame(canvas, { timestamp: at })
        const key = at - lastKey > 2_000_000
        if (key) lastKey = at
        video.encode(frame, { keyFrame: key })
        frame.close()
        last = at
        frames++
      } finally {
        value.close()
      }
    }
  }
  const readAudio = async (): Promise<void> => {
    if (!audioReader || !audio) return
    let samples = 0
    const offset = Math.round((performance.now() - startedAt) * 1000)
    const feed = (data: AudioData): void => {
      if (running && !failure) {
        const copy = new AudioData({
          format: 'f32',
          sampleRate: rate,
          numberOfFrames: data.numberOfFrames,
          numberOfChannels: channels,
          timestamp: Math.round(offset + (samples * 1_000_000) / rate),
          data: mixInterleaved(data, channels)
        })
        audio!.encode(copy)
        copy.close()
        samples += data.numberOfFrames
      }
      data.close()
    }
    if (firstAudio) feed(firstAudio)
    for (;;) {
      const { done, value } = await audioReader.read()
      if (done || !value) break
      feed(value)
    }
  }
  const loops = Promise.all([readVideo(), readAudio()]).catch((e) => {
    failure = e instanceof Error ? e : new Error(String(e))
  })

  const release = (): void => {
    running = false
    stopAll(display, micStream)
  }
  return {
    elapsed: () => (performance.now() - startedAt) / 1000,
    cancel: () => {
      release()
      try {
        video.close()
        audio?.close()
      } catch {
        /* déjà fermé */
      }
    },
    stop: async () => {
      const seconds = (performance.now() - startedAt) / 1000
      release()
      await loops
      try {
        if (failure) throw failure
        if (!frames) throw new Error('no frame')
        await video.flush()
        await audio?.flush()
        video.close()
        audio?.close()
        muxer.finalize()
        return { bytes: new Uint8Array(target.buffer), seconds, full }
      } catch (err) {
        return { error: 'failed', detail: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}

/** Les échantillons d'un bloc audio, en flottants entrelacés sur `channels` voies (les voies en trop sont laissées de côté). */
function mixInterleaved(data: AudioData, channels: number): Float32Array<ArrayBuffer> {
  const frames = data.numberOfFrames
  const out = new Float32Array(new ArrayBuffer(frames * channels * 4))
  const plane = new Float32Array(new ArrayBuffer(frames * 4))
  for (let c = 0; c < channels; c++) {
    data.copyTo(plane, { planeIndex: Math.min(c, data.numberOfChannels - 1), format: 'f32-planar' })
    for (let i = 0; i < frames; i++) out[i * channels + c] = plane[i]
  }
  return out
}
