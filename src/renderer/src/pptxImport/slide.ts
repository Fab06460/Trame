/**
 * Analyse d'une diapositive PowerPoint en éléments Trame : pure (XML en entrée, éléments en sortie), sans mesure de texte ni accès
 * aux fichiers — l'assemblage est dans `importPptx.ts`. Unités OOXML : EMU (9 525 par pixel à 96 dpi), angles en 60 000e de degré,
 * tailles de police en 100e de point.
 */
import { nanoid } from 'nanoid'
import { resolveColor, type ColorMap, type Rgba, type Theme } from '@/pptxImport/colors'
import { attr, deep, kid, kids, nameOfEl, num } from '@/pptxImport/xml'
import { matchFont } from '@/pdfImport/layout'
import { SHAPES } from '@/shapes'
import type { ElementLink, Gradient, Shadow, TrameElement } from '@/types'
import { t as tr } from '@/i18n'
import { MAX_ALT } from '@shared/ai'

export const EMU_PER_PX = 9525
const px = (emu: number): number => emu / EMU_PER_PX
/** pixels de design par point typographique */
const PX_PER_PT = 96 / 72

/** Réglages hérités d'un espace réservé (diapositive → disposition → masque). */
export interface PlaceholderInfo {
  xfrm?: Element | null
  bodyPr?: Element | null
  /** `a:lstStyle` de l'espace réservé */
  lstStyle?: Element | null
}

export interface SlideContext {
  theme: Theme
  colorMap: ColorMap
  /** couleur de fond de la diapositive (sert aux formes sans remplissage mais avec contour) */
  background: string
  /** image d'une relation (`r:embed`) en data URL, ou null (format non pris en charge, fichier absent) */
  image: (relId: string) => string | null
  placeholder: (ph: { type: string | null; idx: string | null }) => PlaceholderInfo | null
  /** formes de masque et de disposition : les espaces réservés n'y sont pas dessinés (ce ne sont que des modèles) */
  skipPlaceholders?: boolean
  /** style de texte du masque pour un type d'espace réservé (`a:lvl1pPr`) */
  txStyle: (kind: 'title' | 'body' | 'other') => Element | null
  /** lien d'une relation (`r:id` d'un `a:hlinkClick`) : adresse web ou de courrier, ou diapositive visée (`@chemin`, remplacé par la page une fois toutes lues) ; absent pour les masques et dispositions */
  link?: (relId: string) => ElementLink | null
}

/** Positionnement d'un texte à calculer APRÈS mesure (le centre et la rotation de la forme, les marges, l'ancrage). */
export interface TextFit {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
  insets: { l: number; t: number; r: number; b: number }
  anchor: 't' | 'ctr' | 'b'
}

export interface Draft {
  el: TrameElement
  fit?: TextFit
}

export interface SlideResult {
  drafts: Draft[]
  /** éléments non repris, par nature (« tableau », « graphique »…) */
  unsupported: string[]
  /** polices du fichier remplacées par une police Trame voisine */
  substitutedFonts: string[]
}

interface Xfrm {
  x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean
}

interface Tf { sx: number; sy: number; tx: number; ty: number }
const IDENTITY: Tf = { sx: 1, sy: 1, tx: 0, ty: 0 }

function readXfrm(x: Element | null | undefined): Xfrm | null {
  const off = kid(x, 'off'), ext = kid(x, 'ext')
  if (!x || !off || !ext) return null
  return { x: num(off, 'x') ?? 0, y: num(off, 'y') ?? 0, w: num(ext, 'cx') ?? 0, h: num(ext, 'cy') ?? 0, rot: (num(x, 'rot') ?? 0) / 60000, flipH: attr(x, 'flipH') === '1', flipV: attr(x, 'flipV') === '1' }
}

