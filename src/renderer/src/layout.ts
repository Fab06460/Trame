/** Disposition de l'interface : tailles des zones et mode compact. Fonctions pures (le store `store/layout.ts` les applique). */

export type Side = 'left' | 'right'

export const LIMITS = {
  /** colonne d'onglets (62 px) comprise */
  left: { min: 280, max: 540, def: 340 },
  right: { min: 200, max: 440, def: 240 },
  /** hauteur de la bande des pages, notes non comprises */
  strip: { min: 84, max: 320, def: 150 }
} as const

/** Largeur minimale de la zone de travail : en dessous, les panneaux ouverts passent en recouvrement. */
export const MIN_CENTER = 420

/** Au-delà de cette part de la hauteur de la fenêtre, la bande des pages cède la place au canevas. */
export const STRIP_MAX_SHARE = 0.3

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function clampSize(kind: keyof typeof LIMITS, value: unknown): number {
  const { min, max, def } = LIMITS[kind]
  return Math.round(Math.min(max, Math.max(min, num(value, def))))
}

export interface DockPrefs {
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
}

/** Les panneaux ouverts laisseraient-ils moins de MIN_CENTER px à la zone de travail ? */
export function isCompact(windowWidth: number, p: DockPrefs): boolean {
  const docked = (p.leftOpen ? p.leftWidth : 0) + (p.rightOpen ? p.rightWidth : 0)
  return docked > 0 && windowWidth - docked < MIN_CENTER
}

/** Largeur maximale d'un panneau en recouvrement : jamais toute la fenêtre. */
export const overlayWidth = (width: number, windowWidth: number): number => Math.max(160, Math.min(width, Math.round(windowWidth * 0.85)))

/** Hauteur effective de la bande des pages : celle choisie, bornée par la place disponible. */
export function stripHeight(chosen: number, windowHeight: number): number {
  const cap = Math.max(LIMITS.strip.min, Math.round(windowHeight * STRIP_MAX_SHARE))
  return Math.min(chosen, cap)
}

/** Taille maximale des miniatures pour une bande de cette hauteur (marges et légende déduites). */
export function thumbBox(strip: number): { maxW: number; maxH: number } {
  const maxH = Math.max(36, Math.min(240, strip - 62))
  return { maxW: Math.round(maxH * 1.6), maxH }
}

/** Nouvelle taille d'un panneau pendant un glissement de la poignée (`delta` en pixels écran, positif vers la droite / le bas). */
export function dragSize(kind: Side | 'strip', start: number, delta: number): number {
  // la poignée du panneau de droite et celle de la bande (qui grandit vers le haut) agissent à l'envers
  return clampSize(kind, kind === 'left' ? start + delta : start - delta)
}

/** Préférences lues dans le stockage local : tout ce qui n'est pas valide retombe sur la valeur par défaut. */
export function sanitizeLayout(raw: unknown): { leftOpen: boolean; rightOpen: boolean; stripOpen: boolean; leftWidth: number; rightWidth: number; stripHeight: number } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bool = (v: unknown): boolean => v !== false
  return {
    leftOpen: bool(o.leftOpen),
    rightOpen: bool(o.rightOpen),
    stripOpen: bool(o.stripOpen),
    leftWidth: clampSize('left', o.leftWidth),
    rightWidth: clampSize('right', o.rightWidth),
    stripHeight: clampSize('strip', o.stripHeight)
  }
}
