import type { ClipPart, TrameDocument, TrameElement, VideoClip } from '@/types'

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

/** Plus de morceaux qu'une séquence n'en garde. */
export const MAX_PARTS = 12

/** Un morceau d'une séquence, réglages complétés : sa vidéo, le morceau gardé (secondes de la vidéo d'origine) et sa vitesse. */
export interface PartRange {
  id: string
  duration: number
  start: number
  end: number
  speed: number
}

type SequenceLike = Pick<VideoClip, 'duration' | 'start' | 'end' | 'speed'> & { id?: string; then?: ClipPart[] }

/** Les morceaux d'un clip, dans l'ordre : un seul tant qu'aucun autre n'est assemblé à sa suite. */
export function clipParts(v: SequenceLike): PartRange[] {
  const one = (p: Pick<ClipPart, 'duration' | 'start' | 'end' | 'speed'> & { id?: string }): PartRange => ({ id: p.id ?? '', duration: p.duration, ...clipRange(p), speed: clipSpeed(p) })
  return [one(v), ...(v.then ?? []).map(one)]
}

/** Les vidéos que lit un clip (la sienne, puis celles des morceaux assemblés), sans doublon. */
export const clipIds = (v: Pick<VideoClip, 'id' | 'then'>): string[] => [...new Set([v.id, ...(v.then ?? []).map((p) => p.id)])]

const partLength = (p: PartRange): number => (p.end - p.start) / p.speed

/** Durée de lecture du clip monté (secondes) : les morceaux gardés, chacun divisé par sa vitesse, mis bout à bout. */
export function clipLength(v: SequenceLike): number {
  return clipParts(v).reduce((n, p) => n + partLength(p), 0)
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
  if (v.then?.length) next.then = v.then
  return next
}

/**
 * Coupe un clip monté à l'instant `at` (secondes du clip d'origine) : deux réglages qui partagent la même vidéo, le premier jusqu'à `at`,
 * le second à partir de `at`. Vitesse, son et boucle sont repris par les deux. Rend `null` si `at` laisse moins de `MIN_TRIM` d'un côté.
 */
export function splitClipAt(v: VideoClip, at: number): [VideoClip, VideoClip] | null {
  if (v.then?.length) return null
  const { start, end } = clipRange(v)
  const min = Math.min(MIN_TRIM, v.duration / 2)
  if (!Number.isFinite(at) || at < start + min || at > end - min) return null
  return [withClipSettings(v, { end: at }), withClipSettings(v, { start: at })]
}

/**
 * L'instant à montrer `elapsed` secondes après le début de la lecture d'une séquence : la vidéo du morceau en cours et l'instant dans cette
 * vidéo (le montage — début, fin, vitesse — est appliqué). En boucle la séquence recommence ; sinon elle s'arrête sur sa dernière image.
 */
export function clipSourceAt(v: SequenceLike & { loop?: boolean }, elapsed: number): { id: string; time: number; index: number } {
  const parts = clipParts(v)
  const total = parts.reduce((n, p) => n + partLength(p), 0)
  let e = v.loop && total > 0 ? elapsed % total : elapsed
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const len = partLength(p)
    if (e < len) return { id: p.id, time: p.start + e * p.speed, index: i }
    if (i === parts.length - 1) return { id: p.id, time: Math.max(p.start, p.end - 0.05), index: i }
    e -= len
  }
  return { id: parts[0].id, time: parts[0].start, index: 0 }
}

const packPart = (p: PartRange): ClipPart => {
  const out: ClipPart = { id: p.id, duration: p.duration }
  if (round2(p.start) > 0) out.start = round2(p.start)
  if (round2(p.end) < p.duration) out.end = round2(p.end)
  if (p.speed !== 1) out.speed = round2(p.speed)
  return out
}

/** Un clip refait à partir de ses morceaux, avec le son, la boucle et la lecture automatique de `base`. */
export function composeClip(base: VideoClip, parts: PartRange[]): VideoClip {
  const [first, ...rest] = parts.map(packPart)
  const out: VideoClip = { ...first }
  if (base.loop) out.loop = true
  if (base.muted) out.muted = true
  if (base.manual) out.manual = true
  if (typeof base.volume === 'number' && base.volume < 1) out.volume = base.volume
  if (rest.length) out.then = rest
  return out
}