/** Boîte en pixels de design, dans les axes de la diapositive, après la transformation des groupes parents. */
function boxOf(x: Xfrm, t: Tf): { cx: number; cy: number; w: number; h: number; rot: number } {
  const w = px(x.w * t.sx), h = px(x.h * t.sy)
  return { cx: px(t.tx + x.x * t.sx) + w / 2, cy: px(t.ty + x.y * t.sy) + h / 2, w, h, rot: x.rot }
}

/** Haut-gauche non pivoté (Trame tourne autour du coin haut-gauche, PowerPoint autour du centre) d'un point `(lx, ly)` de la boîte. */
function topLeft(b: { cx: number; cy: number; w: number; h: number; rot: number }, lx = 0, ly = 0): { x: number; y: number } {
  const r = (b.rot * Math.PI) / 180
  const dx = lx - b.w / 2, dy = ly - b.h / 2
  return { x: b.cx + dx * Math.cos(r) - dy * Math.sin(r), y: b.cy + dx * Math.sin(r) + dy * Math.cos(r) }
}

type Fill = { kind: 'none' } | { kind: 'solid'; color: Rgba } | { kind: 'gradient'; gradient: Gradient; alpha: number } | { kind: 'image'; relId: string }

/** Remplissage de `spPr` (ou `bgPr`) ; null si rien n'est précisé (la forme hérite alors de son style). */
export function readFill(spPr: Element | null | undefined, ctx: Pick<SlideContext, 'theme' | 'colorMap'>): Fill | null {
  for (const k of kids(spPr)) {
    const n = nameOfEl(k)
    if (n === 'noFill') return { kind: 'none' }
    if (n === 'solidFill') {
      const c = resolveColor(kids(k)[0], ctx.theme, ctx.colorMap)
      return c ? { kind: 'solid', color: c } : null
    }
    if (n === 'pattFill') {
      const c = resolveColor(kids(kid(k, 'fgClr'))[0], ctx.theme, ctx.colorMap)
      return c ? { kind: 'solid', color: c } : null
    }
    if (n === 'gradFill') {
      const stops = kids(kid(k, 'gsLst'), 'gs').map((g) => ({ pos: num(g, 'pos') ?? 0, color: resolveColor(kids(g)[0], ctx.theme, ctx.colorMap) })).filter((s) => s.color)
      if (stops.length === 0) return null
      stops.sort((a, b) => a.pos - b.pos)
      const radial = !!kid(k, 'path')
      const ang = (num(kid(k, 'lin'), 'ang') ?? 0) / 60000
      return { kind: 'gradient', gradient: { type: radial ? 'radial' : 'linear', from: stops[0].color!.hex, to: stops[stops.length - 1].color!.hex, angle: Math.round((ang + 90) % 360) }, alpha: stops[0].color!.alpha }
    }
    if (n === 'blipFill') {
      const relId = attr(kid(k, 'blip'), 'embed')
      return relId ? { kind: 'image', relId } : null
    }
  }
  return null
}

function readShadow(spPr: Element | null | undefined, ctx: SlideContext): Shadow | undefined {
  const s = kid(spPr, 'effectLst', 'outerShdw')
  if (!s) return undefined
  const c = resolveColor(kids(s)[0], ctx.theme, ctx.colorMap)
  if (!c) return undefined
  const dist = px(num(s, 'dist') ?? 0)
  const dir = ((num(s, 'dir') ?? 0) / 60000) * (Math.PI / 180)
  return { color: c.hex, blur: px(num(s, 'blurRad') ?? 0), offsetX: Math.round(dist * Math.cos(dir) * 100) / 100, offsetY: Math.round(dist * Math.sin(dir) * 100) / 100, opacity: c.alpha }
}

const PRESET_PATHS: Record<string, string | undefined> = {
  triangle: 'triangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', star5: 'star', heart: 'heart', rightArrow: 'arrow', mathPlus: 'plus', plus: 'plus', lightningBolt: 'bolt', wedgeRoundRectCallout: 'bubble', wedgeRectCallout: 'bubble'
}

