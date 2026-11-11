import { tm } from './i18n'
import type { PhotoSource } from '../shared/photoSources'
/** Recherche de photos libres (Wikimedia Commons, Openverse, NASA, Cleveland Museum of Art) : logique pure — adresses, lecture tolérante des réponses, crédits. Le réseau est dans index.ts. */
export type { PhotoSource }

export const OPENVERSE_BASE = 'https://api.openverse.org'
/** Les requêtes anonymes sont limitées à 20 résultats par page. */
export const PAGE_SIZE = 20
export const MAX_QUERY = 100
/** Taille maximale d'une image téléchargée (octets). */
export const MAX_IMAGE_BYTES = 30_000_000
export const MAX_THUMB_BYTES = 2_000_000

export interface Photo {
  id: string
  source: PhotoSource
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

/**
 * Adresse de recherche. `filtered` demande au service les licences qui autorisent l'usage commercial et la modification (on recadre,
 * filtre, recolore et exporte les images) ; sans lui, la requête est minimale — le tri par licence est alors refait ici
 * (`isReusable`), car le service refuse ou plante parfois sur les filtres (HTTP 500 constaté).
 */
export function searchUrl(base: string, query: string, page: number, filtered = true): string {
  const q = new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY), page: String(Math.max(1, Math.floor(page))), page_size: String(PAGE_SIZE) })
  if (filtered) q.set('license_type', 'commercial,modification')
  return `${base.replace(/\/+$/, '')}/v1/images/?${q}`
}

/** Licence qui autorise l'usage commercial ET la modification : ni « NC » (non commercial) ni « ND » (pas de modification). */
export function isReusable(license: unknown): boolean {
  const l = typeof license === 'string' ? license.toLowerCase() : ''
  return l === 'cc0' || l === 'pdm' || l === 'by' || l === 'by-sa'
}

/** Libellé lisible d'une licence Openverse (`by`, `by-sa`, `cc0`, `pdm`…) et de sa version. */
export function licenseLabel(license: unknown, version: unknown): string {
  const l = typeof license === 'string' ? license.toLowerCase() : ''
  const v = typeof version === 'string' && version ? version : ''
  if (l === 'cc0') return `CC0${v ? ' ' + v : ' 1.0'}`
  if (l === 'pdm') return tm('photo.publicDomain')
  if (!l) return tm('photo.unknownLicense')
  return `CC ${l.toUpperCase()}${v ? ' ' + v : ''}`
}

/** Une licence qui demande de citer l'auteur (tout sauf CC0 et domaine public). */
export const needsCredit = (label: string): boolean => !/^CC0/.test(label) && label !== tm('photo.publicDomain')

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
  const who = p.creator ? tm('photo.by', { name: p.creator }) : ''
  const where = p.landingUrl ? ` — ${p.landingUrl}` : ''
  return tm('photo.credit', { title: p.title || tm('doc.untitled'), who, license: p.license, where })
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
    if (!id || !isAllowedUrl(url, allowLocal) || !isAllowedUrl(thumbnailUrl, allowLocal) || !isReusable(x.license)) continue
    const license = licenseLabel(x.license, x.license_version)
    const base = { title: str(x.title, 120), creator: str(x.creator, 120), license, landingUrl: isAllowedUrl(str(x.foreign_landing_url, 2000), allowLocal) ? str(x.foreign_landing_url, 2000) : '' }
    photos.push({ id, source: 'openverse', ...base, licenseUrl: isAllowedUrl(str(x.license_url, 2000), allowLocal) ? str(x.license_url, 2000) : '', url, thumbnailUrl, width: posInt(x.width), height: posInt(x.height), credit: creditOf(base) })
  }
  return { photos, page: posInt(o.page) || 1, pageCount: posInt(o.page_count) || 1 }
}

/** Type d'image accepté (d'après l'en-tête de la réponse), ou null. */
export function imageMime(contentType: string | null): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return t === 'image/jpeg' || t === 'image/png' || t === 'image/webp' || t === 'image/gif' ? t : t === 'image/jpg' ? 'image/jpeg' : null
}

// --- Wikimedia Commons (source principale) ---------------------------------------------------------------------------------------
export const COMMONS_BASE = 'https://commons.wikimedia.org'

/**
 * Recherche de fichiers image (espace de noms 6) avec leurs métadonnées de licence et une miniature de 400 px.
 * `filetype:bitmap` écarte SVG, PDF et vidéos ; 20 résultats par page, la suivante par décalage.
 */
