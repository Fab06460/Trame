import { nanoid } from 'nanoid'
import type { TrameElement } from '@/types'

/**
 * Nuage de mots : compte les mots d'un texte (ou lit une liste, éventuellement pondérée), puis les place en spirale, les plus gros d'abord,
 * sans qu'ils se recouvrent. Le résultat est un groupe de textes ordinaires (modifiables, déplaçables), rendus tels quels par tous les
 * exports. Ce module ne touche ni au DOM ni au document : la largeur d'un mot est donnée par l'appelant (`measure`), ce qui le rend testable.
 */

export interface CloudWord {
  text: string
  weight: number
}

export type CloudInputMode = 'text' | 'list' | 'weighted'

export const MAX_CLOUD_INPUT = 100_000
export const MAX_CLOUD_WORDS = 100
export const DEFAULT_CLOUD_WORDS = 40

/** Mots courants ignorés quand on compte un texte (français, anglais, allemand, espagnol : on ne sait pas la langue du texte, et ces mots se recoupent peu). */
const STOP = `
le la les un une des du de d l et ou mais donc or ni car à au aux en dans sur sous par pour avec sans ce cet cette ces se sa son ses leur leurs je tu il elle on nous vous ils elles me te lui y que qui quoi dont où ne pas plus est sont être était étaient ont avoir a ai as avons avez été fait comme très aussi si mon ma mes ton ta tes notre nos votre vos c qu j m n s t
the a an and or but of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had will would can could so if then than there here what which who
der die das den dem des ein eine einen einem einer eines und oder aber von zu zum zur im in am an auf aus bei mit nach über unter für durch ohne ich du er sie es wir ihr ist sind war waren sein hat haben wird werden kann nicht kein keine auch als wie wenn dass dies diese dieser
el la los las un una unos unas y o pero de del al en con sin por para sobre entre que quien se su sus mi mis tu tus nuestro vuestro yo tú él ella nosotros ellos ellas es son era eran ser estar fue ha han he hemos no sí muy más como también
`
  .split(/\s+/)
  .filter(Boolean)
const STOPWORDS = new Set(STOP)

/** Un mot : lettres et chiffres, avec trait d'union au milieu (l'apostrophe sépare : « l'école » donne « l » et « école »). */
const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu

const lower = (s: string): string => s.toLocaleLowerCase()

/** Surface la plus fréquente de chaque mot (« Paris » plutôt que « paris » si on l'écrit le plus souvent ainsi ; ex æquo : la première vue). */
class Counter {
  private map = new Map<string, { weight: number; forms: Map<string, number>; order: number }>()
  add(text: string, weight = 1): void {
    const key = lower(text)
    let e = this.map.get(key)
    if (!e) this.map.set(key, (e = { weight: 0, forms: new Map(), order: this.map.size }))
    e.weight += weight
    e.forms.set(text, (e.forms.get(text) ?? 0) + 1)
  }
  words(): CloudWord[] {
    return [...this.map.values()]
      .sort((a, b) => b.weight - a.weight || a.order - b.order)
      .map((e) => ({ text: [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], weight: e.weight }))
  }
}

const WEIGHTED = /^(.+?)\s*[;:=\t]\s*(\d+(?:[.,]\d+)?)\s*$/
const BULLET = /^\s*(?:[-•*·–]|\d+[.)])\s+/

/**
 * Mots et poids d'un contenu saisi. Trois façons de le lire, reconnues toutes seules :
 * - **liste pondérée** : des lignes « mot ; 5 » (séparateurs ; : = ou tabulation) : le poids est donné ;
 * - **liste** : au moins 4 lignes courtes (4 mots au plus) : chaque ligne est un terme, compté autant de fois qu'il revient, sans mots courants ignorés ;
 * - **texte** : tous les mots, sauf les mots courants, les nombres seuls et les mots d'une lettre.
 * `exclude` : mots à retirer en plus. Retourne les `max` mots les plus lourds et le nombre de mots distincts avant cette coupe.
 */
