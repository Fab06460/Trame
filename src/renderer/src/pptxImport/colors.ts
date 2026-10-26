import { attr, kids, nameOfEl, num } from '@/pptxImport/xml'

export interface Theme {
  /** couleurs du jeu (dk1, lt1, accent1…), `rrggbb` */
  colors: Record<string, string>
  /** typographies du thème (« +mj-lt » titres, « +mn-lt » texte) */
  major: string
  minor: string
}

/** Correspondance des rôles (bg1, tx1…) vers les couleurs du jeu : celle du masque, sinon la correspondance standard. */
export type ColorMap = Record<string, string>
export const DEFAULT_COLOR_MAP: ColorMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }

export interface Rgba {
  hex: string // #rrggbb
  /** 0 (transparent) à 1 */
  alpha: number
}

const PRESET: Record<string, string> = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', orange: 'ffa500' }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number): number => {
    const x = (t + 1) % 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}

const toHex = (c: [number, number, number]): string => `#${c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`

/**
 * Couleur d'un élément de couleur OOXML (`a:srgbClr`, `a:schemeClr`, `a:sysClr`, `a:prstClr`) avec ses modificateurs
 * (`lumMod`, `lumOff`, `tint`, `shade`, `satMod`, `alpha`). Retourne null si la couleur est inconnue.
 */
export function resolveColor(el: Element | null | undefined, theme: Theme, map: ColorMap = DEFAULT_COLOR_MAP): Rgba | null {
  if (!el) return null
  const kind = nameOfEl(el)
  let base: string | undefined
  if (kind === 'srgbClr') base = attr(el, 'val') ?? undefined
  else if (kind === 'sysClr') base = attr(el, 'lastClr') ?? (attr(el, 'val') === 'window' ? 'ffffff' : '000000')
  else if (kind === 'prstClr') base = PRESET[(attr(el, 'val') ?? '').toLowerCase()]
  else if (kind === 'schemeClr') {
    const role = attr(el, 'val') ?? ''
    base = theme.colors[map[role] ?? role] ?? (role === 'phClr' ? undefined : undefined)
  }
  if (!base || !/^[0-9a-f]{6}$/i.test(base)) return null
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(base!.slice(i, i + 2), 16) / 255) as [number, number, number]
  let alpha = 1
  for (const m of kids(el)) {
    const v = (num(m, 'val') ?? 100000) / 100000
    switch (nameOfEl(m)) {
      case 'lumMod': case 'lumOff': case 'satMod': {
        let [h, s, l] = rgbToHsl(r, g, b)
        if (nameOfEl(m) === 'lumMod') l = clamp01(l * v)
        else if (nameOfEl(m) === 'lumOff') l = clamp01(l + v)
        else s = clamp01(s * v)
        ;[r, g, b] = hslToRgb(h, s, l)
        break
      }
      case 'tint': [r, g, b] = [r, g, b].map((c) => c * v + (1 - v)) as [number, number, number]; break
      case 'shade': [r, g, b] = [r, g, b].map((c) => c * v) as [number, number, number]; break
      case 'alpha': alpha = clamp01(v); break
    }
  }
  return { hex: toHex([r, g, b]), alpha }
}

/** Lit le jeu de couleurs et les typographies d'un fichier de thème (`ppt/theme/theme1.xml`). */
export function parseTheme(doc: Document): Theme {
  const theme: Theme = { colors: {}, major: 'Calibri', minor: 'Calibri' }
  const all = (name: string): Element[] => Array.from(doc.getElementsByTagName('*')).filter((e) => nameOfEl(e as Element) === name) as Element[]
  const scheme = all('clrScheme')[0]
  for (const c of kids(scheme)) {
    const inner = kids(c)[0]
    const v = inner ? (attr(inner, 'val') && nameOfEl(inner) === 'srgbClr' ? attr(inner, 'val') : attr(inner, 'lastClr')) : null
    if (v) theme.colors[nameOfEl(c)] = v
  }
  const font = (parent: string): string | null => attr(kids(all(parent)[0], 'latin')[0], 'typeface')
  theme.major = font('majorFont') ?? theme.major
  theme.minor = font('minorFont') ?? theme.minor
  return theme
}
