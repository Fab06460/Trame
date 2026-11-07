import type { TrameDocument, TramePage } from '@/types'

/** Durée maximale d'une voix off, en secondes. */
export const MAX_VOICE_SECONDS = 600
/** Une voix embarquée (data URL base64) plus grosse que cela est ignorée à la lecture : de quoi tenir 10 minutes avec marge. */
export const MAX_VOICE_CHARS = 12_000_000
/** Total des voix d'un document, à la lecture. */
export const MAX_VOICES_TOTAL_CHARS = 60_000_000
/** Dans la vidéo, la voix commence un peu après l'arrivée sur la page et la page se prolonge un peu après elle (secondes). */
export const VOICE_DELAY = 0.3
export const VOICE_TAIL = 0.4
/** Seuls des types sans paramètres (`audio/webm`, pas `audio/webm;codecs=opus`) : le décodeur d'adresses de l'application ne lit pas les paramètres. */
const MIME = /^data:audio\/(webm|ogg|mp4);base64,/

/** Retire des `voices` celles qu'aucune page ne référence (pages ou voix supprimées) : elles alourdiraient le fichier pour rien. */
export function pruneVoices(doc: TrameDocument): TrameDocument {
  if (!doc.voices) return doc
  const used = new Set(doc.pages.flatMap((p) => (p.voice ? [p.voice.id] : [])))
  const kept = Object.fromEntries(Object.entries(doc.voices).filter(([id]) => used.has(id)))
  const { voices: _drop, ...rest } = doc
  void _drop
  return Object.keys(kept).length ? { ...rest, voices: kept } : rest
}

/** La voix d'une page avec ses octets, ou null si la page n'en a pas (ou si l'enregistrement manque). */
export function pageVoice(doc: Pick<TrameDocument, 'voices'>, page: Pick<TramePage, 'voice'>): { id: string; duration: number; data: string } | null {
  const v = page.voice
  const data = v ? doc.voices?.[v.id] : undefined
  return v && data ? { id: v.id, duration: v.duration, data } : null
}

/** Temps que la voix demande à sa page dans la vidéo : un petit silence avant, sa durée, un petit silence après. */
export const voiceNeed = (duration: number): number => VOICE_DELAY + duration + VOICE_TAIL

/**
 * Nettoyage à la lecture : voix et références invalides retirées, jamais devinées (une page dont la voix manque n'en a simplement plus).
 * Modifie en place.
 */
export function sanitizeVoices(doc: { voices?: unknown; pages: Array<Record<string, unknown>> }): void {
  const raw = doc.voices
  let clean: Record<string, string> | undefined
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    let total = 0
    const entries: Array<[string, string]> = []
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (id.length === 0 || id.length > 40 || typeof v !== 'string' || v.length > MAX_VOICE_CHARS || !MIME.test(v)) continue
      if (total + v.length > MAX_VOICES_TOTAL_CHARS) continue
      total += v.length
      entries.push([id, v])
    }
    if (entries.length) clean = Object.fromEntries(entries)
  }
  if (clean) doc.voices = clean
  else delete doc.voices
  for (const p of doc.pages) {
    const v = p.voice as Record<string, unknown> | undefined
    if (v === undefined) continue
    const ok = !!v && typeof v === 'object' && typeof v.id === 'string' && !!clean?.[v.id] && typeof v.duration === 'number' && Number.isFinite(v.duration) && v.duration > 0 && v.duration <= MAX_VOICE_SECONDS
    if (ok) p.voice = { id: v.id, duration: Math.round((v.duration as number) * 100) / 100 }
    else delete p.voice
  }
}
