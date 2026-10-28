import { nanoid } from 'nanoid'
import JSZip from 'jszip'
import { createTextNode } from '@/exportPages'
import { SIZE_LIMITS } from '@/magicResize'
import { parseTheme, resolveColor, DEFAULT_COLOR_MAP, type ColorMap, type Theme } from '@/pptxImport/colors'
import { finalizeText, parseSlideTree, readFill, type PlaceholderInfo, type SlideContext } from '@/pptxImport/slide'
import { readNotes } from '@/pptxImport/notes'
import { attr, kid, kids, parseXml } from '@/pptxImport/xml'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

export const MAX_PPTX_SLIDES = 100
const EMU_PER_PX = 9525
const MAX_IMAGE_BYTES = 25_000_000

export interface PptxReport {
  doc: TrameDocument
  slides: number
  elements: number
  /** diapositives dont les notes ont été reprises */
  notes: number
  /** éléments non repris (tableaux, graphiques…), avec le nombre de diapositives concernées */
  unsupported: Array<{ what: string; slides: number }>
  substitutedFonts: string[]
  truncated: boolean
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

/** Chemin absolu dans l'archive d'une cible relative à la partie `from`. */
function resolvePath(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = from.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

interface Rel { id: string; type: string; path: string }

class Archive {
  constructor(private zip: JSZip) {}
  has = (path: string): boolean => !!this.zip.file(path)
  text = async (path: string): Promise<string | null> => (await this.zip.file(path)?.async('string')) ?? null
  async xml(path: string): Promise<Document | null> {
    const t = await this.text(path)
    return t === null ? null : parseXml(t)
  }
  async rels(part: string): Promise<Rel[]> {
    const dir = part.split('/').slice(0, -1).join('/')
    const name = part.split('/').pop()
    const doc = await this.xml(`${dir ? dir + '/' : ''}_rels/${name}.rels`)
    if (!doc) return []
    return kids(doc.documentElement, 'Relationship').map((r) => ({ id: attr(r, 'Id') ?? '', type: (attr(r, 'Type') ?? '').split('/').pop() ?? '', path: resolvePath(part, attr(r, 'Target') ?? '') }))
  }
  /** Images d'une partie (relation → data URL). Formats non pris en charge ou trop lourds : absents. */
  async images(part: string): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    for (const r of await this.rels(part)) {
      if (r.type !== 'image') continue
      const mime = MIME[r.path.split('.').pop()?.toLowerCase() ?? '']
      const file = this.zip.file(r.path)
      if (!mime || !file) continue
      const data = await file.async('base64')
      if (data.length * 0.75 > MAX_IMAGE_BYTES) continue
      out.set(r.id, `data:${mime};base64,${data}`)
    }
    return out
  }
}

const normType = (t: string | null): string => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === null ? 'body' : t)

/** Espaces réservés d'une disposition ou d'un masque, retrouvés par `idx` puis par type. */
function collectPlaceholders(tree: Element | null): Array<{ type: string; idx: string | null; info: PlaceholderInfo }> {
  const out: Array<{ type: string; idx: string | null; info: PlaceholderInfo }> = []
  for (const sp of kids(tree, 'sp')) {
    const ph = kid(sp, 'nvSpPr', 'nvPr', 'ph')
    if (!ph) continue
    out.push({ type: normType(attr(ph, 'type')), idx: attr(ph, 'idx'), info: { xfrm: kid(sp, 'spPr', 'xfrm'), bodyPr: kid(sp, 'txBody', 'bodyPr'), lstStyle: kid(sp, 'txBody', 'lstStyle') } })
  }
  return out
}

function colorMapOf(master: Document | null): ColorMap {
  const m = kid(master?.documentElement, 'clrMap')
  if (!m) return DEFAULT_COLOR_MAP
  const map: ColorMap = {}
  for (let i = 0; i < m.attributes.length; i++) map[m.attributes[i].name] = m.attributes[i].value
  return map
}

/** Fond d'une diapositive, d'une disposition ou d'un masque (`p:cSld/p:bg`). */
function readBackground(doc: Document | null, theme: Theme, map: ColorMap): ReturnType<typeof readFill> {
  const bg = kid(doc?.documentElement, 'cSld', 'bg')
  if (!bg) return null
  const pr = kid(bg, 'bgPr')
  if (pr) return readFill(pr, { theme, colorMap: map })
  const c = resolveColor(kids(kid(bg, 'bgRef'))[0], theme, map)
  return c ? { kind: 'solid', color: c } : null
}

