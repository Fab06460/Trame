import JSZip from 'jszip'
import { attr, deep, kid, kids, nameOfEl, parseXml } from '@/pptxImport/xml'
import { MAX_BLOCK_CHARS, MAX_ITEM_LEVEL, emptyOutline, type Outline } from './outline'

/** Images reprises au plus, taille d'une image, total, et taille du XML principal (un fichier plus gros est refusé). */
export const MAX_DOCX_IMAGES = 60
const MAX_IMAGE_BYTES = 10_000_000
const MAX_TOTAL_IMAGE_BYTES = 80_000_000
const MAX_XML_CHARS = 30_000_000
const MAX_BLOCKS = 6000

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const EMU_PER_PX = 9525

interface StyleInfo {
  name: string
  basedOn?: string
  outline?: number
  numId?: string
  ilvl?: number
}

const val = (el: Element | null | undefined): string | null => attr(el, 'val')

/** Chemin dans l'archive d'une cible relative à `word/document.xml`. */
function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = ['word']
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path)
  if (!file) return null
  const text = await file.async('string')
  if (text.length > MAX_XML_CHARS) throw new Error('document trop volumineux')
  return parseXml(text)
}

function readStyles(doc: Document | null): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  if (!doc) return styles
  for (const s of kids(doc.documentElement, 'style')) {
    const id = attr(s, 'styleId')
    if (!id) continue
    const ppr = kid(s, 'pPr')
    const outline = Number(val(kid(ppr, 'outlineLvl')))
    const numPr = kid(ppr, 'numPr')
    const ilvl = Number(val(kid(numPr, 'ilvl')))
    styles.set(id, {
      name: val(kid(s, 'name')) ?? '',
      ...(val(kid(s, 'basedOn')) ? { basedOn: val(kid(s, 'basedOn'))! } : {}),
      ...(val(kid(ppr, 'outlineLvl')) !== null && Number.isFinite(outline) ? { outline } : {}),
      ...(val(kid(numPr, 'numId')) !== null ? { numId: val(kid(numPr, 'numId'))! } : {}),
      ...(val(kid(numPr, 'ilvl')) !== null && Number.isFinite(ilvl) ? { ilvl } : {})
    })
  }
  return styles
}

/** Numérotation : pour chaque liste (`numId`) et niveau, la liste est-elle ordonnée (chiffres, lettres) ou à puces ? */
function readNumbering(doc: Document | null): (numId: string, ilvl: number) => boolean {
  const abstractFmt = new Map<string, Map<number, string>>()
  const numToAbstract = new Map<string, string>()
  if (doc) {
    for (const a of kids(doc.documentElement, 'abstractNum')) {
      const id = attr(a, 'abstractNumId')
      if (!id) continue
      const levels = new Map<number, string>()
      for (const l of kids(a, 'lvl')) levels.set(Number(attr(l, 'ilvl') ?? 0), val(kid(l, 'numFmt')) ?? 'decimal')
      abstractFmt.set(id, levels)
    }
    for (const n of kids(doc.documentElement, 'num')) {
      const id = attr(n, 'numId')
      const abs = val(kid(n, 'abstractNumId'))
      if (id && abs) numToAbstract.set(id, abs)
    }
  }
  return (numId, ilvl) => {
    const fmt = abstractFmt.get(numToAbstract.get(numId) ?? '')?.get(ilvl)
    return fmt !== undefined && fmt !== 'bullet' && fmt !== 'none'
  }
}

/** Niveau de titre (1 à 9) d'un paragraphe, 0 pour le style « Titre » du document, ou null si ce n'est pas un titre. */
function headingLevel(styles: Map<string, StyleInfo>, styleId: string | null, outlineLvl: number | null): number | null {
  if (outlineLvl !== null) return outlineLvl >= 0 && outlineLvl <= 8 ? outlineLvl + 1 : null
  const seen = new Set<string>()
  for (let id = styleId; id && !seen.has(id); id = styles.get(id)?.basedOn ?? null) {
    seen.add(id)
    const s = styles.get(id)
    if (s?.outline !== undefined) return s.outline >= 0 && s.outline <= 8 ? s.outline + 1 : null
    const name = (s?.name ?? '').trim()
    const m = /^(?:heading|titre)\s*(\d)$/i.exec(name) ?? /^(?:Heading|Titre)(\d)$/i.exec(id)
    if (m) return Number(m[1])
    if (/^(title|titre)$/i.test(name) || /^(Title|Titre)$/.test(id)) return 0
  }
  return null
}

