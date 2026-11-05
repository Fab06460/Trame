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
      e.video = out
    }
  }
}