/** Chemin d'une `a:custGeom` converti dans le viewBox 100×100 de Trame ; null si elle utilise des arcs (non pris en charge). */
export function custGeomPath(geom: Element): string | null {
  const path = kid(geom, 'pathLst', 'path')
  if (!path) return null
  const w = num(path, 'w') || 1, h = num(path, 'h') || 1
  const pt = (p: Element | null): string => `${Math.round(((num(p, 'x') ?? 0) / w) * 10000) / 100} ${Math.round(((num(p, 'y') ?? 0) / h) * 10000) / 100}`
  const out: string[] = []
  for (const c of kids(path)) {
    const pts = kids(c, 'pt')
    switch (nameOfEl(c)) {
      case 'moveTo': out.push(`M${pt(pts[0])}`); break
      case 'lnTo': out.push(`L${pt(pts[0])}`); break
      case 'cubicBezTo': out.push(`C${pts.map(pt).join(' ')}`); break
      case 'quadBezTo': out.push(`Q${pts.map(pt).join(' ')}`); break
      case 'close': out.push('Z'); break
      default: return null // arcTo : non pris en charge
    }
  }
  return out.length ? out.join(' ') : null
}

interface RunProps {
  size?: number // pt
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: Rgba
  font?: string
  spacing?: number // pt
  caps?: boolean
}

function readRPr(r: Element | null | undefined, ctx: SlideContext): RunProps {
  if (!r) return {}
  const out: RunProps = {}
  const sz = num(r, 'sz')
  if (sz) out.size = sz / 100
  if (attr(r, 'b') !== null) out.bold = attr(r, 'b') === '1' || attr(r, 'b') === 'true'
  if (attr(r, 'i') !== null) out.italic = attr(r, 'i') === '1' || attr(r, 'i') === 'true'
  if (attr(r, 'u') !== null) out.underline = attr(r, 'u') !== 'none'
  if (attr(r, 'strike') !== null) out.strike = attr(r, 'strike') !== 'noStrike'
  if (attr(r, 'cap') !== null) out.caps = attr(r, 'cap') === 'all'
  const spc = num(r, 'spc')
  if (spc !== null) out.spacing = spc / 100
  const fill = readFill(r, ctx)
  if (fill?.kind === 'solid') out.color = fill.color
  const face = attr(kid(r, 'latin'), 'typeface')
  if (face) out.font = face === '+mj-lt' ? ctx.theme.major : face === '+mn-lt' ? ctx.theme.minor : face
  return out
}

const merge = (...list: RunProps[]): RunProps => Object.assign({}, ...list.map((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined))))

/** `a:lvl1pPr/a:defRPr` d'un `a:lstStyle` ou d'un style de texte. */
const lvl1 = (lst: Element | null | undefined, ctx: SlideContext): RunProps => readRPr(kid(lst, 'lvl1pPr', 'defRPr'), ctx)

function placeholderKind(type: string | null): 'title' | 'body' | 'other' {
  if (type === 'title' || type === 'ctrTitle') return 'title'
  if (type === null || type === 'body' || type === 'subTitle' || type === 'obj') return 'body'
  return 'other'
}

interface State {
  ctx: SlideContext
  out: Draft[]
  unsupported: Set<string>
  substituted: Set<string>
  groupId?: string
}

function baseElement(type: TrameElement['type'], b: { cx: number; cy: number; w: number; h: number; rot: number }): TrameElement {
  const tl = topLeft(b)
  return { id: nanoid(8), type, x: tl.x, y: tl.y, width: b.w, height: b.h, rotation: Math.round(b.rot * 100) / 100, opacity: 1, fill: '#000000' } as TrameElement
}

function textOfParagraph(p: Element): string {
  let s = ''
  for (const n of kids(p)) {
    const k = nameOfEl(n)
    if (k === 'r' || k === 'fld') s += kid(n, 't')?.textContent ?? ''
    else if (k === 'br') s += '\n'
  }
  return s
}