/** Importe un fichier PowerPoint (.pptx) : une page Trame par diapositive, au format de la présentation. */
export async function importPptx(bytes: Uint8Array, name: string): Promise<PptxReport> {
  const zip = new Archive(await JSZip.loadAsync(bytes))
  const pres = await zip.xml('ppt/presentation.xml')
  if (!pres) throw new Error("ce fichier n'est pas une présentation PowerPoint (ppt/presentation.xml absent)")
  const sz = kid(pres.documentElement, 'sldSz')
  const width = Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, Math.round((Number(attr(sz, 'cx')) || 9144000) / EMU_PER_PX)))
  const height = Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, Math.round((Number(attr(sz, 'cy')) || 6858000) / EMU_PER_PX)))

  const presRels = await zip.rels('ppt/presentation.xml')
  const themePath = presRels.find((r) => r.type === 'theme')?.path
  const theme = themePath ? parseTheme((await zip.xml(themePath)) ?? parseXml('<a/>')) : { colors: {}, major: 'Calibri', minor: 'Calibri' }
  const order = kids(kid(pres.documentElement, 'sldIdLst'), 'sldId').map((s) => attr(s, 'r:id')).filter(Boolean)
  const slidePaths = order.map((id) => presRels.find((r) => r.id === id)?.path).filter((p): p is string => !!p && zip.has(p))
  const truncated = slidePaths.length > MAX_PPTX_SLIDES

  const pages: TramePage[] = []
  const unsupported = new Map<string, number>()
  const substituted = new Set<string>()
  let elementCount = 0
  let notedSlides = 0

  for (const slidePath of slidePaths.slice(0, MAX_PPTX_SLIDES)) {
    const slideDoc = await zip.xml(slidePath)
    if (!slideDoc) continue
    const slideRels = await zip.rels(slidePath)
    const layoutPath = slideRels.find((r) => r.type === 'slideLayout')?.path
    const layoutDoc = layoutPath ? await zip.xml(layoutPath) : null
    const layoutRels = layoutPath ? await zip.rels(layoutPath) : []
    const masterPath = layoutRels.find((r) => r.type === 'slideMaster')?.path
    const masterDoc = masterPath ? await zip.xml(masterPath) : null
    const colorMap = colorMapOf(masterDoc)

    const bgFill = readBackground(slideDoc, theme, colorMap) ?? readBackground(layoutDoc, theme, colorMap) ?? readBackground(masterDoc, theme, colorMap)
    const bgHex = bgFill?.kind === 'solid' ? bgFill.color.hex : '#ffffff'

    const layoutPh = collectPlaceholders(kid(layoutDoc?.documentElement, 'cSld', 'spTree'))
    const masterPh = collectPlaceholders(kid(masterDoc?.documentElement, 'cSld', 'spTree'))
    const placeholder: SlideContext['placeholder'] = ({ type, idx }) => {
      const t = normType(type)
      const byIdx = idx !== null ? layoutPh.find((p) => p.idx === idx) : undefined
      const lay = byIdx ?? layoutPh.find((p) => p.type === t)
      const mas = masterPh.find((p) => p.type === t)
      if (!lay && !mas) return null
      return { xfrm: lay?.info.xfrm ?? mas?.info.xfrm, bodyPr: lay?.info.bodyPr ?? mas?.info.bodyPr, lstStyle: lay?.info.lstStyle ?? mas?.info.lstStyle }
    }
    const txStyles = kid(masterDoc?.documentElement, 'txStyles')
    const txStyle: SlideContext['txStyle'] = (kind) => kid(txStyles, kind === 'title' ? 'titleStyle' : kind === 'body' ? 'bodyStyle' : 'otherStyle')

    const part = (images: Map<string, string>, skipPlaceholders: boolean): SlideContext => ({ theme, colorMap, background: bgHex, image: (id) => images.get(id) ?? null, placeholder, txStyle, skipPlaceholders })
    const run = (doc: Document | null, images: Map<string, string>, skip: boolean, locked: boolean): TrameElement[] => {
      const tree = kid(doc?.documentElement, 'cSld', 'spTree')
      if (!tree) return []
      const r = parseSlideTree(tree, part(images, skip))
      for (const u of r.unsupported) unsupported.set(u, (unsupported.get(u) ?? 0) + 1)
      for (const f of r.substitutedFonts) substituted.add(f)
      return r.drafts.map((d) => {
        const el = d.fit ? finalizeText(d, createTextNode(d.el).height()) : d.el
        return locked ? { ...el, locked: true } : el
      })
    }

    const elements: TrameElement[] = []
    // fond non uni : un élément pleine page verrouillé (Trame n'a qu'une couleur de fond par page)
    if (bgFill?.kind === 'gradient') elements.push({ id: nanoid(8), type: 'rect', x: 0, y: 0, width, height, rotation: 0, opacity: 1, fill: bgFill.gradient.from, gradient: bgFill.gradient, locked: true, name: 'Fond' } as TrameElement)
    if (bgFill?.kind === 'image') {
      const src = (await zip.images(slidePath)).get(bgFill.relId) ?? (layoutPath ? (await zip.images(layoutPath)).get(bgFill.relId) : undefined) ?? (masterPath ? (await zip.images(masterPath)).get(bgFill.relId) : undefined)
      if (src) elements.push({ id: nanoid(8), type: 'image', x: 0, y: 0, width, height, rotation: 0, opacity: 1, fill: '#000000', src, locked: true, name: 'Fond' } as TrameElement)
    }
    const showMaster = attr(slideDoc.documentElement, 'showMasterSp') !== '0' && attr(layoutDoc?.documentElement, 'showMasterSp') !== '0'
    if (showMaster && masterDoc && masterPath) elements.push(...run(masterDoc, await zip.images(masterPath), true, true))
    if (layoutDoc && layoutPath) elements.push(...run(layoutDoc, await zip.images(layoutPath), true, true))
    elements.push(...run(slideDoc, await zip.images(slidePath), false, false))
    elementCount += elements.length
    const notesPath = slideRels.find((r) => r.type === 'notesSlide')?.path
    const notes = notesPath ? readNotes(await zip.xml(notesPath)) : undefined
    if (notes) notedSlides++
    pages.push({ id: nanoid(8), background: bgFill?.kind === 'solid' ? bgFill.color.hex : '#ffffff', ...(notes ? { notes } : {}), elements })
  }
  if (pages.length === 0) throw new Error('aucune diapositive trouvée dans ce fichier')
  const doc: TrameDocument = { version: 2, name, width, height, pages }
  return {
    doc,
    slides: pages.length,
    elements: elementCount,
    notes: notedSlides,
    unsupported: [...unsupported].map(([what, slides]) => ({ what, slides })),
    substitutedFonts: [...substituted].sort(),
    truncated
  }
}