/** Style de liste : `numId`, niveau et, à défaut de numérotation, les styles « Liste à puces » / « Liste numérotée » de Word. */
function listInfo(styles: Map<string, StyleInfo>, styleId: string | null, ppr: Element | null): { numId: string | null; ilvl: number; guess: boolean | null } {
  const numPr = kid(ppr, 'numPr')
  let numId = val(kid(numPr, 'numId'))
  let ilvl = val(kid(numPr, 'ilvl')) !== null ? Number(val(kid(numPr, 'ilvl'))) : null
  const seen = new Set<string>()
  let guess: boolean | null = null
  for (let id = styleId; id && !seen.has(id); id = styles.get(id)?.basedOn ?? null) {
    seen.add(id)
    const s = styles.get(id)
    if (numId === null && s?.numId !== undefined) numId = s.numId
    if (ilvl === null && s?.ilvl !== undefined) ilvl = s.ilvl
    const name = (s?.name ?? '').toLowerCase()
    if (guess === null && /^(list|liste)\s*(bullet|à puces|a puces)/.test(name)) guess = false
    if (guess === null && /^(list|liste)\s*(number|numéro|numerot)/.test(name)) guess = true
  }
  return { numId: numId === '0' ? null : numId, ilvl: Math.max(0, Math.min(MAX_ITEM_LEVEL, ilvl ?? 0)), guess }
}

const clean = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Document Word (.docx) vers un plan : titres (styles « Titre 1 » à « Titre 9 », y compris en français, ou niveau hiérarchique du
 * paragraphe), listes (à puces ou numérotées, avec leur niveau), paragraphes, images (au format PNG, JPEG, GIF ou WebP), tableaux
 * (une ligne de texte par rangée), sauts de page. Le texte garde son contenu, pas ses styles (un élément Trame a un seul style).
 * Les en-têtes, pieds de page, notes de bas de page, zones de texte et dessins ne sont pas repris.
 */
