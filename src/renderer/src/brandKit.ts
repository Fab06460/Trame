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

/** Nettoie un kit lu quelque part (fichier, bibliothèque) : tout ce qui est invalide est écarté, les limites sont appliquées. */
function sanitizeKit(data: Partial<Record<keyof BrandKit, unknown>> | null | undefined): BrandKit {
  const colors = Array.isArray(data?.colors) ? data.colors.map(normalizeColor).filter((c): c is string => !!c) : []
  const fonts = Array.isArray(data?.fonts) ? data.fonts.filter(isFontFamily) : []
  const logos = Array.isArray(data?.logos) ? data.logos.filter(isLogo).map((l) => ({ id: l.id, name: l.name.slice(0, 60), src: l.src })) : []
  return { colors: unique(colors).slice(0, MAX_COLORS), fonts: unique(fonts).slice(0, MAX_FONTS), logos: logos.slice(0, MAX_LOGOS) }
}

/** Lecture tolérante du fichier : tout ce qui est invalide est écarté, les limites sont appliquées, jamais d'erreur. */
export function parseBrandKit(raw: string | null | undefined): BrandKit {
  try {
    return sanitizeKit(JSON.parse(raw ?? '') as Partial<Record<keyof BrandKit, unknown>>)
  } catch {
    return emptyKit()
  }
}

// ——— Plusieurs kits ———

export const MAX_KITS = 12
export const MAX_KIT_NAME = 40
/** Total des logos de tous les kits : le fichier est relu et réécrit en entier, et le processus principal refuse au-delà de 40 Mo. */
export const MAX_TOTAL_LOGO_CHARS = 30_000_000

/** Un kit de la bibliothèque, avec son identifiant et son nom. */
export interface NamedKit extends BrandKit {
  id: string
  name: string
}

/** Tous les kits de la personne, et celui qui est actif (celui que montrent le panneau, les polices en tête du sélecteur et Style Match). */
export interface BrandLibrary {
  active: string
  kits: NamedKit[]
}

const cleanName = (name: unknown, fallback: string): string => {
  const n = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_KIT_NAME) : ''
  return n || fallback
}

export const newKit = (id: string, name: string, content: BrandKit = emptyKit()): NamedKit => ({ ...content, id, name: cleanName(name, 'Kit') })

/**
 * Lit le fichier des kits. Deux formes : la bibliothèque (`{ version: 2, active, kits }`) et l'ancien fichier d'un seul kit (celui des
 * versions précédentes), qui devient le premier kit, nommé `defaultName`. Jamais d'erreur ; il y a toujours au moins un kit.
 */
export function parseLibrary(raw: string | null | undefined, defaultName: string): BrandLibrary {
  let data: unknown = null
  try {
    data = JSON.parse(raw ?? '')
  } catch {
    /* fichier absent ou illisible : un kit vide */
  }
  const obj = data as { version?: unknown; active?: unknown; kits?: unknown } | null
  if (obj && obj.version === 2 && Array.isArray(obj.kits)) {
    const kits: NamedKit[] = []
    for (const k of obj.kits.slice(0, MAX_KITS)) {
      const o = k as { id?: unknown; name?: unknown } | null
      if (!o || typeof o.id !== 'string' || !o.id || kits.some((x) => x.id === o.id)) continue
      kits.push({ ...sanitizeKit(k as Partial<Record<keyof BrandKit, unknown>>), id: o.id, name: cleanName(o.name, defaultName) })
    }
    if (kits.length) return { active: kits.some((k) => k.id === obj.active) ? (obj.active as string) : kits[0].id, kits }
    return { active: 'kit-1', kits: [newKit('kit-1', defaultName)] }
  }
  const kit = obj && typeof obj === 'object' ? sanitizeKit(obj as Partial<Record<keyof BrandKit, unknown>>) : emptyKit()
  return { active: 'kit-1', kits: [newKit('kit-1', defaultName, kit)] }
}

export const serializeLibrary = (lib: BrandLibrary): string => JSON.stringify({ version: 2, ...lib })

export const activeKit = (lib: BrandLibrary): NamedKit => lib.kits.find((k) => k.id === lib.active) ?? lib.kits[0]

