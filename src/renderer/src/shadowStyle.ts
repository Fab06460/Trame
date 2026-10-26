import { parseColor } from '@/pdfMath'
import type { Shadow, TrameElement } from '@/types'

export const SHADOW_LIMITS = { blur: { min: 0, max: 200 }, offset: { min: -500, max: 500 }, opacity: { min: 0, max: 1 } }

/** Ombre portée par défaut : noire, douce, décalée vers le bas. */
export const dropShadow = (): Shadow => ({ color: '#000000', blur: 20, offsetX: 0, offsetY: 10, opacity: 0.35 })

/** Lueur par défaut : sans décalage, large et lumineuse, de la couleur donnée (celle de l'élément). */
export const glow = (color: string): Shadow => ({ color, blur: 30, offsetX: 0, offsetY: 0, opacity: 0.9 })

/** Une ombre sans effet visible (invisible ou sans flou ni décalage) n'est pas dessinée. */
export const hasShadow = (el: Pick<TrameElement, 'shadow'>): boolean => {
  const s = el.shadow
  return !!s && s.opacity > 0 && (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0)
}

/** Propriétés Konva de l'ombre (`shadowEnabled: false` quand il n'y en a pas). */
export function shadowProps(el: Pick<TrameElement, 'shadow'>): Record<string, unknown> {
  if (!hasShadow(el)) return { shadowEnabled: false }
  const s = el.shadow as Shadow
  return { shadowEnabled: true, shadowColor: s.color, shadowBlur: s.blur, shadowOffsetX: s.offsetX, shadowOffsetY: s.offsetY, shadowOpacity: s.opacity }
}

/**
 * Marge à prévoir autour de l'élément pour contenir l'ombre : un flou gaussien s'étend sur ~3σ avec σ = flou / 2, soit 1,5 × le flou,
 * plus le décalage. Même calcul pour le rendu de l'ombre dans le PDF et pour la marge des replis en image.
 */
export function shadowMargin(el: Pick<TrameElement, 'shadow'>): number {
  if (!hasShadow(el)) return 0
  const s = el.shadow as Shadow
  return Math.ceil(s.blur * 1.5 + Math.max(Math.abs(s.offsetX), Math.abs(s.offsetY)) + 2)
}

/** Valeur CSS `drop-shadow(...)` équivalente (miniatures) : le rayon de flou CSS a la même convention (σ = rayon / 2). */
export function cssShadow(el: Pick<TrameElement, 'shadow'>): string | undefined {
  if (!hasShadow(el)) return undefined
  const s = el.shadow as Shadow
  const c = parseColor(s.color)
  return `drop-shadow(${s.offsetX}px ${s.offsetY}px ${s.blur}px rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${s.opacity}))`
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null)

/** Nettoyage à la lecture : une ombre incomplète ou invalide est retirée (jamais devinée). Modifie en place. */
export function sanitizeShadow(element: object): void {
  const e = element as Record<string, unknown>
  const s = e.shadow as Partial<Shadow> | undefined
  if (s === undefined) return
  const blur = num(s?.blur, SHADOW_LIMITS.blur.min, SHADOW_LIMITS.blur.max)
  const offsetX = num(s?.offsetX, SHADOW_LIMITS.offset.min, SHADOW_LIMITS.offset.max)
  const offsetY = num(s?.offsetY, SHADOW_LIMITS.offset.min, SHADOW_LIMITS.offset.max)
  const opacity = num(s?.opacity, SHADOW_LIMITS.opacity.min, SHADOW_LIMITS.opacity.max)
  if (!s || typeof s.color !== 'string' || !s.color.trim() || blur === null || offsetX === null || offsetY === null || opacity === null) {
    delete e.shadow
    return
  }
  e.shadow = { color: s.color, blur, offsetX, offsetY, opacity }
}