function buildText(sp: Element, b: { cx: number; cy: number; w: number; h: number; rot: number }, st: State, ph: PlaceholderInfo | null, phType: string | null, isPh: boolean): Draft | null {
  const body = kid(sp, 'txBody')
  if (!body) return null
  const paragraphs = kids(body, 'p')
  const lines = paragraphs.map(textOfParagraph)
  if (!lines.join('').trim()) return null
  const ctx = st.ctx
  const bodyPr = kid(body, 'bodyPr')
  const phBodyPr = ph?.bodyPr
  const inset = (name: string, dflt: number): number => px(num(bodyPr, name) ?? num(phBodyPr, name) ?? dflt)
  const insets = { l: inset('lIns', 91440), t: inset('tIns', 45720), r: inset('rIns', 91440), b: inset('bIns', 45720) }
  const anchor = (attr(bodyPr, 'anchor') ?? attr(phBodyPr, 'anchor') ?? 't') as 't' | 'ctr' | 'b'
  const fontScale = (num(kid(bodyPr, 'normAutofit'), 'fontScale') ?? 100000) / 100000

  // style : masque → espace réservé → liste de la forme → premier passage de texte non vide
  const firstIdx = lines.findIndex((l) => l.trim())
  const firstPara = paragraphs[firstIdx]
  const firstRun = kids(firstPara).find((n) => ['r', 'fld'].includes(nameOfEl(n)) && (kid(n, 't')?.textContent ?? '').trim())
  const run = merge(
    lvl1(ctx.txStyle(isPh ? placeholderKind(phType) : 'other'), ctx),
    lvl1(ph?.lstStyle, ctx),
    lvl1(kid(body, 'lstStyle'), ctx),
    readRPr(kid(firstPara, 'pPr', 'defRPr'), ctx),
    readRPr(kid(firstRun, 'rPr'), ctx)
  )
  const styleColor = resolveColor(kids(kid(sp, 'style', 'fontRef'))[0], ctx.theme, ctx.colorMap)
  const defaultInk = ctx.theme.colors[ctx.colorMap.tx1 ?? 'dk1']
  const color = run.color ?? styleColor ?? { hex: defaultInk ? `#${defaultInk.toLowerCase()}` : '#000000', alpha: 1 }
  const typeface = run.font ?? ctx.theme.minor
  const choice = matchFont(`${typeface}${run.bold ? '-Bold' : ''}${run.italic ? '-Italic' : ''}`)
  if (!choice.exact) st.substituted.add(typeface)
  const size = (run.size ?? 18) * fontScale * PX_PER_PT

  const pPr = kid(firstPara, 'pPr')
  const algn = attr(pPr, 'algn')
  const lnPct = num(kid(pPr, 'lnSpc', 'spcPct'), 'val')
  const lineHeight = lnPct ? Math.min(4, Math.max(0.5, Math.round((lnPct / 100000) * 1.2 * 100) / 100)) : undefined
  const list = kid(pPr, 'buChar') ? 'bullet' : kid(pPr, 'buAutoNum') ? 'number' : undefined

  const el = baseElement('text', b)
  Object.assign(el, {
    fill: color.hex,
    opacity: color.alpha,
    text: lines.join('\n'),
    fontSize: Math.round(size * 10) / 10,
    fontFamily: choice.family,
    fontStyle: choice.fontStyle,
    align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left',
    ...(run.spacing ? { letterSpacing: Math.round(run.spacing * PX_PER_PT * 10) / 10 } : {}),
    ...(lineHeight && lineHeight !== 1 ? { lineHeight } : {}),
    ...(run.underline ? { underline: true } : {}),
    ...(run.strike ? { strike: true } : {}),
    ...(run.caps ? { uppercase: true } : {}),
    ...(list ? { list } : {})
  })
  el.width = Math.max(8, b.w - insets.l - insets.r)
  return { el, fit: { cx: b.cx, cy: b.cy, w: b.w, h: b.h, rotation: b.rot, insets, anchor } }
}

