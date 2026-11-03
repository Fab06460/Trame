import { parseHex, toHex, type Rgb } from '@/accessibility'

/** Couleur dans l'espace CIE L*a*b* (D65) : une distance y ressemble à ce que l'œil perçoit, ce que le RVB ne fait pas. */
export type Lab = [number, number, number]

const lin = (v: number): number => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const gamma = (v: number): number => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
const finv = (t: number): number => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))

export function rgbToLab([r, g, b]: Rgb): Lab {
  const R = lin(r), G = lin(g), B = lin(b)
  const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047)
  const y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B)
  const z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

export function labToRgb([l, a, b]: Lab): Rgb {
  const y = finv((l + 16) / 116)
  const x = finv((l + 16) / 116 + a / 500) * 0.95047
  const z = finv((l + 16) / 116 - b / 200) * 1.08883
  const clamp = (v: number): number => Math.min(255, Math.max(0, gamma(Math.min(1, Math.max(0, v)))))
  return [
    clamp(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    clamp(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    clamp(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
  ]
}

export const labOf = (hex: string): Lab | null => {
  const c = parseHex(hex)
  return c ? rgbToLab(c) : null
}

/** Carré de la distance entre deux couleurs L*a*b*. */
export const dist2 = (a: Lab, b: Lab): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** Chroma (intensité de la couleur) : proche de 0 pour un blanc, un noir ou un gris. */
export const chromaOf = (lab: Lab): number => Math.hypot(lab[1], lab[2])

export interface Swatch {
  /** `#rrggbb` */
  color: string
  /** part des pixels de l'image représentés par cette couleur (0 à 1) */
  share: number
}

/** Deux couleurs plus proches que cela (ΔE) sont fondues en une seule. */
const MERGE_DELTA = 7
/** Une couleur qui représente moins de cette part des pixels est du bruit (un reflet, un bord) : on l'ignore. */
const MIN_SHARE = 0.004

/**
 * Couleurs dominantes d'une image (octets RVBA, comme `ImageData.data`) : les pixels sont comptés par petites familles de teintes,
 * puis regroupés en `k` couleurs au plus (k-moyennes dans l'espace L*a*b*, départ déterministe : même image, même palette).
 * Les pixels transparents ne comptent pas. Les couleurs viennent par ordre décroissant de part ; il peut y en avoir moins que `k`
 * (image à peu de couleurs).
 */
export function extractPalette(rgba: ArrayLike<number>, k = 5): Swatch[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bin = bins.get(key)
    if (bin) {
      bin.n++
      bin.r += r
      bin.g += g
      bin.b += b
    } else bins.set(key, { n: 1, r, g, b })
    total++
  }
  if (total === 0 || k < 1) return []
  const pts = [...bins.values()].map((x) => ({ n: x.n, lab: rgbToLab([x.r / x.n, x.g / x.n, x.b / x.n]) }))

  // départ : la famille la plus peuplée, puis à chaque fois celle qui est à la fois peuplée et éloignée des choisies
  const centers: Lab[] = [pts.reduce((a, b) => (b.n > a.n ? b : a)).lab]
  const nearest = pts.map((p) => dist2(p.lab, centers[0]))
  while (centers.length < Math.min(k, pts.length)) {
    let best = -1, bestScore = 0
    pts.forEach((p, i) => {
      const score = Math.sqrt(p.n) * Math.sqrt(nearest[i])
      if (score > bestScore) (best = i), (bestScore = score)
    })
    if (best < 0) break
    centers.push(pts[best].lab)
    pts.forEach((p, i) => (nearest[i] = Math.min(nearest[i], dist2(p.lab, pts[best].lab))))
  }

  const assign = new Array<number>(pts.length).fill(0)
  for (let iter = 0; iter < 12; iter++) {
    pts.forEach((p, i) => {
      let bi = 0, bd = Infinity
      centers.forEach((c, ci) => {
        const d = dist2(p.lab, c)
        if (d < bd) (bd = d), (bi = ci)
      })
      assign[i] = bi
    })
    const sums = centers.map(() => ({ n: 0, l: 0, a: 0, b: 0 }))
    pts.forEach((p, i) => {
      const s = sums[assign[i]]
      s.n += p.n
      s.l += p.lab[0] * p.n
      s.a += p.lab[1] * p.n
      s.b += p.lab[2] * p.n
    })
    sums.forEach((s, ci) => {
      if (s.n > 0) centers[ci] = [s.l / s.n, s.a / s.n, s.b / s.n]
    })
  }
  const weight = centers.map(() => 0)
  pts.forEach((p, i) => (weight[assign[i]] += p.n))

  const out: Array<{ lab: Lab; n: number }> = []
  centers
    .map((lab, i) => ({ lab, n: weight[i] }))
    .filter((c) => c.n / total >= MIN_SHARE)
    .sort((a, b) => b.n - a.n)
    .forEach((c) => {
      const twin = out.find((o) => Math.sqrt(dist2(o.lab, c.lab)) < MERGE_DELTA)
      if (twin) twin.n += c.n
      else out.push({ ...c })
    })
  return out.sort((a, b) => b.n - a.n).map((c) => ({ color: toHex(labToRgb(c.lab)), share: c.n / total }))
}