/** Applique un changement au kit actif ; la bibliothèque est rendue telle quelle si le kit n'a pas changé. */
export function updateActive(lib: BrandLibrary, fn: (kit: BrandKit) => BrandKit): BrandLibrary {
  const current = activeKit(lib)
  const next = fn(current)
  if (next === current) return lib
  return { ...lib, kits: lib.kits.map((k) => (k.id === current.id ? { ...next, id: k.id, name: k.name } : k)) }
}

/** Nom libre : `base`, sinon `base (2)`, `base (3)`… */
export function uniqueName(lib: BrandLibrary, base: string): string {
  const b = cleanName(base, 'Kit')
  const taken = new Set(lib.kits.map((k) => k.name.toLowerCase()))
  if (!taken.has(b.toLowerCase())) return b
  for (let i = 2; ; i++) {
    const n = `${b.slice(0, MAX_KIT_NAME - 5)} (${i})`
    if (!taken.has(n.toLowerCase())) return n
  }
}

/** Ajoute un kit et le rend actif ; bibliothèque pleine : inchangée. */
export function addKit(lib: BrandLibrary, kit: NamedKit): BrandLibrary {
  if (lib.kits.length >= MAX_KITS || lib.kits.some((k) => k.id === kit.id)) return lib
  return { active: kit.id, kits: [...lib.kits, { ...kit, name: uniqueName(lib, kit.name) }] }
}

export function renameKit(lib: BrandLibrary, id: string, name: string): BrandLibrary {
  const target = lib.kits.find((k) => k.id === id)
  if (!target) return lib
  const others = { ...lib, kits: lib.kits.filter((k) => k.id !== id) }
  const next = uniqueName(others, cleanName(name, target.name))
  return next === target.name ? lib : { ...lib, kits: lib.kits.map((k) => (k.id === id ? { ...k, name: next } : k)) }
}

/** Copie d'un kit, sous un nouvel identifiant (les logos aussi, pour qu'on puisse en retirer un d'un kit sans l'enlever de l'autre). */
export function duplicateKit(lib: BrandLibrary, id: string, newId: string, name: string, newLogoId: () => string): BrandLibrary {
  const src = lib.kits.find((k) => k.id === id)
  if (!src) return lib
  return addKit(lib, { ...src, id: newId, name, logos: src.logos.map((l) => ({ ...l, id: newLogoId() })) })
}

/** Supprime un kit ; le dernier ne se supprime pas (il y a toujours un kit). Le suivant, ou le précédent, devient actif. */
export function deleteKit(lib: BrandLibrary, id: string): BrandLibrary {
  const i = lib.kits.findIndex((k) => k.id === id)
  if (i < 0 || lib.kits.length <= 1) return lib
  const kits = lib.kits.filter((k) => k.id !== id)
  return { active: lib.active === id ? kits[Math.min(i, kits.length - 1)].id : lib.active, kits }
}

export const selectKit = (lib: BrandLibrary, id: string): BrandLibrary => (lib.kits.some((k) => k.id === id) && lib.active !== id ? { ...lib, active: id } : lib)

export const logoChars = (lib: BrandLibrary): number => lib.kits.reduce((n, k) => n + k.logos.reduce((m, l) => m + l.src.length, 0), 0)

/** Ajoute un logo au kit actif en respectant le total de tous les kits ; `null` quand il ne tient pas. */
export function addLogoChecked(lib: BrandLibrary, logo: BrandLogo): BrandLibrary | null {
  if (logoChars(lib) + logo.src.length > MAX_TOTAL_LOGO_CHARS) return null
  const next = updateActive(lib, (k) => addLogo(k, logo))
  return next === lib ? null : next
}

// ——— Fichier d'échange d'un kit (.tramekit) ———

export const KIT_EXTENSION = 'tramekit'

/** Un kit dans un fichier à partager : son nom et son contenu. */
export const serializeKitFile = (kit: NamedKit): string => JSON.stringify({ trameKit: 1, name: kit.name, colors: kit.colors, fonts: kit.fonts, logos: kit.logos })

/** Lit un fichier de kit : le nom et le contenu nettoyé, ou `null` quand ce n'en est pas un. */
export function parseKitFile(raw: string | null | undefined): { name: string; kit: BrandKit } | null {
  try {
    const data = JSON.parse(raw ?? '') as { trameKit?: unknown; name?: unknown } & Partial<Record<keyof BrandKit, unknown>>
    if (!data || data.trameKit !== 1) return null
    return { name: cleanName(data.name, ''), kit: sanitizeKit(data) }
  } catch {
    return null
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
