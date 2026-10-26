/** Recherche de photos libres (Openverse) : logique pure — adresses, lecture tolérante des réponses, crédits. Le réseau est dans index.ts. */

export const OPENVERSE_BASE = 'https://api.openverse.org'
/** Les requêtes anonymes sont limitées à 20 résultats par page. */
export const PAGE_SIZE = 20
export const MAX_QUERY = 100
/** Taille maximale d'une image téléchargée (octets). */
export const MAX_IMAGE_BYTES = 30_000_000
export const MAX_THUMB_BYTES = 2_000_000

export interface Photo {
  id: string
  title: string
  creator: string
  /** « CC BY 4.0 », « CC0 1.0 », « Domaine public »… */
  license: string
  licenseUrl: string
  landingUrl: string
  /** adresses des fichiers (jamais envoyées à l'interface : seul le processus principal les télécharge) */
  url: string
  thumbnailUrl: string
  width: number
  height: number
  /** texte de crédit prêt à copier */
  credit: string
}

/** Adresse de recherche : usage commercial et modification autorisés (on recadre, filtre, recolore et exporte les images). */
export function searchUrl(base: string, query: string, page: number): string {
  const q = new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY), page: String(Math.max(1, Math.floor(page))), page_size: String(PAGE_SIZE), license_type: 'commercial,modification', mature: 'false' })
  return `${base.replace(/\/+$/, '')}/v1/images/?${q}`
}

/** Libellé lisible d'une licence Openverse (`by`, `by-sa`, `cc0`, `pdm`…) et de sa version. */
export function licenseLabel(license: unknown, version: unknown): string {
  const l = typeof license === 'string' ? license.toLowerCase() : ''
  const v = typeof version === 'string' && version ? version : ''
  if (l === 'cc0') return `CC0${v ? ' ' + v : ' 1.0'}`
  if (l === 'pdm') return 'Domaine public'
  if (!l) return 'Licence inconnue'
  return `CC ${l.toUpperCase()}${v ? ' ' + v : ''}`
}

/** Une licence qui demande de citer l'auteur (tout sauf CC0 et domaine public). */
export const needsCredit = (label: string): boolean => !/^(CC0|Domaine public)/.test(label)

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const posInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

/** Seules les adresses https sont suivies (et http://127.0.0.1 pour les tests de bout en bout). */
export function isAllowedUrl(url: string, allowLocal = false): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return true
    return allowLocal && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  } catch {
    return false
  }
}

export function creditOf(p: Pick<Photo, 'title' | 'creator' | 'license' | 'landingUrl'>): string {
  const who = p.creator ? ` par ${p.creator}` : ''
  const where = p.landingUrl ? ` — ${p.landingUrl}` : ''
  return `« ${p.title || 'Sans titre'} »${who} (${p.license})${where}`
}

/** Lecture tolérante d'une réponse de recherche : une entrée incomplète est ignorée, jamais d'erreur. */
export function parseSearch(json: unknown, allowLocal = false): { photos: Photo[]; page: number; pageCount: number } {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const results = Array.isArray(o.results) ? o.results : []
  const photos: Photo[] = []
  for (const r of results) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const id = str(x.id, 80)
    const url = str(x.url, 2000)
    // la miniature de l'API est un petit fichier bien plus léger que l'original : c'est aussi le repli si l'original est indisponible
    const thumbnailUrl = str(x.thumbnail, 2000) || url
    if (!id || !isAllowedUrl(url, allowLocal) || !isAllowedUrl(thumbnailUrl, allowLocal)) continue
    const license = licenseLabel(x.license, x.license_version)
    const base = { title: str(x.title, 120), creator: str(x.creator, 120), license, landingUrl: isAllowedUrl(str(x.foreign_landing_url, 2000), allowLocal) ? str(x.foreign_landing_url, 2000) : '' }
    photos.push({ id, ...base, licenseUrl: isAllowedUrl(str(x.license_url, 2000), allowLocal) ? str(x.license_url, 2000) : '', url, thumbnailUrl, width: posInt(x.width), height: posInt(x.height), credit: creditOf(base) })
  }
  return { photos, page: posInt(o.page) || 1, pageCount: posInt(o.page_count) || 1 }
}

/** Type d'image accepté (d'après l'en-tête de la réponse), ou null. */
export function imageMime(contentType: string | null): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return t === 'image/jpeg' || t === 'image/png' || t === 'image/webp' || t === 'image/gif' ? t : t === 'image/jpg' ? 'image/jpeg' : null
}