function shapeElement(sp: Element, b: { cx: number; cy: number; w: number; h: number; rot: number }, st: State): TrameElement | null {
  const ctx = st.ctx
  const spPr = kid(sp, 'spPr')
  let fill = readFill(spPr, ctx)
  if (!fill) {
    const ref = resolveColor(kids(kid(sp, 'style', 'fillRef'))[0], ctx.theme, ctx.colorMap)
    const idx = num(kid(sp, 'style', 'fillRef'), 'idx') ?? 0
    fill = ref && idx > 0 ? { kind: 'solid', color: ref } : { kind: 'none' }
  }
  const ln = kid(spPr, 'ln')
  let strokeColor: Rgba | null = null
  let strokeWidth = 0
  if (ln && kid(ln, 'noFill')) strokeColor = null
  else if (ln && kid(ln, 'solidFill')) {
    strokeColor = resolveColor(kids(kid(ln, 'solidFill'))[0], ctx.theme, ctx.colorMap)
    strokeWidth = px(num(ln, 'w') ?? 12700)
  } else if (!ln) {
    const lr = kid(sp, 'style', 'lnRef')
    const idx = num(lr, 'idx') ?? 0
    if (idx > 0) {
      strokeColor = resolveColor(kids(lr)[0], ctx.theme, ctx.colorMap)
      strokeWidth = idx * 1.33
    }
  }
  if (fill.kind === 'image') return null // image en remplissage : traitée comme une image par l'appelant
  if (fill.kind === 'none' && !strokeColor) return null

  const geom = kid(spPr, 'prstGeom')
  const prst = attr(geom, 'prst') ?? (kid(spPr, 'custGeom') ? 'custom' : 'rect')
  let el: TrameElement
  if (prst === 'ellipse') el = baseElement('ellipse', b)
  else if (prst === 'rect' || prst === 'roundRect' || prst === 'round2SameRect' || prst === 'snipRoundRect' || prst === 'snip1Rect') {
    el = baseElement('rect', b)
    if (prst === 'roundRect') {
      // « adj » : fraction (en 100 000e) du plus petit côté ; 16667 par défaut (1/6)
      const val = Number(/val (\d+)/.exec(attr(kids(kid(geom, 'avLst'), 'gd')[0], 'fmla') ?? '')?.[1] ?? 16667)
      el.cornerRadius = Math.round((val / 100000) * Math.min(b.w, b.h) * 10) / 10
    }
  } else if (PRESET_PATHS[prst] && SHAPES.some((s) => s.id === PRESET_PATHS[prst])) {
    el = baseElement('path', b)
    el.path = SHAPES.find((s) => s.id === PRESET_PATHS[prst])!.path
  } else if (prst === 'custom') {
    const d = custGeomPath(kid(spPr, 'custGeom')!)
    if (d) {
      el = baseElement('path', b)
      el.path = d
    } else {
      st.unsupported.add(tr('imp.pptx.arcs'))
      el = baseElement('rect', b)
    }
  } else {
    st.unsupported.add(tr('imp.pptx.shape', { name: prst }))
    el = baseElement('rect', b)
  }
  if (fill.kind === 'solid') {
    el.fill = fill.color.hex
    el.opacity = fill.color.alpha
  } else if (fill.kind === 'gradient') {
    el.fill = fill.gradient.from
    el.gradient = fill.gradient
    el.opacity = fill.alpha
  } else {
    el.fill = ctx.background // pas de remplissage dans Trame : on peint la couleur du fond (le contour seul reste visible)
  }
  if (strokeColor && strokeWidth > 0) {
    el.stroke = strokeColor.hex
    el.strokeWidth = Math.round(strokeWidth * 100) / 100
    if (ln && /dash|dot/i.test(attr(kid(ln, 'prstDash'), 'val') ?? '')) el.strokeDashed = true
  }
  const shadow = readShadow(spPr, ctx)
  if (shadow) el.shadow = shadow
  return el
}