export function parseCloudInput(raw: string, options: { exclude?: string[]; max?: number } = {}): { mode: CloudInputMode; words: CloudWord[]; distinct: number } {
  const max = Math.min(MAX_CLOUD_WORDS, Math.max(1, Math.round(options.max ?? DEFAULT_CLOUD_WORDS)))
  const excluded = new Set((options.exclude ?? []).map((w) => lower(w.trim())).filter(Boolean))
  const text = raw.slice(0, MAX_CLOUD_INPUT).normalize('NFC')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const counter = new Counter()
  let mode: CloudInputMode = 'text'

  const weighted = lines.map((l) => WEIGHTED.exec(l))
  if (lines.length >= 2 && weighted.filter(Boolean).length >= Math.ceil(lines.length * 0.8)) {
    mode = 'weighted'
    for (const m of weighted) if (m) counter.add(m[1].trim(), Number(m[2].replace(',', '.')) || 0)
  } else if (lines.length >= 4 && lines.every((l) => l.split(/\s+/).length <= 4)) {
    mode = 'list'
    for (const l of lines) counter.add(l.replace(BULLET, '').trim() || l)
  } else {
    for (const m of text.matchAll(WORD)) {
      const w = m[0]
      if (w.length < 2 || /^\d+$/.test(w) || STOPWORDS.has(lower(w))) continue
      counter.add(w)
    }
  }
  const all = counter.words().filter((w) => w.weight > 0 && !excluded.has(lower(w.text)))
  return { mode, words: all.slice(0, max), distinct: all.length }
}

// --- Placement ---------------------------------------------------------------------------------------------------------------------

export interface PlacedWord {
  text: string
  /** taille de police */
  size: number
  /** rectangle occupé par l'encre du mot (après rotation) */
  x: number
  y: number
  width: number
  height: number
  /** lu de haut en bas (quart de tour) */
  vertical: boolean
  weight: number
  /** rang du mot par poids décroissant (0 = le plus lourd), pour choisir sa couleur */
  rank: number
}

export interface CloudLayoutOptions {
  /** graine : une autre graine donne une autre disposition (la même graine, la même) */
  seed?: number
  /** une partie des mots (jamais le plus gros) est lue de haut en bas */
  vertical?: boolean
}

/** Hauteur de la boîte d'un texte, en fois la taille de police, et décalage de l'encre dans cette boîte. */
const BOX = 1.2
const INK_TOP = 0.1

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, pad: number): boolean =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad

/**
 * Place les mots dans une boîte `width` × `height` : le plus lourd au centre, les autres le long d'une spirale (un peu étirée comme la
 * boîte), au premier endroit libre. Si tout ne tient pas, toutes les tailles diminuent d'un cran et on recommence ; un mot qui ne tient
 * toujours pas est abandonné. `measure(texte, taille)` donne la largeur du mot.
 */
