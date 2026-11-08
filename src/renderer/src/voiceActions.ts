import { ArrayBufferTarget, Muxer } from 'webm-muxer'
import { AUDIO_RATE, decodeAudio } from '@/audioTrack'
import { toBase64 } from '@/clipActions'
import { MAX_VOICE_CHARS, MAX_VOICE_SECONDS, monoMix } from '@/voiceOver'

export type VoiceProblem = 'denied' | 'noMic' | 'tooBig' | 'error' | 'fileTooBig' | 'fileTooLong' | 'fileUnreadable'

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

const VOICE_CONFIG: AudioEncoderConfig = { codec: 'opus', sampleRate: AUDIO_RATE, numberOfChannels: 1, bitrate: BITRATE }

/** Encode un son mono (à `AUDIO_RATE`) en Opus dans un WebM : le même format que l'enregistrement au micro, quel que soit le fichier d'origine. */
async function encodeVoice(samples: Float32Array): Promise<Uint8Array> {
  if (typeof AudioEncoder === 'undefined' || !(await AudioEncoder.isConfigSupported(VOICE_CONFIG)).supported) throw new Error('opus')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, audio: { codec: 'A_OPUS', numberOfChannels: 1, sampleRate: AUDIO_RATE } })
  let failure: Error | null = null
  const encoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) })
  encoder.configure(VOICE_CONFIG)
  const BLOCK = AUDIO_RATE
  for (let at = 0; at < samples.length && !failure; at += BLOCK) {
    const part = samples.subarray(at, at + BLOCK)
    const block = new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((at * 1_000_000) / AUDIO_RATE), data: part.slice() })
    encoder.encode(block)
    block.close()
  }
  await encoder.flush()
  encoder.close()
  if (failure) throw failure
  muxer.finalize()
  return new Uint8Array(target.buffer)
}

/**
 * « Importer un fichier audio… » : choisit un fichier (MP3, WAV, M4A, OGG, FLAC…), le décode, le passe en mono et le garde en Opus dans un
 * WebM, comme un enregistrement. `null` si le choix est annulé.
 */
export async function importVoice(): Promise<{ data: string; duration: number } | { error: VoiceProblem; detail?: string } | null> {
  const picked = await window.trame.pickAudio()
  if (!picked) return null
  if ('error' in picked) return { error: picked.error === 'tooBig' ? 'fileTooBig' : 'fileUnreadable' }
  let audio
  try {
    audio = await decodeAudio(picked.bytes)
  } catch {
    return { error: 'fileUnreadable' }
  }
  if (!audio.channels.length || audio.seconds <= 0) return { error: 'fileUnreadable' }
  if (audio.seconds > MAX_VOICE_SECONDS) return { error: 'fileTooLong' }
  try {
    const bytes = await encodeVoice(monoMix(audio.channels))
    const data = `data:audio/webm;base64,${toBase64(bytes)}`
    return data.length > MAX_VOICE_CHARS ? { error: 'tooBig' } : { data, duration: audio.seconds }
  } catch (err) {
    return { error: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}
