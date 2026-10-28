/** Mise en forme de l'écran de l'orateur : fonctions pures. */

/** Durée écoulée : `m:ss`, ou `h:mm:ss` à partir d'une heure. Jamais négative. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const NOTES_SIZE = { min: 16, max: 72, def: 28, step: 4 }

export const clampNotesSize = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(NOTES_SIZE.max, Math.max(NOTES_SIZE.min, Math.round(v))) : NOTES_SIZE.def)

/** Page suivante dans la présentation, ou null après la dernière. */
export const nextIndex = (index: number, count: number): number | null => (index + 1 < count ? index + 1 : null)
