/** Longueur maximale d'une adresse de lien. */
export const MAX_LINK_CHARS = 2000

const OPENABLE = ['http:', 'https:', 'mailto:']

/**
 * Met en forme ce que l'utilisateur a saisi comme adresse de lien : `https://` est ajouté devant « exemple.fr », `mailto:` devant une
 * adresse de courrier. Seuls les liens web (http, https) et de courrier (mailto) sont acceptés : tout autre schéma (`javascript:`,
 * `file:`, `data:`…) est refusé. Rend l'adresse normalisée, ou `null` si elle n'est pas utilisable.
 */
export function normalizeLink(input: string): string | null {
  const text = input.trim()
  if (!text || /\s/.test(text) || text.length > MAX_LINK_CHARS) return null
  let candidate: string
  if (/^(https?:\/\/|mailto:)/i.test(text)) candidate = text
  else if (text.includes('@') && !text.includes('/')) candidate = `mailto:${text}`
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null // un autre schéma (javascript:, file:, data:…)
  else candidate = `https://${text}`
  try {
    const url = new URL(candidate)
    if (!OPENABLE.includes(url.protocol)) return null
    if (url.protocol === 'mailto:' ? !url.pathname : !url.hostname) return null
    return url.href.length <= MAX_LINK_CHARS ? url.href : null
  } catch {
    return null
  }
}

/** L'adresse peut être confiée au navigateur du système : déjà normalisée, web ou courrier seulement. */
export function isOpenableLink(url: unknown): url is string {
  return typeof url === 'string' && normalizeLink(url) === url
}
