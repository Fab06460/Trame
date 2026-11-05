/** Fréquence d'échantillonnage de la piste son des vidéos exportées (celle que tous les lecteurs acceptent). */
export const AUDIO_RATE = 48000
/** Durée des fondus d'entrée et de sortie, en secondes (réduite pour une vidéo très courte). */
export const FADE_SECONDS = 2
/** Durée maximale du son une fois décodé (il est gardé en mémoire en 32 bits). */
export const MAX_AUDIO_SECONDS = 1200
export { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, isAudioFile } from '@shared/audioFiles'

export interface MusicOptions {
  /** de 0 (muet) à 1 (tel quel) */
  volume: number
  /** fondu d'entrée au début de la vidéo, fondu de sortie à la fin */
  fade: boolean
}

export const DEFAULT_MUSIC: MusicOptions = { volume: 0.7, fade: true }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * La musique mise à la durée de la vidéo : elle recommence si elle est plus courte, elle est coupée si elle est plus longue, puis le
 * volume et les fondus (linéaires) s'appliquent. Retourne deux canaux (gauche, droite) à `AUDIO_RATE` ; un son mono est doublé, au-delà
 * de deux canaux seuls les deux premiers servent. Une source vide donne du silence. `source` est déjà à `AUDIO_RATE`.
 */
export function mixTrack(source: readonly Float32Array[], seconds: number, options: MusicOptions): [Float32Array, Float32Array] {
  const frames = Math.max(0, Math.round(seconds * AUDIO_RATE))
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const inL = source[0]
  const inR = source[1] ?? source[0]
  const n = inL?.length ?? 0
  if (n === 0 || frames === 0) return [left, right]
  const volume = clamp(options.volume, 0, 1)
  const fade = options.fade ? Math.min(FADE_SECONDS, seconds / 2) * AUDIO_RATE : 0
  for (let i = 0; i < frames; i++) {
    const at = i % n
    let gain = volume
    if (fade > 0) gain *= Math.min(1, i / fade, (frames - 1 - i) / fade)
    left[i] = clamp(inL[at] * gain, -1, 1)
    right[i] = clamp(inR[at] * gain, -1, 1)
  }
  return [left, right]
}

export interface DecodedAudio {
  channels: Float32Array[]
  seconds: number
}

/** Décode un fichier audio (MP3, WAV, AAC, OGG, FLAC…) avec le décodeur du navigateur, ramené à `AUDIO_RATE`. */
export async function decodeAudio(bytes: Uint8Array): Promise<DecodedAudio> {
  const context = new OfflineAudioContext(2, 1, AUDIO_RATE)
  const buffer = await context.decodeAudioData(bytes.slice().buffer)
  return { channels: Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c).slice()), seconds: buffer.duration }
}