function imageElement(src: string, b: { cx: number; cy: number; w: number; h: number; rot: number }, crop: Element | null, flip: { h: boolean; v: boolean }, opacity: number): TrameElement {
  const el = baseElement('image', b)
  el.src = src
  el.opacity = opacity
  const l = (num(crop, 'l') ?? 0) / 100000, t = (num(crop, 't') ?? 0) / 100000, r = (num(crop, 'r') ?? 0) / 100000, bt = (num(crop, 'b') ?? 0) / 100000
  if (l || t || r || bt) el.crop = { x: l, y: t, width: Math.max(0.05, 1 - l - r), height: Math.max(0.05, 1 - t - bt) }
  if (flip.h) el.flipX = true
  if (flip.v) el.flipY = true
  return el
}

/** Le lien d'une forme ou d'une image : celui de la forme (`cNvPr`), sinon celui du premier passage de texte lié. */
function linkOf(node: Element, cNvPr: Element | null, st: State): ElementLink | null {
  if (!st.ctx.link) return null
  const click = kid(cNvPr, 'hlinkClick') ?? deep(kid(node, 'txBody'), 'hlinkClick')[0]
  const rid = click ? attr(click, 'id') : null
  return rid ? st.ctx.link(rid) : null
}

function walk(tree: Element, t: Tf, st: State): void {
  for (const node of kids(tree)) {
    const kind = nameOfEl(node)
    if (kind === 'sp' || kind === 'cxnSp') {
      const nvPr = kid(node, 'nvSpPr', 'nvPr') ?? kid(node, 'nvCxnSpPr', 'nvPr')
      const phEl = kid(nvPr, 'ph')
      const type = attr(phEl, 'type')
      if (phEl && st.ctx.skipPlaceholders) continue
      const ph = phEl ? st.ctx.placeholder({ type, idx: attr(phEl, 'idx') }) : null
      const x = readXfrm(kid(node, 'spPr', 'xfrm')) ?? readXfrm(ph?.xfrm)
      if (!x) continue
      const b = boxOf(x, t)
      const spPr = kid(node, 'spPr')
      const prst = attr(kid(spPr, 'prstGeom'), 'prst') ?? ''
      let drafts: Draft[] = []
      if (/^(line|straightConnector1)$/.test(prst) || kind === 'cxnSp') {
        // trait : un rectangle plein de l'épaisseur du trait (horizontal ou vertical) ; les diagonales ne sont pas prises en charge
        const ln = kid(spPr, 'ln')
        const c = resolveColor(kids(kid(ln, 'solidFill'))[0], st.ctx.theme, st.ctx.colorMap)
        const w = px(num(ln, 'w') ?? 12700)
        if (c && (b.h < 1 || b.w < 1)) {
          const horizontal = b.h < 1
          const bb = { ...b, w: horizontal ? b.w : w, h: horizontal ? w : b.h }
          const el = baseElement('rect', bb)
          el.fill = c.hex
          el.opacity = c.alpha
          drafts = [{ el }]
        } else st.unsupported.add(tr('imp.pptx.line'))
      } else {
        const fill = readFill(spPr, st.ctx)
        if (fill?.kind === 'image') {
          const src = st.ctx.image(fill.relId)
          if (src) drafts.push({ el: imageElement(src, b, null, { h: x.flipH, v: x.flipV }, 1) })
        } else {
          const shape = shapeElement(node, b, st)
          if (shape) drafts.push({ el: shape })
        }
        const text = buildText(node, b, st, ph, type, !!phEl)
        if (text) drafts.push(text)
      }
      const link = linkOf(node, kid(node, 'nvSpPr', 'cNvPr'), st)
      for (const d of drafts) {
        if (st.groupId) d.el.groupId = st.groupId
        if (link) d.el.link = link
        st.out.push(d)
      }
    } else if (kind === 'pic') {
      const x = readXfrm(kid(node, 'spPr', 'xfrm'))
      const blip = kid(node, 'blipFill', 'blip')
      const relId = attr(blip, 'embed')
      const src = relId ? st.ctx.image(relId) : null
      if (!x || !src) {
        st.unsupported.add(relId ? tr('imp.pptx.imageFormat') : tr('imp.pptx.imageMissing'))
        continue
      }
      const alpha = (num(kid(blip, 'alphaModFix'), 'amt') ?? 100000) / 100000
      const el = imageElement(src, boxOf(x, t), kid(node, 'blipFill', 'srcRect'), { h: x.flipH, v: x.flipV }, alpha)
      const shadow = readShadow(kid(node, 'spPr'), st.ctx)
      if (shadow) el.shadow = shadow
      const descr = attr(kid(node, 'nvPicPr', 'cNvPr'), 'descr')?.trim()
      // un nom de fichier (« image1.png », « preencoded.png ») n'est pas une description : PowerPoint et les bibliothèques en mettent par défaut
      if (descr && !/^\S+\.(png|jpe?g|gif|webp|bmp|svg|emf|wmf|tiff?)$/i.test(descr)) el.alt = descr.slice(0, MAX_ALT)
      if (st.groupId) el.groupId = st.groupId
      const link = linkOf(node, kid(node, 'nvPicPr', 'cNvPr'), st)
      if (link) el.link = link
      st.out.push({ el })
    } else if (kind === 'grpSp') {
      const g = kid(node, 'grpSpPr', 'xfrm')
      const off = kid(g, 'off'), ext = kid(g, 'ext'), choff = kid(g, 'chOff'), chext = kid(g, 'chExt')
      let nt = t
      if (off && ext && choff && chext) {
        const sx = (num(ext, 'cx') ?? 1) / (num(chext, 'cx') || 1)
        const sy = (num(ext, 'cy') ?? 1) / (num(chext, 'cy') || 1)
        nt = { sx: t.sx * sx, sy: t.sy * sy, tx: t.tx + t.sx * ((num(off, 'x') ?? 0) - (num(choff, 'x') ?? 0) * sx), ty: t.ty + t.sy * ((num(off, 'y') ?? 0) - (num(choff, 'y') ?? 0) * sy) }
      }
      walk(node, nt, { ...st, groupId: st.groupId ?? nanoid(8) })
    } else if (kind === 'graphicFrame') {
      const uri = attr(kid(node, 'graphic', 'graphicData'), 'uri') ?? ''
      st.unsupported.add(/table/.test(uri) ? tr('imp.pptx.table') : /chart/.test(uri) ? tr('imp.pptx.chart') : /diagram/.test(uri) ? tr('imp.pptx.smartart') : tr('imp.pptx.embedded'))
    }
  }
}

/** Analyse la liste des formes d'une diapositive (`p:spTree`). */
export function parseSlideTree(spTree: Element, ctx: SlideContext): SlideResult {
  const st: State = { ctx, out: [], unsupported: new Set(), substituted: new Set() }
  walk(spTree, IDENTITY, st)
  return { drafts: st.out, unsupported: [...st.unsupported], substitutedFonts: [...st.substituted] }
}


/** Position finale d'un texte une fois sa hauteur mesurée : selon l'ancrage vertical de la forme, autour de son centre (rotation comprise). */
export function finalizeText(d: Draft, textHeight: number): TrameElement {
  const f = d.fit
  if (!f) return d.el
  const yOff = f.anchor === 't' ? f.insets.t : f.anchor === 'ctr' ? (f.h - textHeight) / 2 : f.h - f.insets.b - textHeight
  const tl = topLeft({ cx: f.cx, cy: f.cy, w: f.w, h: f.h, rot: f.rotation }, f.insets.l, yOff)
  return { ...d.el, x: tl.x, y: tl.y, height: textHeight }
}
