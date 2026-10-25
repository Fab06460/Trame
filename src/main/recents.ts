/** Liste des projets récents : logique pure (la lecture/écriture du fichier est dans index.ts). */

export const MAX_RECENTS = 12

export interface RecentEntry {
  path: string
  openedAt: number
}

/** Place `path` en tête (sans doublon) et tronque à `max` entrées. */
export function pushRecent(list: RecentEntry[], path: string, now: number, max = MAX_RECENTS): RecentEntry[] {
  return [{ path, openedAt: now }, ...list.filter((e) => e.path !== path)].slice(0, max)
}

export const removeRecent = (list: RecentEntry[], path: string): RecentEntry[] => list.filter((e) => e.path !== path)

/** Lit le fichier de persistance ; tout contenu illisible ou invalide donne une liste vide / filtrée, sans erreur. */
export function parseRecents(raw: string): RecentEntry[] {
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter((e) => e && typeof e.path === 'string' && e.path.endsWith('.trame') && Number.isFinite(e.openedAt))
      .map((e) => ({ path: e.path, openedAt: e.openedAt }))
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}
