/** Catalogue de polices en ligne (Fontsource, qui reprend Google Fonts) : logique pure — lecture tolérante, variantes, adresses. Le réseau est dans index.ts. */

export const FONTS_API = 'https://api.fontsource.org'
export const FONTS_CDN = 'https://cdn.jsdelivr.net'
/** Un fichier de police (sous-ensemble latin, WOFF2) est petit ; au-delà, c'est qu'il y a un problème. */
export const MAX_FONT_BYTES = 1_500_000

export type FontVariant = '400' | '700' | '400-italic' | '700-italic'
export const ALL_VARIANTS: FontVariant[] = ['400', '700', '400-italic', '700-italic']

export interface CatalogFont {
  id: string
  name: string
  /** sans-serif, serif, display, handwriting, monospace */
  category: string
  license: string
  variants: FontVariant[]
}

/** Licences qui autorisent l'intégration dans un document et un PDF. */
const LICENSES = new Set(['OFL-1.1', 'Apache-2.0', 'CC0-1.0', 'MIT', 'Unlicense'])
const CATEGORIES = new Set(['sans-serif', 'serif', 'display', 'handwriting', 'monospace'])

/** Identifiant sûr (fait partie d'une adresse et d'un nom de dossier). */
export const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(id)

/** Variantes que Trame gère (graisses normale et gras, droit et italique) parmi celles que propose la police. */
export function variantsOf(weights: number[], styles: string[]): FontVariant[] {
  const out: FontVariant[] = []
  for (const w of [400, 700] as const) {
    if (!weights.includes(w)) continue
    if (styles.includes('normal')) out.push(String(w) as FontVariant)
    if (styles.includes('italic')) out.push(`${w}-italic` as FontVariant)
  }
  return out
}

/** Lecture tolérante du catalogue : seules les polices libres, avec un sous-ensemble latin et une graisse normale, sont gardées. */
export function parseCatalog(json: unknown): CatalogFont[] {
  if (!Array.isArray(json)) return []
  const out: CatalogFont[] = []
  for (const x of json) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const license = typeof o.license === 'string' ? (o.license.toUpperCase() === 'MIT' ? 'MIT' : o.license) : ''
    const weights = Array.isArray(o.weights) ? o.weights.filter((w): w is number => typeof w === 'number') : []
    const styles = Array.isArray(o.styles) ? o.styles.filter((s): s is string => typeof s === 'string') : []
    const subsets = Array.isArray(o.subsets) ? o.subsets : []
    const variants = variantsOf(weights, styles)
    if (!isSafeId(o.id) || typeof o.family !== 'string' || !o.family.trim() || o.family.length > 60 || /["\\<>]/.test(o.family)) continue
    if (!LICENSES.has(license) || !subsets.includes('latin') || !variants.includes('400')) continue
    out.push({ id: o.id, name: o.family.trim(), category: typeof o.category === 'string' && CATEGORIES.has(o.category) ? o.category : 'sans-serif', license, variants })
  }
  return out
}

/** Adresse d'un fichier de police (sous-ensemble latin, WOFF2) : même nomenclature que les paquets @fontsource. */
export function fontFileUrl(cdn: string, id: string, variant: FontVariant): string {
  const [weight, italic] = variant.split('-')
  return `${cdn.replace(/\/+$/, '')}/fontsource/fonts/${id}@latest/latin-${weight}-${italic ? 'italic' : 'normal'}.woff2`
}

/** Famille CSS stockée dans les éléments : nom entre guillemets puis famille générique (même forme que les polices embarquées). */
export function cssFamily(name: string, category: string): string {
  const generic = category === 'serif' ? 'serif' : category === 'monospace' ? 'monospace' : category === 'handwriting' ? 'cursive' : category === 'display' ? 'sans-serif' : 'sans-serif'
  return `"${name}", ${generic}`
}

/** Un fichier WOFF2 commence par « wOF2 » : on ne garde pas une page d'erreur HTML qui aurait le bon en-tête HTTP. */
export const isWoff2 = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32
