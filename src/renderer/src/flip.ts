import type { Gradient, TrameElement } from '@/types'
import { boundsOf, unionBox } from '@/geometry'

/** `h` : miroir gauche ↔ droite (autour d'un axe vertical) ; `v` : haut ↔ bas (autour d'un axe horizontal). */
export type FlipAxis = 'h' | 'v'

const AXES: Record<string, number[]> = { M: [0, 1], L: [0, 1], T: [0, 1], C: [0, 1, 0, 1, 0, 1], S: [0, 1, 0, 1], Q: [0, 1, 0, 1], H: [0], V: [1], Z: [] }

const round = (v: number): number => Number(v.toFixed(4))

/**
 * Miroir d'un chemin SVG dans son viewBox 100×100 : `h` remplace x par 100 − x, `v` remplace y par 100 − y. Les coordonnées relatives
 * (minuscules) changent seulement de signe. Retourne null pour un arc (`A`) ou une commande inconnue, comme `scalePath`.
 */
export function mirrorPath(d: string, axis: FlipAxis): string | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens) return null
  const flipped = axis === 'h' ? 0 : 1
  const out: string[] = []
  let cmd = ''
  let args: number[] = []
  const flush = (): boolean => {
    if (!cmd) return true
    const spec = AXES[cmd.toUpperCase()]
    if (!spec) return false
    if (spec.length === 0) {
      out.push(cmd)
      return true
    }
    if (args.length === 0 || args.length % spec.length !== 0) return false
    const relative = cmd === cmd.toLowerCase()
    // le premier déplacement d'un tracé est toujours absolu, même écrit `m`
    const opening = out.length === 0 && cmd === 'm'
    out.push(cmd + args.map((v, i) => round(spec[i % spec.length] !== flipped ? v : relative && !(opening && i < 2) ? -v : 100 - v)).join(' '))
    return true
  }
  for (const t of tokens) {
    if (/^[a-zA-Z]$/.test(t)) {
      if (!flush()) return null
      cmd = t
      args = []
    } else args.push(Number(t))
  }
  return flush() ? out.join(' ') : null
}

/** Dégradé retourné : l'angle (CSS, 0 = vers le haut) se reflète ; un dégradé radial est symétrique. */
export function mirrorGradient(g: Gradient, axis: FlipAxis): Gradient {
  if (g.type === 'radial') return g
  const a = axis === 'h' ? -g.angle : 180 - g.angle
  return { ...g, angle: ((a % 360) + 360) % 360 }
}

/** Graphiques et QR codes (groupes dont un élément porte la description) : leur miroir casserait la lecture, ils restent tels quels. */
export function isFlipExempt(e: TrameElement, all: TrameElement[]): boolean {
  if (e.chart || e.qr) return true
  return !!e.groupId && all.some((o) => o.groupId === e.groupId && (o.chart || o.qr))
}

const r6 = (v: number): number => Number(v.toFixed(6)) || 0

/** Contenu retourné dans le repère de l'élément (`h` : x local ; `v` : y local). Vide si le contenu est symétrique ou ne peut pas l'être. */
function contentPatch(e: TrameElement, axis: FlipAxis): Partial<TrameElement> | null {
  const patch: Partial<TrameElement> = {}
  if (e.type === 'text') return null
  if (e.type === 'image') {
    const key = axis === 'h' ? 'flipX' : 'flipY'
    patch[key] = e[key] ? undefined : true
  }
  if (e.type === 'path') {
    const d = e.path ? mirrorPath(e.path, axis) : null
    if (!d) return null
    patch.path = d
  }
  if (e.gradient && e.type !== 'image') patch.gradient = mirrorGradient(e.gradient, axis)
  return patch
}

/**
 * Retourne des éléments en bloc, comme un miroir posé au milieu de leur boîte commune (un seul élément : son propre milieu, donc il
 * reste en place). Les positions suivent le miroir ; la rotation devient −θ ; le contenu (tracé, pixels d'une image, sens du dégradé)
 * est retourné dans le repère de l'élément. Un texte (ou un tracé qu'on ne sait pas retourner) n'est pas lui-même retourné : il
 * change seulement de place, pour rester lisible. Retourne les champs à modifier, par id.
 */
export function flipPatches(els: TrameElement[], axis: FlipAxis): Map<string, Partial<TrameElement>> {
  const out = new Map<string, Partial<TrameElement>>()
  if (!els.length) return out
  const box = unionBox(els.map(boundsOf))
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  for (const e of els) {
    const r = (e.rotation * Math.PI) / 180
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    const content = contentPatch(e, axis)
    if (content) {
      // origine = image du coin d'origine par le miroir, décalée d'une largeur (ou hauteur) dans l'axe retourné
      const x = axis === 'h' ? 2 * cx - e.x - e.width * cos : e.x - e.height * sin
      const y = axis === 'h' ? e.y + e.width * sin : 2 * cy - e.y - e.height * cos
      out.set(e.id, { ...content, x: r6(x), y: r6(y), rotation: r6(-e.rotation) })
    } else {
      // centre de l'élément (repère tourné), reflété ; l'orientation ne change pas
      const hx = (e.width / 2) * cos - (e.height / 2) * sin
      const hy = (e.width / 2) * sin + (e.height / 2) * cos
      const mx = axis === 'h' ? 2 * cx - (e.x + hx) : e.x + hx
      const my = axis === 'v' ? 2 * cy - (e.y + hy) : e.y + hy
      out.set(e.id, { x: r6(mx - hx), y: r6(my - hy) })
    }
  }
  return out
}
