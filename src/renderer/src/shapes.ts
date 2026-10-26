import type Konva from 'konva'
import { linearGradientLine, radialGradientCircle } from '@/gradient'
import type { Gradient } from '@/types'

export interface ShapeDef {
  id: string
  name: string
  /** Chemin SVG dans un viewBox 100×100, étiré à la taille de l'élément. */
  path: string
}

export const SHAPES: ShapeDef[] = [
  { id: 'triangle', name: 'Triangle', path: 'M50 5 L95 90 L5 90 Z' },
  { id: 'diamond', name: 'Losange', path: 'M50 3 L97 50 L50 97 L3 50 Z' },
  { id: 'pentagon', name: 'Pentagone', path: 'M50 4 L96 38 L78 94 L22 94 L4 38 Z' },
  { id: 'hexagon', name: 'Hexagone', path: 'M25 6 L75 6 L98 50 L75 94 L25 94 L2 50 Z' },
  {
    id: 'star',
    name: 'Étoile',
    path: 'M50 4 L61.8 36.5 L96.4 37.7 L69 58.8 L78.6 92 L50 72.6 L21.4 92 L31 58.8 L3.6 37.7 L38.2 36.5 Z'
  },
  {
    id: 'heart',
    name: 'Cœur',
    path: 'M50 90 C20 65 4 48 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 48 80 65 50 90 Z'
  },
  { id: 'arrow', name: 'Flèche', path: 'M5 38 L58 38 L58 15 L97 50 L58 85 L58 62 L5 62 Z' },
  { id: 'plus', name: 'Plus', path: 'M38 5 H62 V38 H95 V62 H62 V95 H38 V62 H5 V38 H38 Z' },
  { id: 'cross', name: 'Croix', path: 'M20 8 L50 38 L80 8 L92 20 L62 50 L92 80 L80 92 L50 62 L20 92 L8 80 L38 50 L8 20 Z' },
  { id: 'check', name: 'Coche', path: 'M10 52 L22 40 L40 58 L78 18 L90 30 L40 82 Z' },
  { id: 'bolt', name: 'Éclair', path: 'M58 3 L18 56 H44 L38 97 L82 40 H55 Z' },
  {
    id: 'bubble',
    name: 'Bulle',
    path: 'M10 10 H90 Q96 10 96 16 V60 Q96 66 90 66 H42 L22 90 V66 H10 Q4 66 4 60 V16 Q4 10 10 10 Z'
  }
]

const cache = new Map<string, Path2D>()

/**
 * Chemin de la forme **déjà étiré** à la taille de l'élément. On étire les coordonnées (matrice appliquée au tracé) plutôt que le
 * contexte de dessin : un contexte étiré déformerait l'épaisseur du contour (plus épais d'un côté que de l'autre).
 */
function stretched(d: string, w: number, h: number): Path2D {
  const key = `${d}|${w}|${h}`
  let p = cache.get(key)
  if (!p) {
    if (cache.size > 200) cache.clear() // pendant un redimensionnement, chaque image produit une taille nouvelle
    p = new Path2D()
    p.addPath(new Path2D(d), new DOMMatrix([w / 100, 0, 0, h / 100, 0, 0]))
    cache.set(key, p)
  }
  return p
}

/** Remplissage natif : le dégradé de la forme s'il y en a un, sinon sa couleur unie. */
function nativeFill(c: CanvasRenderingContext2D, g: Gradient | undefined, w: number, h: number, fallback: string): string | CanvasGradient {
  if (!g) return fallback
  let grad: CanvasGradient
  if (g.type === 'radial') {
    const r = radialGradientCircle(w, h)
    grad = c.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, r.r)
  } else {
    const l = linearGradientLine(w, h, g.angle)
    grad = c.createLinearGradient(l.x0, l.y0, l.x1, l.y1)
  }
  grad.addColorStop(0, g.from)
  grad.addColorStop(1, g.to)
  return grad
}

/**
 * Dessin d'une forme vectorielle dans la boîte width×height du nœud Konva (fond puis contour éventuel).
 * Partagé entre l'éditeur et l'export hors écran.
 */
export function pathSceneFunc(d: string) {
  return (ctx: Konva.Context, shape: Konva.Shape): void => {
    const p = stretched(d, shape.width(), shape.height())
    const c = ctx._context
    c.save()
    c.fillStyle = nativeFill(c, shape.getAttr('trameGradient') as Gradient | undefined, shape.width(), shape.height(), shape.fill() as string)
    c.fill(p)
    if (shape.strokeEnabled() && shape.strokeWidth() > 0) {
      c.lineWidth = shape.strokeWidth()
      c.strokeStyle = shape.stroke() as string
      c.setLineDash((shape.dash() as number[] | undefined) ?? [])
      c.stroke(p)
    }
    c.restore()
  }
}

/** Zone de clic = la boîte (le dessin natif ne passe pas par le canvas de détection de Konva). */
export const boxHitFunc = (ctx: Konva.Context, shape: Konva.Shape): void => {
  ctx.beginPath()
  ctx.rect(0, 0, shape.width(), shape.height())
  ctx.closePath()
  ctx.fillStrokeShape(shape)
}
