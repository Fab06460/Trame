import { decodeAudio } from '@/audioTrack'
import { toBase64 } from '@/clipActions'
import { MAX_VOICE_CHARS } from '@/voiceOver'

export type VoiceProblem = 'denied' | 'noMic' | 'tooBig' | 'error'

/** Un enregistrement en cours. */
export interface Recorder {
  /** Termine l'enregistrement et rend l'audio (adresse de données) et sa durée, ou le problème rencontré. */
  stop: () => Promise<{ data: string; duration: number } | { error: VoiceProblem; detail?: string }>
  /** Abandonne l'enregistrement et libère le micro. */
  cancel: () => void
  /** Niveau sonore actuel, de 0 à 1 (pour le témoin). */
  level: () => number
  /** Secondes écoulées. */
  elapsed: () => number
}

/** Débit de la voix : 64 kbit/s en Opus, soit environ 0,5 Mo par minute, largement assez pour de la parole. */
const BITRATE = 64_000

/**
 * Demande le micro (le système peut afficher sa propre question la première fois) et commence à enregistrer. Le son est de l'Opus dans un
 * conteneur WebM, sans paramètres de codec dans l'adresse de données (le décodeur d'adresses de l'application n'en lit pas).
 */
export async function startRecording(): Promise<Recorder | { error: VoiceProblem; detail?: string }> {
  if ((await window.trame.micAccess()) === 'denied') return { error: 'denied' }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return { error: 'denied' }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { error: 'noMic' }
    return { error: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
  const type = ['audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: BITRATE })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  const startedAt = performance.now()
  recorder.start(250)

  const release = (): void => {
    for (const track of stream.getTracks()) track.stop()
    void context.close().catch(() => {})
  }
  return {
    level: () => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += v * v
      return Math.min(1, Math.sqrt(sum / samples.length) * 4)
    },
    elapsed: () => (performance.now() - startedAt) / 1000,
    cancel: () => {
      recorder.ondataavailable = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = async () => {
          release()
          try {
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
            const duration = (await decodeAudio(bytes)).seconds
            const data = `data:audio/webm;base64,${toBase64(bytes)}`
            resolve(data.length > MAX_VOICE_CHARS ? { error: 'tooBig' } : { data, duration })
          } catch (err) {
            resolve({ error: 'error', detail: err instanceof Error ? err.message : String(err) })
          }
        }
        if (recorder.state === 'inactive') recorder.onstop(new Event('stop'))
        else recorder.stop()
      })
  }
}