export function commonsUrl(base: string, query: string, page: number): string {
  const p = Math.max(1, Math.floor(page))
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${query.trim().slice(0, MAX_QUERY)} filetype:bitmap`,
    gsrlimit: String(PAGE_SIZE), gsroffset: String((p - 1) * PAGE_SIZE), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '400',
    iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName|LicenseUrl'
  })
  return `${base.replace(/\/+$/, '')}/w/api.php?${q}`
}

/** Texte brut d'un champ HTML des métadonnées (balises retirées, entités courantes décodées). */
export function stripHtml(html: unknown, max = 200): string {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Libellé d'une licence de Commons si elle autorise l'usage commercial ET la modification (CC BY, CC BY-SA, CC0, domaine public), sinon null. */
export function commonsLicense(short: unknown): string | null {
  const s = typeof short === 'string' ? short.trim() : ''
  if (/^CC BY(-SA)? \d/i.test(s)) return s.replace(/\s+/g, ' ').toUpperCase().replace(/^CC BY-SA/, 'CC BY-SA')
  if (/^CC0/i.test(s)) return 'CC0 1.0'
  if (/^(public domain|PD\b|PDM)/i.test(s)) return tm('photo.publicDomain')
  return null
}

const COMMONS_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Lecture tolérante d'une réponse de Commons ; une entrée sans licence réutilisable, sans type d'image ou sans adresse https est ignorée. */
export function parseCommons(json: unknown, page: number, allowLocal = false): { photos: Photo[]; page: number; pageCount: number } {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const query = (o.query && typeof o.query === 'object' ? o.query : {}) as Record<string, unknown>
  const pages = Object.values((query.pages && typeof query.pages === 'object' ? query.pages : {}) as Record<string, unknown>)
  const ranked = pages.map((p) => (p && typeof p === 'object' ? p : {}) as Record<string, unknown>).sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
  const photos: Photo[] = []
  for (const p of ranked) {
    const info = (Array.isArray(p.imageinfo) && p.imageinfo[0] && typeof p.imageinfo[0] === 'object' ? p.imageinfo[0] : {}) as Record<string, unknown>
    const meta = (info.extmetadata && typeof info.extmetadata === 'object' ? info.extmetadata : {}) as Record<string, { value?: unknown }>
    const license = commonsLicense(meta.LicenseShortName?.value)
    const url = str(info.url, 2000)
    const thumbnailUrl = str(info.thumburl, 2000) || url
    const pageId = typeof p.pageid === 'number' ? p.pageid : 0
    if (!license || !pageId || !COMMONS_MIME.has(str(info.mime, 40)) || !isAllowedUrl(url, allowLocal) || !isAllowedUrl(thumbnailUrl, allowLocal)) continue
    const title = stripHtml(meta.ObjectName?.value, 120) || str(p.title, 200).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
    const landing = str(info.descriptionurl, 2000)
    const base = { title, creator: stripHtml(meta.Artist?.value, 120), license, landingUrl: isAllowedUrl(landing, allowLocal) ? landing : '' }
    const licenseUrl = str(meta.LicenseUrl?.value, 2000)
    photos.push({ id: `commons:${pageId}`, source: 'commons', ...base, licenseUrl: isAllowedUrl(licenseUrl, allowLocal) ? licenseUrl : '', url, thumbnailUrl, width: posInt(info.width), height: posInt(info.height), credit: creditOf(base) })
  }
  // la page suivante existe si l'API propose une suite
  const more = !!(o.continue && typeof o.continue === 'object')
  return { photos, page, pageCount: more ? page + 1 : page }
}

// --- NASA Images (images-api.nasa.gov, sans clé) -----------------------------------------------------------------------------------
export const NASA_BASE = 'https://images-api.nasa.gov'
/** L'API de la NASA ne donne pas plus de résultats que cela de façon fiable : au-delà, la pagination s'arrête. */
const MAX_PAGES = 50

export function nasaUrl(base: string, query: string, page: number): string {
  const q = new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY), media_type: 'image', page: String(Math.max(1, Math.floor(page))), page_size: String(PAGE_SIZE) })
  return `${base.replace(/\/+$/, '')}/search?${q}`
}

const NASA_IMAGE = /\.(jpe?g|png|gif|webp)$/i

/**
 * Lecture tolérante d'une réponse de la NASA. Le contenu de la NASA n'est en règle générale pas soumis au droit d'auteur (sauf mention
 * contraire, rare) : il est présenté comme domaine public, crédité à l'auteur indiqué ou à la NASA.
 */
export function parseNasa(json: unknown, page: number, allowLocal = false): { photos: Photo[]; page: number; pageCount: number } {
  const collection = ((json && typeof json === 'object' ? json : {}) as Record<string, unknown>).collection
  const c = (collection && typeof collection === 'object' ? collection : {}) as Record<string, unknown>
  const items = Array.isArray(c.items) ? c.items : []
  const photos: Photo[] = []
  for (const it of items) {
    const item = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
    const data = (Array.isArray(item.data) && item.data[0] && typeof item.data[0] === 'object' ? item.data[0] : {}) as Record<string, unknown>
    const links = (Array.isArray(item.links) ? item.links : []).map((l) => (l && typeof l === 'object' ? l : {}) as Record<string, unknown>).filter((l) => l.render === 'image')
    const nasaId = str(data.nasa_id, 80)
    // l'original (« canonical ») pour l'insertion, la miniature « preview » (640 px) pour la liste, et de l'une à l'autre en repli
    const original = str(links.find((l) => l.rel === 'canonical')?.href, 2000)
    const preview = str(links.find((l) => l.rel === 'preview')?.href, 2000) || str(links.find((l) => l.rel === 'alternate')?.href, 2000)
    const url = NASA_IMAGE.test(original) ? original : preview
    const thumbnailUrl = preview || url
    if (!nasaId || str(data.media_type, 20) !== 'image' || !isAllowedUrl(url, allowLocal) || !isAllowedUrl(thumbnailUrl, allowLocal)) continue
    const landing = `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`
    const sized = (links.find((l) => l.rel === 'canonical') ?? links[0] ?? {}) as Record<string, unknown>
    const base = { title: str(data.title, 120), creator: str(data.secondary_creator, 120) || str(data.photographer, 120) || 'NASA', license: tm('photo.publicDomain'), landingUrl: landing }
    photos.push({ id: `nasa:${nasaId}`, source: 'nasa', ...base, licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', url, thumbnailUrl, width: posInt(sized.width), height: posInt(sized.height), credit: creditOf(base) })
  }
  const meta = (c.metadata && typeof c.metadata === 'object' ? c.metadata : {}) as Record<string, unknown>
  return { photos, page, pageCount: Math.max(1, Math.min(MAX_PAGES, Math.ceil(posInt(meta.total_hits) / PAGE_SIZE))) }
}

// --- Cleveland Museum of Art, Open Access (openaccess-api.clevelandart.org, sans clé, œuvres sous CC0) -------------------------------
export const CLEVELAND_BASE = 'https://openaccess-api.clevelandart.org'

export function clevelandUrl(base: string, query: string, page: number): string {
  const p = Math.max(1, Math.floor(page))
  const q = new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY), has_image: '1', cc0: '1', limit: String(PAGE_SIZE), skip: String((p - 1) * PAGE_SIZE) })
  return `${base.replace(/\/+$/, '')}/api/artworks/?${q}`
}

/** Lecture tolérante d'une réponse de Cleveland : seules les œuvres CC0 avec image sont gardées. */
export function parseCleveland(json: unknown, page: number, allowLocal = false): { photos: Photo[]; page: number; pageCount: number } {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const rows = Array.isArray(o.data) ? o.data : []
  const photos: Photo[] = []
  for (const r of rows) {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const images = (x.images && typeof x.images === 'object' ? x.images : {}) as Record<string, { url?: unknown; width?: unknown; height?: unknown } | undefined>
    const web = str(images.web?.url, 2000)
    const print = str(images.print?.url, 2000)
    const thumbnailUrl = web || print
    const url = print || web
    const id = typeof x.id === 'number' ? x.id : 0
    if (!id || str(x.share_license_status, 20) !== 'CC0' || !isAllowedUrl(url, allowLocal) || !isAllowedUrl(thumbnailUrl, allowLocal)) continue
    const creators = Array.isArray(x.creators) ? x.creators : []
    // « Claude Monet (French, 1840–1926) » : on ne garde que le nom
    const creator = str((creators[0] as { description?: unknown } | undefined)?.description, 160).replace(/\s*\(.*$/, '').trim()
    const landing = str(x.url, 2000)
    const base = { title: str(x.title, 120), creator, license: 'CC0 1.0', landingUrl: isAllowedUrl(landing, allowLocal) ? landing : '' }
    const size = images.print ?? images.web
    photos.push({ id: `cleveland:${id}`, source: 'cleveland', ...base, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', url, thumbnailUrl, width: posInt(Number(size?.width)), height: posInt(Number(size?.height)), credit: creditOf(base) })
  }
  const info = (o.info && typeof o.info === 'object' ? o.info : {}) as Record<string, unknown>
  return { photos, page, pageCount: Math.max(1, Math.min(MAX_PAGES, Math.ceil(posInt(info.total) / PAGE_SIZE))) }
}