export function layoutCloud(words: CloudWord[], box: { width: number; height: number }, measure: (text: string, size: number) => number, options: CloudLayoutOptions = {}): PlacedWord[] {
  if (!words.length) return []
  const sorted = words.slice().sort((a, b) => b.weight - a.weight)
  const margin = Math.min(box.width, box.height) * 0.03
  const minSize = box.height * 0.03
  const maxSize = Math.min(box.height * 0.26, box.width * 0.2)
  const wMax = sorted[0].weight
  const wMin = sorted[sorted.length - 1].weight
  const rand = rng(options.seed ?? 1)
  // le sens de lecture est décidé une fois pour toutes (il ne change pas quand les tailles diminuent)
  const vertical = sorted.map((_, i) => !!options.vertical && i > 0 && rand() < 0.28)
  const pad = Math.max(2, minSize * 0.3)
  const cx = box.width / 2
  const cy = box.height / 2
  const stretch = Math.min(2, Math.max(0.5, box.width / box.height))

  const attempt = (scale: number): { placed: PlacedWord[]; dropped: number } => {
    const placed: PlacedWord[] = []
    let dropped = 0
    for (const [i, w] of sorted.entries()) {
      const norm = wMax === wMin ? 0.5 : (w.weight - wMin) / (wMax - wMin)
      const size = Math.min(maxSize, Math.max(minSize * 0.5, (minSize + (maxSize - minSize) * Math.pow(norm, 0.8)) * scale))
      const ink = measure(w.text, size)
      const rw = vertical[i] ? size : ink
      const rh = vertical[i] ? ink : size
      // pas de la spirale : proportionnel à la taille, pour qu'un grand mot n'ait pas besoin de milliers de tours
      const b = Math.max(0.8, size * 0.08)
      const limit = Math.hypot(box.width, box.height) / 2 / b
      let found: PlacedWord | null = null
      for (let theta = 0; theta < limit && !found; theta += 0.22) {
        const r = b * theta
        const x = cx + r * Math.cos(theta) * stretch - rw / 2
        const y = cy + r * Math.sin(theta) - rh / 2
        const rect = { x, y, width: rw, height: rh }
        if (x < margin || y < margin || x + rw > box.width - margin || y + rh > box.height - margin) continue
        if (placed.some((p) => overlaps(rect, p, pad))) continue
        found = { text: w.text, size, ...rect, vertical: vertical[i], weight: w.weight, rank: i }
      }
      if (found) placed.push(found)
      else dropped++
    }
    return { placed, dropped }
  }

  // on commence grand (les mots sont plafonnés à `maxSize`) et on réduit jusqu'à ce que tout tienne
  let best = attempt(1.6)
  for (let scale = 1.6 * 0.93; best.dropped > 0 && scale > 0.3; scale *= 0.93) {
    const next = attempt(scale)
    if (next.dropped < best.dropped || next.dropped === 0) best = next
    if (next.dropped === 0) break
  }
  return best.placed
}

/** Couleurs d'une palette assez contrastées avec le fond (rapport 3 : texte très grand), sinon noir ou blanc selon le fond. */
export function readableColors(palette: string[], background: string, contrast: (a: string, b: string) => number | null): string[] {
  const ok = palette.filter((c) => (contrast(c, background) ?? 0) >= 3)
  if (ok.length) return ok
  return (contrast('#1e1f24', background) ?? 0) >= (contrast('#ffffff', background) ?? 0) ? ['#1e1f24'] : ['#ffffff']
}

/**
 * Textes du nuage dans la boîte `at` (la disposition, calculée dans un espace de largeur quelconque, est mise à l'échelle `scale`). Chaque
 * mot est un texte gras ; un mot vertical est tourné d'un quart de tour autour de son coin haut-gauche, comme partout dans Trame.
 */
export function cloudElements(placed: PlacedWord[], at: { x: number; y: number; scale: number }, family: string, colors: string[], groupId: string = nanoid(8)): TrameElement[] {
  const k = at.scale
  return placed.map((p) => {
    const size = Math.max(6, Math.round(p.size * k * 10) / 10)
    const ink = (p.vertical ? p.height : p.width) * k
    const width = Math.ceil(ink * 1.04) + 2
    const x = p.vertical ? p.x * k + at.x + size * (INK_TOP + 1) : p.x * k + at.x
    const y = p.vertical ? p.y * k + at.y : p.y * k + at.y - size * INK_TOP
    return {
      id: nanoid(8),
      type: 'text',
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      width,
      height: Math.round(size * BOX),
      rotation: p.vertical ? 90 : 0,
      opacity: 1,
      groupId,
      text: p.text,
      fontSize: size,
      fontFamily: family,
      fontStyle: 'bold',
      align: 'left',
      fill: colors[p.rank % colors.length]
    } satisfies TrameElement
  })
}