export async function parseDocx(bytes: Uint8Array): Promise<Outline> {
  const zip = await JSZip.loadAsync(bytes)
  const main = await readXml(zip, 'word/document.xml')
  const body = main ? kid(main.documentElement, 'body') : null
  if (!main || !body) throw new Error('word/document.xml')

  const styles = readStyles(await readXml(zip, 'word/styles.xml'))
  const isOrdered = readNumbering(await readXml(zip, 'word/numbering.xml'))
  const rels = new Map<string, string>()
  const relDoc = await readXml(zip, 'word/_rels/document.xml.rels')
  if (relDoc) for (const r of kids(relDoc.documentElement, 'Relationship')) if (attr(r, 'Id') && attr(r, 'Target') && attr(r, 'TargetMode') !== 'External') rels.set(attr(r, 'Id')!, resolveTarget(attr(r, 'Target')!))

  const out = emptyOutline()
  let imageCount = 0
  let imageBytes = 0

  const push = (b: Outline['blocks'][number]): void => {
    if (out.blocks.length < MAX_BLOCKS) out.blocks.push(b)
  }

  /** Images d'un paragraphe, dans l'ordre. */
  async function imagesOf(p: Element): Promise<void> {
    for (const drawing of deep(p, 'drawing')) {
      const blip = deep(drawing, 'blip')[0]
      const id = attr(blip, 'embed')
      const path = id ? rels.get(id) : undefined
      const ext = path?.split('.').pop()?.toLowerCase() ?? ''
      const file = path ? zip.file(path) : null
      if (!blip || !file || !MIME[ext] || imageCount >= MAX_DOCX_IMAGES) {
        out.notes.skippedImages++
        continue
      }
      const data = await file.async('base64')
      const size = Math.floor((data.length * 3) / 4)
      if (size > MAX_IMAGE_BYTES || imageBytes + size > MAX_TOTAL_IMAGE_BYTES) {
        out.notes.skippedImages++
        continue
      }
      imageCount++
      imageBytes += size
      const extent = deep(drawing, 'extent')[0]
      const cx = Number(attr(extent, 'cx'))
      const cy = Number(attr(extent, 'cy'))
      const docPr = deep(drawing, 'docPr')[0]
      const alt = clean(attr(docPr, 'descr') ?? attr(docPr, 'title') ?? '')
      push({ kind: 'image', src: `data:${MIME[ext]};base64,${data}`, ...(alt ? { alt } : {}), ...(cx > 0 && cy > 0 && cx / EMU_PER_PX >= 1 ? { ratio: cx / cy } : {}) })
    }
    // images « anciennes » (VML), zones de texte et formes : non reprises
    for (const _ of [...deep(p, 'pict'), ...deep(p, 'object')]) out.notes.skippedImages++
  }

  /** Texte d'un paragraphe ; `breaks` reçoit les positions (en caractères) des sauts de page qu'il contient. */
  function textOf(el: Element, breaks: number[]): string {
    let s = ''
    const walk = (n: Element): void => {
      for (const c of kids(n)) {
        const name = nameOfEl(c)
        if (name === 't') s += c.textContent ?? ''
        else if (name === 'tab') s += ' '
        else if (name === 'noBreakHyphen') s += '-'
        else if (name === 'br') {
          if (attr(c, 'type') === 'page') breaks.push(s.length)
          else s += ' '
        } else if (['r', 'hyperlink', 'smartTag', 'ins', 'fldSimple', 'sdt', 'sdtContent', 'sdtPr'].includes(name)) {
          if (name !== 'sdtPr') walk(c)
        }
        // `del` (texte supprimé suivi), `drawing`, `pict`… : ignorés ici
      }
    }
    walk(el)
    return s
  }

  async function paragraph(p: Element): Promise<void> {
    const ppr = kid(p, 'pPr')
    const styleId = val(kid(ppr, 'pStyle'))
    const outlineRaw = val(kid(ppr, 'outlineLvl'))
    const level = headingLevel(styles, styleId, outlineRaw !== null && Number.isFinite(Number(outlineRaw)) ? Number(outlineRaw) : null)
    if (kid(ppr, 'pageBreakBefore') && val(kid(ppr, 'pageBreakBefore')) !== '0') push({ kind: 'break' })
    const breaks: number[] = []
    const raw = textOf(p, breaks)
    const text = clean(raw).slice(0, MAX_BLOCK_CHARS)

    if (level === 0) {
      if (text && out.title === undefined) out.title = text
    } else if (text && level !== null) {
      push({ kind: 'heading', level, text })
    } else if (text) {
      const list = listInfo(styles, styleId, ppr)
      if (list.numId !== null || list.guess !== null) push({ kind: 'item', level: list.ilvl, ordered: list.numId !== null ? isOrdered(list.numId, list.ilvl) : !!list.guess, text })
      else push({ kind: 'para', text })
    }
    if (breaks.length) push({ kind: 'break' })
    await imagesOf(p)
  }

  async function table(tbl: Element): Promise<void> {
    let rows = 0
    for (const tr of kids(tbl, 'tr')) {
      const cells = kids(tr, 'tc').map((tc) => clean(kids(tc, 'p').map((p) => textOf(p, [])).join(' ')))
      const text = cells.filter(Boolean).join(' | ').slice(0, MAX_BLOCK_CHARS)
      if (text) {
        push({ kind: 'para', text })
        rows++
      }
      for (const _ of deep(tr, 'drawing')) out.notes.skippedImages++
    }
    if (rows) out.notes.tables++
  }

  async function walkBody(parent: Element): Promise<void> {
    for (const el of kids(parent)) {
      const name = nameOfEl(el)
      if (name === 'p') await paragraph(el)
      else if (name === 'tbl') await table(el)
      else if (name === 'sdt') {
        const content = kid(el, 'sdtContent')
        if (content) await walkBody(content)
      }
    }
  }
  await walkBody(body)
  return out
}
