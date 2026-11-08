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

/** Niveau de la musique pendant une voix (de 0 à 1 : environ −10 dB), et durées de la baisse avant la voix et de la remontée après (secondes). */
export const DUCK_LEVEL = 0.3
export const DUCK_ATTACK = 0.25
export const DUCK_RELEASE = 0.5

/**
 * Baisse la musique sous les voix : `ranges` sont les passages parlés (début, fin, en secondes). Le volume descend en `DUCK_ATTACK` avant
 * chaque passage et remonte en `DUCK_RELEASE` après ; deux passages trop proches pour que la musique remonte vraiment sont réunis (pas de
 * pompage entre deux pages parlées). Modifie `track`, qui ne doit contenir que la musique.
 */
export function duckTrack(track: [Float32Array, Float32Array], ranges: ReadonlyArray<readonly [number, number]>): void {
  const sorted = ranges.filter(([a, b]) => b > a).map(([a, b]) => [a, b] as [number, number]).sort((p, q) => p[0] - q[0])
  const merged: Array<[number, number]> = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r[0] - last[1] < DUCK_ATTACK + DUCK_RELEASE) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  const frames = track[0].length
  for (const [start, end] of merged) {
    const from = clamp(Math.floor((start - DUCK_ATTACK) * AUDIO_RATE), 0, frames)
    const to = clamp(Math.ceil((end + DUCK_RELEASE) * AUDIO_RATE), 0, frames)
    for (let i = from; i < to; i++) {
      const t = i / AUDIO_RATE
      const down = clamp((t - (start - DUCK_ATTACK)) / DUCK_ATTACK, 0, 1)
      const up = clamp((t - end) / DUCK_RELEASE, 0, 1)
      const gain = 1 - (1 - DUCK_LEVEL) * Math.min(down, 1 - up)
      track[0][i] *= gain
      track[1][i] *= gain
    }
  }
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

/** Un son à ajouter à la bande son : sa place (secondes), son arrêt au plus tard, son volume, et s'il recommence. `source` est à `AUDIO_RATE`. */
export interface SoundEvent {
  source: readonly Float32Array[]
  at: number
  until: number
  volume: number
  loop: boolean
}

/**
 * Le morceau [start, end] (secondes) d'un son, joué à la vitesse donnée : plus vite = plus court et plus aigu (rééchantillonnage linéaire).
 * Sans montage, le son est rendu tel quel.
 */
export function trimSound(source: readonly Float32Array[], start: number, end: number, speed: number): Float32Array[] {
  const from = Math.max(0, Math.round(start * AUDIO_RATE))
  return source.map((channel) => {
    const to = Math.min(channel.length, Math.round(end * AUDIO_RATE))
    if (speed === 1) return channel.subarray(Math.min(from, to), to)
    const count = Math.max(0, Math.floor((to - from) / speed))
    const out = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const pos = from + i * speed
      const k = Math.floor(pos)
      const f = pos - k
      out[i] = channel[k] * (1 - f) + (channel[Math.min(k + 1, to - 1)] ?? channel[k]) * f
    }
    return out
  })
}

/** Une bande son silencieuse de la durée donnée (deux canaux). */
export const silence = (seconds: number): [Float32Array, Float32Array] => [new Float32Array(Math.max(0, Math.round(seconds * AUDIO_RATE))), new Float32Array(Math.max(0, Math.round(seconds * AUDIO_RATE)))]

/** Ajoute les sons à la bande (somme, ramenée entre −1 et 1). Un son commence à `at`, s'arrête à `until` ou à sa fin, recommence s'il boucle. Modifie `track`. */
export function addSounds(track: [Float32Array, Float32Array], events: readonly SoundEvent[]): void {
  for (const e of events) {
    const inL = e.source[0]
    const inR = e.source[1] ?? e.source[0]
    const n = inL?.length ?? 0
    if (n === 0) continue
    const volume = clamp(e.volume, 0, 1)
    const from = Math.max(0, Math.round(e.at * AUDIO_RATE))
    const to = Math.min(track[0].length, Math.round(e.until * AUDIO_RATE))
    for (let i = from; i < to; i++) {
      const k = i - from
      if (!e.loop && k >= n) break
      const at = k % n
      track[0][i] = clamp(track[0][i] + inL[at] * volume, -1, 1)
      track[1][i] = clamp(track[1][i] + inR[at] * volume, -1, 1)
    }
  }
}
