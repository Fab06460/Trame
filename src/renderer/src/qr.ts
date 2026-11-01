import { nanoid } from 'nanoid'
import qrcode from 'qrcode-generator'
import { contrastRatio, parseHex } from '@/accessibility'
import type { QrSpec, TrameElement } from '@/types'

export type { QrSpec }
export type QrLevel = QrSpec['ecc']

export const QR_LEVELS: QrLevel[] = ['L', 'M', 'Q', 'H']
/** Longueur du texte (en caractères) : au-delà, même le niveau le plus faible ne suffit plus pour la plupart des textes. */
export const MAX_QR_TEXT = 1000
/** Marge claire autour des modules, en modules (le minimum de la norme). */
export const QR_QUIET = 4
/** En dessous, un lecteur hésite : le panneau prévient. */
export const MIN_QR_CONTRAST = 4

export const DEFAULT_QR: Omit<QrSpec, 'text'> = { ecc: 'M', dark: '#000000', light: '#ffffff' }

/** Grille des modules du texte (`true` = module sombre), ou null si le texte est vide ou ne tient pas dans un QR code de ce niveau. */
export function qrMatrix(text: string, ecc: QrLevel): boolean[][] | null {
  if (!text) return null
  try {
    const qr = qrcode(0, ecc)
    // la bibliothèque prend un caractère pour un octet : on lui donne les octets UTF-8 du texte (accents, symboles, emoji)
    qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte')
    qr.make()
    const n = qr.getModuleCount()
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
  } catch {
    return null
  }
}

/**
 * Chemin SVG (viewBox 100 × 100) des modules sombres : une suite horizontale de modules = un rectangle. Que des commandes absolues M, L, Z
 * (comprises par tous les exports). Les coordonnées viennent toutes de la même formule : deux rectangles voisins partagent exactement leur
 * bord, sans trait clair entre eux.
 */
export function qrPath(matrix: boolean[][]): string {
  const n = matrix.length
  const at = (i: number): string => String(Number(((i * 100) / n).toFixed(3)))
  const parts: string[] = []
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!matrix[r][c]) {
        c++
        continue
      }
      let end = c
      while (end < n && matrix[r][end]) end++
      parts.push(`M${at(c)} ${at(r)}L${at(end)} ${at(r)}L${at(end)} ${at(r + 1)}L${at(c)} ${at(r + 1)}Z`)
      c = end
    }
  }
  return parts.join('')
}

/** Faible contraste entre modules et fond, ou modules plus clairs que le fond (certains lecteurs ne lisent pas les QR codes inversés). */
export function qrContrastLow(spec: Pick<QrSpec, 'dark' | 'light'>): boolean {
  const dark = parseHex(spec.dark)
  const light = parseHex(spec.light)
  if (!dark || !light) return false
  const lum = (c: number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  return contrastRatio(dark, light) < MIN_QR_CONTRAST || lum(dark) > lum(light)
}

export interface QrResult {
  /** premier élément = fond (porte la description), deuxième = modules ; tous deux partagent `groupId` */
  elements: TrameElement[]
  /** nombre de modules par côté (sans la marge) */
  modules: number
}

/** Réglages de l'élément d'origine qui se gardent quand on redessine le QR code (opacité, verrou, masquage, protection d'un modèle). */
export const QR_KEPT = ['opacity', 'locked', 'hidden', 'protect'] as const
export const qrKept = (e: TrameElement): Partial<TrameElement> => Object.fromEntries(QR_KEPT.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))

/**
 * Éléments qui dessinent un QR code dans un carré de côté `min(largeur, hauteur)` au coin de `box` : un rectangle de fond (avec la marge)
 * et un chemin pour les modules, donc rendus tels quels par l'éditeur et tous les exports, en vectoriel. `rotation` (degrés, autour du coin
 * haut-gauche comme partout dans Trame) pivote l'ensemble ; `keep` s'applique aux deux éléments. Retourne null si le contenu est vide ou
 * trop long (l'appelant garde alors le QR code qu'il avait).
 */
export function qrElements(
  spec: QrSpec,
  box: { x: number; y: number; width: number; height: number },
  options: { groupId?: string; rotation?: number; keep?: Partial<TrameElement> } = {}
): QrResult | null {
  const matrix = qrMatrix(spec.text, spec.ecc)
  if (!matrix) return null
  const groupId = options.groupId ?? nanoid(8)
  const rotation = options.rotation ?? 0
  const n = matrix.length
  const side = Math.max(1, Math.min(box.width, box.height))
  const margin = (side * QR_QUIET) / (n + 2 * QR_QUIET)
  // les modules sont décalés de la marge dans le repère du fond : après rotation, ce décalage tourne avec lui
  const r = (rotation * Math.PI) / 180
  const at = { x: box.x + margin * (Math.cos(r) - Math.sin(r)), y: box.y + margin * (Math.sin(r) + Math.cos(r)) }
  const base = { rotation, opacity: 1, groupId, ...options.keep }
  const anchor: TrameElement = { ...base, id: nanoid(8), type: 'rect', x: box.x, y: box.y, width: side, height: side, fill: spec.light, name: 'qr', qr: spec }
  const modules: TrameElement = { ...base, id: nanoid(8), type: 'path', x: at.x, y: at.y, width: side - 2 * margin, height: side - 2 * margin, fill: spec.dark, path: qrPath(matrix) }
  return { elements: [anchor, modules], modules: n }
}

/** Nettoyage à la lecture d'un fichier : un contenu illisible ou des couleurs invalides font perdre la description (les éléments restent). Modifie en place. */
export function sanitizeQr(e: { qr?: unknown }): void {
  const raw = e.qr as Partial<QrSpec> | undefined
  if (raw === undefined) return
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || !raw.text || raw.text.length > MAX_QR_TEXT) {
    delete e.qr
    return
  }
  const color = (v: unknown, fallback: string): string => (typeof v === 'string' && parseHex(v) ? v : fallback)
  e.qr = {
    text: raw.text,
    ecc: QR_LEVELS.includes(raw.ecc as QrLevel) ? (raw.ecc as QrLevel) : DEFAULT_QR.ecc,
    dark: color(raw.dark, DEFAULT_QR.dark),
    light: color(raw.light, DEFAULT_QR.light)
  }
}
