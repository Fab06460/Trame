export const MAX_COLORS = 24
export const MAX_FONTS = 8
export const MAX_LOGOS = 12
export const MAX_RECENT = 12
/** Taille maximale d'un logo (data URL) : le kit est relu et réécrit en entier à chaque changement. */
export const MAX_LOGO_CHARS = 3_000_000

export interface BrandLogo {
  id: string
  name: string
  src: string
}

/** Kit de marque : couleurs officielles (`#rrggbb`), polices (familles CSS de `FONTS`) et logos (images). */
export interface BrandKit {
  colors: string[]
  fonts: string[]
  logos: BrandLogo[]
}

/** Famille CSS telle que stockée dans les éléments : `"Nom", serif`. La police n'a pas besoin d'être présente sur ce poste (une police en ligne peut avoir été retirée). */
export const isFontFamily = (f: unknown): f is string => typeof f === 'string' && /^"[^"\\<>]{1,60}", [a-z-]+$/.test(f)

export const emptyKit = (): BrandKit => ({ colors: [], fonts: [], logos: [] })

/** `#rgb` / `#rrggbb` (casse libre) → `#rrggbb` minuscule ; null pour tout le reste. */
export function normalizeColor(c: unknown): string | null {
  if (typeof c !== 'string') return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  const h = m[1].toLowerCase()
  return `#${h.length === 3 ? [...h].map((x) => x + x).join('') : h}`
}

const unique = <T>(list: T[]): T[] => [...new Set(list)]

const isLogo = (l: unknown): l is BrandLogo => {
  const o = l as Partial<BrandLogo> | null
  return !!o && typeof o.id === 'string' && !!o.id && typeof o.name === 'string' && typeof o.src === 'string' && o.src.startsWith('data:image/') && o.src.length <= MAX_LOGO_CHARS
}

/** Lecture tolérante du fichier : tout ce qui est invalide est écarté, les limites sont appliquées, jamais d'erreur. */
export function parseBrandKit(raw: string | null | undefined): BrandKit {
  try {
    const data = JSON.parse(raw ?? '') as Partial<Record<keyof BrandKit, unknown>>
    const colors = Array.isArray(data.colors) ? data.colors.map(normalizeColor).filter((c): c is string => !!c) : []
    const fonts = Array.isArray(data.fonts) ? data.fonts.filter(isFontFamily) : []
    const logos = Array.isArray(data.logos) ? data.logos.filter(isLogo).map((l) => ({ id: l.id, name: l.name.slice(0, 60), src: l.src })) : []
    return { colors: unique(colors).slice(0, MAX_COLORS), fonts: unique(fonts).slice(0, MAX_FONTS), logos: logos.slice(0, MAX_LOGOS) }
  } catch {
    return emptyKit()
  }
}

/** Ajoute une couleur (sans doublon, dans la limite) ; couleur invalide ou kit plein : kit inchangé. */
export function addColor(kit: BrandKit, color: string): BrandKit {
  const c = normalizeColor(color)
  if (!c || kit.colors.includes(c) || kit.colors.length >= MAX_COLORS) return kit
  return { ...kit, colors: [...kit.colors, c] }
}
export const removeColor = (kit: BrandKit, color: string): BrandKit => ({ ...kit, colors: kit.colors.filter((c) => c !== color) })

export function addFont(kit: BrandKit, family: string): BrandKit {
  if (kit.fonts.includes(family) || kit.fonts.length >= MAX_FONTS || !isFontFamily(family)) return kit
  return { ...kit, fonts: [...kit.fonts, family] }
}
export const removeFont = (kit: BrandKit, family: string): BrandKit => ({ ...kit, fonts: kit.fonts.filter((f) => f !== family) })

export function addLogo(kit: BrandKit, logo: BrandLogo): BrandKit {
  if (!isLogo(logo) || kit.logos.length >= MAX_LOGOS) return kit
  return { ...kit, logos: [...kit.logos, logo] }
}
export const removeLogo = (kit: BrandKit, id: string): BrandKit => ({ ...kit, logos: kit.logos.filter((l) => l.id !== id) })

/** Couleurs récentes : la plus récente en tête, sans doublon, bornées. */
export function pushRecentColor(list: string[], color: string): string[] {
  const c = normalizeColor(color)
  if (!c) return list
  return [c, ...list.filter((x) => x !== c)].slice(0, MAX_RECENT)
}
