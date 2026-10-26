import type { Crop, ImageFilters, TrameElement } from '@/types'

export const FILTER_LIMITS = {
  brightness: { min: -100, max: 100 },
  contrast: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  grayscale: { min: 0, max: 100 },
  sepia: { min: 0, max: 100 },
  blur: { min: 0, max: 40 }
} as const

export type FilterKey = keyof typeof FILTER_LIMITS

/** Taille minimale de la zone visible, en fraction de l'image : évite un recadrage réduit à rien. */
export const MIN_CROP = 0.05

/** Réglages prédéfinis (boutons « Filtres ») ; chacun remplace l'ensemble des réglages. */
export const FILTER_PRESETS: { name: string; filters: ImageFilters }[] = [
  { name: 'Aucun', filters: {} },
  { name: 'Noir & blanc', filters: { grayscale: 100, contrast: 10 } },
  { name: 'Sépia', filters: { sepia: 80, contrast: 5 } },
  { name: 'Vif', filters: { saturation: 40, contrast: 15 } },
  { name: 'Fané', filters: { saturation: -35, contrast: -15, brightness: 10 } },
  { name: 'Contrasté', filters: { contrast: 40, brightness: -5 } }
]

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Réglages réellement actifs (valeurs non neutres). */
export function activeFilters(el: Pick<TrameElement, 'filters'>): ImageFilters {
  const out: ImageFilters = {}
  const f = el.filters
  if (!f) return out
  for (const k of Object.keys(FILTER_LIMITS) as FilterKey[]) if (isNum(f[k]) && f[k] !== 0) out[k] = f[k]
  return out
}

export const hasFilters = (el: Pick<TrameElement, 'filters'>): boolean => Object.keys(activeFilters(el)).length > 0
export const hasCrop = (el: Pick<TrameElement, 'crop'>): boolean => !!el.crop
export const hasFlip = (el: Pick<TrameElement, 'flipX' | 'flipY'>): boolean => !!el.flipX || !!el.flipY

/** L'image doit-elle être retravaillée avant d'être dessinée ? (sinon on l'utilise telle quelle, sans perte) */
export const hasImageEdits = (el: Pick<TrameElement, 'filters' | 'crop' | 'flipX' | 'flipY'>): boolean =>
  hasFilters(el) || hasCrop(el) || hasFlip(el)

/**
 * Valeur de la propriété CSS/canvas `filter`. `blurScale` convertit les pixels de design en pixels de l'image dessinée.
 * Retourne `'none'` sans réglage. Le même texte sert au canvas (export) et aux miniatures.
 */
export function cssFilter(el: Pick<TrameElement, 'filters'>, blurScale = 1): string {
  const f = activeFilters(el)
  const parts: string[] = []
  if (f.brightness !== undefined) parts.push(`brightness(${(1 + f.brightness / 100).toFixed(3)})`)
  if (f.contrast !== undefined) parts.push(`contrast(${(1 + f.contrast / 100).toFixed(3)})`)
  if (f.saturation !== undefined) parts.push(`saturate(${(1 + f.saturation / 100).toFixed(3)})`)
  if (f.grayscale !== undefined) parts.push(`grayscale(${(f.grayscale / 100).toFixed(3)})`)
  if (f.sepia !== undefined) parts.push(`sepia(${(f.sepia / 100).toFixed(3)})`)
  if (f.blur !== undefined) parts.push(`blur(${(f.blur * blurScale).toFixed(2)}px)`)
  return parts.length ? parts.join(' ') : 'none'
}

/** Clé de cache décrivant exactement les retouches (deux éléments identiques partagent le même rendu). */
export const editKey = (el: Pick<TrameElement, 'filters' | 'crop' | 'flipX' | 'flipY'>): string =>
  JSON.stringify([el.crop ?? null, !!el.flipX, !!el.flipY, activeFilters(el)])

/** Recadrage valide : dans l'image, au moins MIN_CROP dans chaque sens. */
export function clampCrop(c: Crop): Crop {
  const width = clamp(c.width, MIN_CROP, 1)
  const height = clamp(c.height, MIN_CROP, 1)
  return { x: clamp(c.x, 0, 1 - width), y: clamp(c.y, 0, 1 - height), width, height }
}

/** Zone visible actuelle (image entière si pas de recadrage). */
export const currentCrop = (el: Pick<TrameElement, 'crop'>): Crop => el.crop ?? { x: 0, y: 0, width: 1, height: 1 }

/** Marges du recadrage, en % de l'image d'origine : gauche, haut, droite, bas. */
export function cropInsets(el: Pick<TrameElement, 'crop'>): { left: number; top: number; right: number; bottom: number } {
  const c = currentCrop(el)
  return { left: c.x * 100, top: c.y * 100, right: (1 - c.x - c.width) * 100, bottom: (1 - c.y - c.height) * 100 }
}

/**
 * Applique un nouveau recadrage en gardant le contenu visible exactement où il était : l'échelle de l'image ne change pas,
 * la boîte se redimensionne et son coin haut-gauche suit le bord déplacé (en tenant compte de la rotation).
 * Retourne le patch d'élément (x, y, width, height, crop ; `crop` absent si l'image est de nouveau entière).
 */
export function recrop(el: Pick<TrameElement, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'crop'>, next: Crop): Pick<TrameElement, 'x' | 'y' | 'width' | 'height' | 'crop'> {
  const from = currentCrop(el)
  const to = clampCrop(next)
  const sx = el.width / from.width // pixels de design par unité d'image d'origine
  const sy = el.height / from.height
  const dx = (to.x - from.x) * sx
  const dy = (to.y - from.y) * sy
  const r = (el.rotation * Math.PI) / 180
  const whole = to.x === 0 && to.y === 0 && to.width === 1 && to.height === 1
  return {
    x: el.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: el.y + dx * Math.sin(r) + dy * Math.cos(r),
    width: to.width * sx,
    height: to.height * sy,
    crop: whole ? undefined : to
  }
}

/** Nettoyage à la lecture : recadrage, miroirs et réglages invalides sont retirés (jamais devinés). Modifie en place. */
export function sanitizeImageStyle(element: object): void {
  const e = element as Record<string, unknown>
  if (e.crop !== undefined) {
    const c = e.crop as Partial<Crop> | null
    if (!c || !isNum(c.x) || !isNum(c.y) || !isNum(c.width) || !isNum(c.height) || c.width <= 0 || c.height <= 0) delete e.crop
    else {
      const k = clampCrop({ x: c.x, y: c.y, width: c.width, height: c.height })
      if (k.x === 0 && k.y === 0 && k.width === 1 && k.height === 1) delete e.crop
      else e.crop = k
    }
  }
  if (e.flipX !== true) delete e.flipX
  if (e.flipY !== true) delete e.flipY
  if (e.filters !== undefined) {
    const f = e.filters as Record<string, unknown> | null
    const clean: ImageFilters = {}
    if (f && typeof f === 'object') {
      for (const k of Object.keys(FILTER_LIMITS) as FilterKey[]) {
        const v = f[k]
        if (isNum(v) && v !== 0) clean[k] = clamp(v, FILTER_LIMITS[k].min, FILTER_LIMITS[k].max)
      }
    }
    if (Object.keys(clean).length) e.filters = clean
    else delete e.filters
  }
}
