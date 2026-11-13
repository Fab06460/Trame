import type { TrameDocument, TrameElement, VideoClip } from '@/types'

/** Un clip embarqué (data URL base64) plus gros que cela est ignoré à la lecture : 50 Mo en base64. */
export const MAX_CLIP_CHARS = 70_000_000
/** Total des clips d'un document, à la lecture. */
export const MAX_CLIPS_TOTAL_CHARS = 250_000_000
export const MAX_CLIP_SECONDS = 3600
const MIME = /^data:video\/(mp4|webm|quicktime|ogg);base64,/

/** Réglages par défaut d'un clip : il se lance tout seul, avec son, une fois. */
export const clipVolume = (v: VideoClip): number => (typeof v.volume === 'number' ? Math.min(1, Math.max(0, v.volume)) : 1)
export const clipAutoplay = (v: VideoClip): boolean => !v.manual
export const clipLoops = (v: VideoClip): boolean => !!v.loop

export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
/** Plus petit morceau gardé par un montage, en secondes (réduit pour un clip plus court que le double). */
export const MIN_TRIM = 0.2
const round2 = (n: number): number => Math.round(n * 100) / 100
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export const clipSpeed = (v: Partial<VideoClip>): number => (typeof v.speed === 'number' && Number.isFinite(v.speed) ? clamp(v.speed, MIN_SPEED, MAX_SPEED) : 1)

/** Le morceau du clip d'origine qui se joue (secondes) : tout le clip tant qu'il n'est pas monté. */
export function clipRange(v: Pick<VideoClip, 'duration' | 'start' | 'end'>): { start: number; end: number } {
  const start = typeof v.start === 'number' && Number.isFinite(v.start) && v.start > 0 && v.start < v.duration ? v.start : 0
  const end = typeof v.end === 'number' && Number.isFinite(v.end) && v.end > start && v.end < v.duration ? v.end : v.duration
  return { start, end }
}

/** Durée de lecture du clip monté (secondes) : le morceau gardé, divisé par la vitesse. */
export function clipLength(v: Pick<VideoClip, 'duration' | 'start' | 'end' | 'speed'>): number {
  const { start, end } = clipRange(v)
  return (end - start) / clipSpeed(v)
}

/**
 * L'instant du clip d'origine à montrer `elapsed` secondes après le début de sa lecture. En boucle le morceau recommence ; sinon il
 * s'arrête sur sa dernière image.
 */
export function clipSourceTime(v: Pick<VideoClip, 'duration' | 'start' | 'end' | 'speed' | 'loop'>, elapsed: number): number {
  const { start, end } = clipRange(v)
  const speed = clipSpeed(v)
  if (v.loop) return start + (elapsed % ((end - start) / speed)) * speed
  return Math.min(start + elapsed * speed, Math.max(start, end - 0.05))
}

/**
 * Les réglages d'un clip après modification : valeurs ramenées dans leurs limites (le début reste avant la fin d'au moins `MIN_TRIM`)
 * et seules celles qui s'écartent des valeurs par défaut sont gardées (comme à la lecture d'un fichier).
 */
export function withClipSettings(v: VideoClip, patch: { loop?: boolean; muted?: boolean; manual?: boolean; volume?: number; start?: number; end?: number; speed?: number }): VideoClip {
  const next: VideoClip = { id: v.id, duration: v.duration }
  const min = Math.min(MIN_TRIM, v.duration / 2)
  let { start, end } = clipRange(v)
  if (patch.start !== undefined) start = clamp(patch.start, 0, end - min)
  if (patch.end !== undefined) end = clamp(patch.end, start + min, v.duration)
  const speed = patch.speed !== undefined ? clamp(patch.speed, MIN_SPEED, MAX_SPEED) : clipSpeed(v)
  const volume = patch.volume ?? clipVolume(v)
  if (patch.loop ?? clipLoops(v)) next.loop = true
  if (patch.muted ?? !!v.muted) next.muted = true
  if (patch.manual ?? !!v.manual) next.manual = true
  if (volume < 1) next.volume = volume
  if (round2(start) > 0) next.start = round2(start)
  if (round2(end) < v.duration) next.end = round2(end)
  if (speed !== 1) next.speed = round2(speed)
  return next
}

