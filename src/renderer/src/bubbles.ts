import { nanoid } from 'nanoid'
import type { TrameElement } from '@/types'

/**
 * Bulles de bande dessinée : parole (queue à gauche ou à droite), pensée (nuage et deux petites bulles), cri (étoile) et récitatif
 * (cartouche). Chaque bulle est un chemin SVG dans un viewBox 100 × 100 (étiré à la taille de l'élément, comme les autres formes), inséré
 * avec un texte centré dans la zone libre de la bulle : deux éléments ordinaires réunis dans un groupe, donc rendus tels quels par
 * l'éditeur et tous les exports. Les tracés sont calculés ici (arcs d'ellipse en courbes de Bézier) plutôt qu'écrits à la main.
 */

export type BubbleId = 'speech-l' | 'speech-r' | 'thought-l' | 'thought-r' | 'shout' | 'caption'

export interface BubbleDef {
  id: BubbleId
  path: string
  /** rapport hauteur / largeur de la bulle insérée */
  aspect: number
  /** zone du texte, en fractions de la bulle */
  text: { x: number; y: number; width: number; height: number }
  /** fond de la bulle */
  fill: string
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const pt = (x: number, y: number): string => `${r2(x)} ${r2(y)}`
const rad = (deg: number): number => (deg * Math.PI) / 180

/** Courbes de Bézier qui suivent l'ellipse (centre, rayons) de l'angle `a0` à l'angle `a1` (degrés, y vers le bas ; sens libre). Part du point courant. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90))
  const step = (a1 - a0) / n
  const k = (4 / 3) * Math.tan(rad(step) / 4)
  let out = ''
  for (let i = 0; i < n; i++) {
    const s = rad(a0 + i * step)
    const e = rad(a0 + (i + 1) * step)
    const p0 = [cx + rx * Math.cos(s), cy + ry * Math.sin(s)]
    const p3 = [cx + rx * Math.cos(e), cy + ry * Math.sin(e)]
    const c1 = [p0[0] - k * rx * Math.sin(s), p0[1] + k * ry * Math.cos(s)]
    const c2 = [p3[0] + k * rx * Math.sin(e), p3[1] - k * ry * Math.cos(e)]
    out += `C${pt(c1[0], c1[1])} ${pt(c2[0], c2[1])} ${pt(p3[0], p3[1])}`
  }
  return out
}

/** Bulle de parole : une ellipse dont une queue pointe vers le bas, du côté demandé. */
function speech(side: 'l' | 'r'): string {
  const [cx, cy, rx, ry] = [50, 40, 43, 33]
  const at = (deg: number): [number, number] => [cx + rx * Math.cos(rad(deg)), cy + ry * Math.sin(rad(deg))]
  const [ax, ay] = at(105)
  const [tx, ty] = [10, 96]
  // l'ellipse est parcourue en sens inverse, de la base de la queue jusqu'à son autre bord, puis la queue se referme sur sa pointe
  const body = `M${pt(ax, ay)}${arc(cx, cy, rx, ry, 105, -220)}L${pt(tx, ty)}L${pt(ax, ay)}Z`
  return side === 'l' ? body : mirror(body)
}

/** Symétrie gauche-droite d'un tracé fait de M, L, C et Z (coordonnées absolues x y). */
function mirror(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${r2(100 - Number(x))} ${y}`)
}

/** Cercle complet en quatre courbes. */
function circle(cx: number, cy: number, r: number): string {
  return `M${pt(cx + r, cy)}${arc(cx, cy, r, r, 0, 360)}Z`
}

/** Bulle de pensée : un nuage aux bords en vagues, suivi de deux petites bulles qui descendent vers le personnage. */
function thought(side: 'l' | 'r'): string {
  const [cx, cy, rx, ry] = [50, 38, 38, 27]
  const bumps = 11
  const on = (deg: number, k = 1): string => pt(cx + k * rx * Math.cos(rad(deg)), cy + k * ry * Math.sin(rad(deg)))
  let cloud = `M${on(-90)}`
  for (let i = 0; i < bumps; i++) {
    const a = -90 + (i * 360) / bumps
    const b = -90 + ((i + 1) * 360) / bumps
    cloud += `Q${on((a + b) / 2, 1.28)} ${on(b)}`
  }
  cloud += 'Z'
  const d = cloud + circle(26, 83, 5.5) + circle(14, 94, 3.5)
  return side === 'l' ? d : mirror(d)
}

/** Bulle de cri : une étoile à pointes irrégulières. */
function shout(): string {
  const spikes = 16
  let d = ''
  for (let i = 0; i < spikes * 2; i++) {
    const a = rad(-90 + (i * 180) / spikes)
    const r = i % 2 ? 31 : i % 4 === 0 ? 49 : 44
    d += `${i ? 'L' : 'M'}${pt(50 + r * Math.cos(a), 50 + r * Math.sin(a))}`
  }
  return d + 'Z'
}

const PAPER = '#ffffff'

export const BUBBLES: BubbleDef[] = [
  { id: 'speech-l', path: speech('l'), aspect: 0.85, text: { x: 0.17, y: 0.14, width: 0.66, height: 0.52 }, fill: PAPER },
  { id: 'speech-r', path: speech('r'), aspect: 0.85, text: { x: 0.17, y: 0.14, width: 0.66, height: 0.52 }, fill: PAPER },
  { id: 'thought-l', path: thought('l'), aspect: 0.85, text: { x: 0.2, y: 0.16, width: 0.6, height: 0.44 }, fill: PAPER },
  { id: 'thought-r', path: thought('r'), aspect: 0.85, text: { x: 0.2, y: 0.16, width: 0.6, height: 0.44 }, fill: PAPER },
  { id: 'shout', path: shout(), aspect: 0.9, text: { x: 0.25, y: 0.3, width: 0.5, height: 0.4 }, fill: '#ffe45e' },
  { id: 'caption', path: 'M3 12H97V88H3Z', aspect: 0.3, text: { x: 0.05, y: 0.18, width: 0.9, height: 0.64 }, fill: '#fff4b8' }
]

export const BUBBLE_IDS: BubbleId[] = BUBBLES.map((b) => b.id)

type Draft = Omit<TrameElement, 'id'>

export const BUBBLE_FONT = '"Caveat", cursive'

/**
 * Éléments d'une bulle dans `box` (sa largeur donne l'échelle ; la hauteur suit le rapport de la bulle) : le chemin (fond clair, contour
 * sombre) puis le texte centré dans sa zone libre. `groupId` les réunit ; `text` est le texte de départ.
 */
export function bubbleDrafts(id: BubbleId, box: { x: number; y: number; width: number }, text: string, groupId: string): Draft[] {
  const def = BUBBLES.find((b) => b.id === id)!
  const width = Math.max(1, box.width)
  const height = Math.round(width * def.aspect)
  const fontSize = Math.max(8, Math.round(width * (id === 'caption' ? 0.1 : 0.11)))
  const tw = def.text.width * width
  const th = def.text.height * height
  const common = { rotation: 0, opacity: 1, groupId }
  return [
    {
      ...common,
      type: 'path',
      path: def.path,
      x: box.x,
      y: box.y,
      width,
      height,
      fill: def.fill,
      stroke: '#1e1f24',
      strokeWidth: Math.max(2, Math.round(width * 0.012))
    },
    {
      ...common,
      type: 'text',
      x: r2(box.x + def.text.x * width),
      // une seule ligne se place au milieu de la zone libre ; un texte plus long s'étend vers le bas
      y: r2(box.y + def.text.y * height + th / 2 - fontSize * 0.6),
      width: r2(tw),
      height: Math.round(fontSize * 1.2),
      text,
      fontSize,
      fill: '#1e1f24',
      fontFamily: BUBBLE_FONT,
      fontStyle: 'bold',
      align: 'center'
    }
  ]
}

/** Même chose avec des identifiants, prête à être insérée dans une page. */
export const bubbleElements = (id: BubbleId, box: { x: number; y: number; width: number }, text: string): TrameElement[] => {
  const groupId = nanoid(8)
  return bubbleDrafts(id, box, text, groupId).map((d) => ({ ...d, id: nanoid(8) }))
}