/** Les clips mis à la suite l'un de l'autre (réglages du premier) ; `null` s'il y en a moins de deux ou si la séquence serait trop longue. */
export function assembleClips(clips: VideoClip[]): VideoClip | null {
  if (clips.length < 2) return null
  const parts = clips.flatMap(clipParts)
  return parts.length > MAX_PARTS ? null : composeClip(clips[0], parts)
}

/** Réglage de début, de fin ou de vitesse du morceau `index` d'une séquence (mêmes limites que pour un clip seul). */
export function withPartSettings(v: VideoClip, index: number, patch: { start?: number; end?: number; speed?: number }): VideoClip {
  const parts = clipParts(v)
  const p = parts[index]
  if (!p) return v
  const changed = withClipSettings(packPart(p) as VideoClip, patch)
  const r = clipRange(changed)
  parts[index] = { id: p.id, duration: p.duration, start: r.start, end: r.end, speed: clipSpeed(changed) }
  return composeClip(v, parts)
}

/** Le morceau `index` déplacé d'un cran (`-1` vers le début, `1` vers la fin). */
export function moveClipPart(v: VideoClip, index: number, step: -1 | 1): VideoClip {
  const parts = clipParts(v)
  const to = index + step
  if (!parts[index] || to < 0 || to >= parts.length) return v
  ;[parts[index], parts[to]] = [parts[to], parts[index]]
  return composeClip(v, parts)
}

/** La séquence sans son morceau `index` (jamais le dernier qui reste). */
export function removeClipPart(v: VideoClip, index: number): VideoClip {
  const parts = clipParts(v)
  if (parts.length < 2 || !parts[index]) return v
  parts.splice(index, 1)
  return composeClip(v, parts)
}

/** Le morceau `index` seul, comme un clip à part entière (mêmes réglages de son, de boucle et de lecture). */
export function partAsClip(v: VideoClip, index: number): VideoClip | null {
  const p = clipParts(v)[index]
  return p ? composeClip(v, [p]) : null
}

/** Coupe le morceau `index` d'une séquence en deux morceaux à la suite à l'instant `at` (secondes de sa vidéo) ; `null` si impossible. */
export function splitPartAt(v: VideoClip, index: number, at: number): VideoClip | null {
  const parts = clipParts(v)
  const p = parts[index]
  if (!p || parts.length >= MAX_PARTS) return null
  const min = Math.min(MIN_TRIM, p.duration / 2)
  if (!Number.isFinite(at) || at < p.start + min || at > p.end - min) return null
  parts.splice(index, 1, { ...p, end: at }, { ...p, start: at })
  return composeClip(v, parts)
}

/** Retire des `clips` ceux qu'aucun élément ne référence (éléments supprimés) : ils alourdiraient le fichier pour rien. */
export function pruneClips(doc: TrameDocument): TrameDocument {
  if (!doc.clips) return doc
  const used = new Set<string>()
  for (const p of doc.pages) for (const e of p.elements) if (e.video) for (const id of clipIds(e.video)) used.add(id)
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
      const rawThen = v.then
      if (Array.isArray(rawThen)) {
        const then: Array<Record<string, unknown>> = []
        for (const q of rawThen.slice(0, MAX_PARTS - 1)) {
          const r = q as Record<string, unknown> | null
          if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !clean?.[r.id] || typeof r.duration !== 'number' || !Number.isFinite(r.duration) || r.duration <= 0 || r.duration > MAX_CLIP_SECONDS) continue
          const part: Record<string, unknown> = { id: r.id, duration: r.duration }
          const d = r.duration
          const ps = typeof r.start === 'number' && Number.isFinite(r.start) && r.start > 0 && r.start < d ? r.start : 0
          if (ps > 0) part.start = ps
          if (typeof r.end === 'number' && Number.isFinite(r.end) && r.end > ps && r.end < d) part.end = r.end
          if (typeof r.speed === 'number' && Number.isFinite(r.speed) && r.speed >= MIN_SPEED && r.speed <= MAX_SPEED && r.speed !== 1) part.speed = r.speed
          then.push(part)
        }
        if (then.length) out.then = then
      }
      e.video = out
    }
  }
}
