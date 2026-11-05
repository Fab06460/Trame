/**
 * Messages entre le mode présentation (fenêtre principale) et l'écran de l'orateur (seconde fenêtre). Tout ce qui traverse les IPC
 * est validé ici : une fenêtre ne doit jamais pouvoir faire planter l'autre avec un message mal formé.
 */

/** État partagé. `doc` (le document figé de la présentation, en JSON) n'est envoyé qu'à l'ouverture ; ensuite `null` = inchangé. */
export interface SpeakerState {
  doc: string | null
  index: number
  /** nombre de clics déjà faits sur la page (éléments qui apparaissent pas à pas) */
  step: number
  black: boolean
  /** début de la présentation (ms depuis 1970) : le chronomètre des deux fenêtres part du même instant */
  startedAt: number
}

export type SpeakerCommand = { type: 'go'; index: number } | { type: 'next' } | { type: 'prev' } | { type: 'black' } | { type: 'exit' } | { type: 'swap' }

/** Taille maximale d'un document transmis (caractères de JSON) : au-delà, on refuse plutôt que de saturer la mémoire. */
export const MAX_SPEAKER_DOC = 400_000_000

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000

export function parseSpeakerState(v: unknown): SpeakerState | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!(o.doc === null || (typeof o.doc === 'string' && o.doc.length <= MAX_SPEAKER_DOC))) return null
  if (!isIndex(o.index) || typeof o.black !== 'boolean') return null
  // `step` absent (ancienne fenêtre) : aucun clic fait
  if (!(o.step === undefined || isIndex(o.step))) return null
  if (typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt)) return null
  return { doc: o.doc as string | null, index: o.index, step: (o.step as number | undefined) ?? 0, black: o.black, startedAt: o.startedAt }
}

export function parseSpeakerCommand(v: unknown): SpeakerCommand | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.type === 'go') return isIndex(o.index) ? { type: 'go', index: o.index } : null
  if (o.type === 'next' || o.type === 'prev' || o.type === 'black' || o.type === 'exit' || o.type === 'swap') return { type: o.type }
  return null
}

/** Nouvel état cumulé : un `doc` null conserve le document déjà connu. */
export function mergeSpeakerState(prev: SpeakerState | null, next: SpeakerState): SpeakerState {
  return { ...next, doc: next.doc ?? prev?.doc ?? null }
}