/**
 * Coupe un clip monté à l'instant `at` (secondes du clip d'origine) : deux réglages qui partagent la même vidéo, le premier jusqu'à `at`,
 * le second à partir de `at`. Vitesse, son et boucle sont repris par les deux. Rend `null` si `at` laisse moins de `MIN_TRIM` d'un côté.
 */
export function splitClipAt(v: VideoClip, at: number): [VideoClip, VideoClip] | null {
  const { start, end } = clipRange(v)
  const min = Math.min(MIN_TRIM, v.duration / 2)
  if (!Number.isFinite(at) || at < start + min || at > end - min) return null
  return [withClipSettings(v, { end: at }), withClipSettings(v, { start: at })]
}

/** Retire des `clips` ceux qu'aucun élément ne référence (éléments supprimés) : ils alourdiraient le fichier pour rien. */
export function pruneClips(doc: TrameDocument): TrameDocument {
  if (!doc.clips) return doc
  const used = new Set<string>()
  for (const p of doc.pages) for (const e of p.elements) if (e.video) used.add(e.video.id)
  const kept = Object.fromEntries(Object.entries(doc.clips).filter(([id]) => used.has(id)))
  const { clips: _drop, ...rest } = doc
  void _drop
  return Object.keys(kept).length ? { ...rest, clips: kept } : rest
}

/** Le document sans ses clips (copies de secours, versions) : les éléments gardent leur image d'aperçu. */
export function withoutClips(doc: TrameDocument): TrameDocument {
  if (!doc.clips) return doc
  const { clips: _drop, ...rest } = doc
  void _drop
  return rest
}

/** Les éléments d'une page qui sont des clips vidéo (image d'aperçu + lecture). */
export const clipElements = (elements: readonly TrameElement[]): TrameElement[] => elements.filter((e) => e.type === 'image' && !!e.video && !e.hidden)

/**
 * Nettoyage à la lecture : clips et références invalides retirés, jamais devinés. Un élément dont le clip manque redevient une simple
 * image (son aperçu). Modifie en place.
 */
export function sanitizeClips(doc: { clips?: unknown; pages: Array<{ elements: Array<Record<string, unknown>> }> }): void {
  const raw = doc.clips
  let clean: Record<string, string> | undefined
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    let total = 0
    const entries: Array<[string, string]> = []
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (id.length === 0 || id.length > 40 || typeof v !== 'string' || v.length > MAX_CLIP_CHARS || !MIME.test(v)) continue
      if (total + v.length > MAX_CLIPS_TOTAL_CHARS) continue
      total += v.length
      entries.push([id, v])
    }
    if (entries.length) clean = Object.fromEntries(entries)
  }
  if (clean) doc.clips = clean
  else delete doc.clips
  for (const p of doc.pages) {
    for (const e of p.elements) {
      const v = e.video as Record<string, unknown> | undefined
      if (v === undefined) continue
      const ok = e.type === 'image' && v && typeof v === 'object' && typeof v.id === 'string' && !!clean?.[v.id] && typeof v.duration === 'number' && Number.isFinite(v.duration) && v.duration > 0 && v.duration <= MAX_CLIP_SECONDS
      if (!ok) {
        delete e.video
        continue
      }
      const out: Record<string, unknown> = { id: v.id, duration: v.duration }
      if (v.loop === true) out.loop = true
      if (v.muted === true) out.muted = true
      if (v.manual === true) out.manual = true
      if (typeof v.volume === 'number' && Number.isFinite(v.volume) && v.volume >= 0 && v.volume < 1) out.volume = v.volume
      const duration = v.duration as number
      const start = typeof v.start === 'number' && Number.isFinite(v.start) && v.start > 0 && v.start < duration ? v.start : 0
      if (start > 0) out.start = start
      if (typeof v.end === 'number' && Number.isFinite(v.end) && v.end > start && v.end < duration) out.end = v.end
      if (typeof v.speed === 'number' && Number.isFinite(v.speed) && v.speed >= MIN_SPEED && v.speed <= MAX_SPEED && v.speed !== 1) out.speed = v.speed
      e.video = out
    }
  }
}
