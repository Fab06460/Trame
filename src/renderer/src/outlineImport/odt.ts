import JSZip from 'jszip'
import { attr, deep, kid, kids, nameOfEl, parseXml } from '@/pptxImport/xml'
import { MAX_BLOCK_CHARS, MAX_ITEM_LEVEL, emptyOutline, type Outline } from './outline'

/** Mêmes limites que pour Word : images reprises, taille d'une image, total, XML principal, nombre de blocs. */
const MAX_IMAGES = 60
const MAX_IMAGE_BYTES = 10_000_000
const MAX_TOTAL_IMAGE_BYTES = 80_000_000
const MAX_XML_CHARS = 30_000_000
const MAX_BLOCKS = 6000

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

interface StyleInfo {
  parent?: string
  display?: string
  /** saut de page avant le paragraphe (`fo:break-before="page"` ou changement de style de page) */
  breakBefore?: boolean
  /** niveau hiérarchique du paragraphe (`style:default-outline-level`) */
  outline?: number
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path)
  if (!file) return null
  const text = await file.async('string')
  if (text.length > MAX_XML_CHARS) throw new Error('document trop volumineux')
  return parseXml(text)
}

/** Les styles de paragraphe (`styles.xml` et styles automatiques de `content.xml`) par nom. */
function readStyles(docs: Array<Document | null>): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  for (const doc of docs) {
    if (!doc) continue
    for (const s of deep(doc.documentElement, 'style')) {
      const name = attr(s, 'name')
      if (!name || attr(s, 'family') !== 'paragraph') continue
      const props = kid(s, 'paragraph-properties')
      const outline = Number(attr(s, 'default-outline-level'))
      const master = attr(s, 'master-page-name')
      styles.set(name, {
        ...(attr(s, 'parent-style-name') ? { parent: attr(s, 'parent-style-name')! } : {}),
        ...(attr(s, 'display-name') ? { display: attr(s, 'display-name')! } : {}),
        ...(attr(props, 'break-before') === 'page' || (master !== null && master !== '') ? { breakBefore: true } : {}),
        ...(attr(s, 'default-outline-level') !== null && Number.isFinite(outline) && outline >= 1 ? { outline } : {})
      })
    }
  }
  return styles
}

/** Les listes : pour chaque style de liste et niveau, la liste est-elle numérotée (et non à puces) ? */
function readListStyles(docs: Array<Document | null>): Map<string, Map<number, boolean>> {
  const out = new Map<string, Map<number, boolean>>()
  for (const doc of docs) {
    if (!doc) continue
    for (const ls of deep(doc.documentElement, 'list-style')) {
      const name = attr(ls, 'name')
      if (!name) continue
      const levels = new Map<number, boolean>()
      for (const l of kids(ls)) {
        const kind = nameOfEl(l)
        const level = Number(attr(l, 'level'))
        if (!Number.isFinite(level)) continue
        if (kind === 'list-level-style-number') levels.set(level, true)
        else if (kind === 'list-level-style-bullet' || kind === 'list-level-style-image') levels.set(level, false)
      }
      out.set(name, levels)
    }
  }
  return out
}

const clean = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim()

/** Une longueur ODF (« 10cm », « 4in », « 120pt », « 80px ») en points ; null si on ne la comprend pas. */
function points(value: string | null): number | null {
  const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/i.exec((value ?? '').trim())
  if (!m) return null
  const n = Number(m[1])
  const k = { cm: 28.3465, mm: 2.83465, in: 72, pt: 1, pc: 12, px: 0.75 }[(m[2] ?? 'pt').toLowerCase() as 'cm']
  return Number.isFinite(n) && n > 0 ? n * k : null
}

/** Une image de l'archive : chemin propre (sans `..` ni chemin absolu), sinon null. */
function archivePath(href: string | null): string | null {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) return null
  const parts: string[] = []
  for (const seg of href.replace(/^\.\//, '').split('/')) {
    if (seg === '..') return null
    if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/') || null
}

/**
 * Document LibreOffice / OpenDocument (.odt) vers un plan : titres (`text:h`, avec leur niveau, et le style « Titre » pour le titre du
 * document), listes (à puces ou numérotées, avec leur niveau, y compris imbriquées), paragraphes, images (PNG, JPEG, GIF ou WebP),
 * tableaux (une ligne de texte par rangée), sauts de page voulus. Le texte garde son contenu, pas ses styles (un élément Trame a un seul
 * style). Les en-têtes, pieds de page, notes de bas de page, zones de texte et dessins ne sont pas repris.
 */
export async function parseOdt(bytes: Uint8Array): Promise<Outline> {
  const zip = await JSZip.loadAsync(bytes)
  const content = await readXml(zip, 'content.xml')
  const body = content ? kid(kid(content.documentElement, 'body'), 'text') : null
  if (!content || !body) throw new Error('content.xml')

  const stylesDoc = await readXml(zip, 'styles.xml')
  const docs = [stylesDoc, content]
  const styles = readStyles(docs)
  const listStyles = readListStyles(docs)

  const out = emptyOutline()
  let imageCount = 0
  let imageBytes = 0
  const push = (b: Outline['blocks'][number]): void => {
    if (out.blocks.length < MAX_BLOCKS) out.blocks.push(b)
  }

  /** Le style, ou l'un de ses parents, répond-il au test ? (les noms ODF codent l'espace par `_20_`) */
  const inherits = (styleName: string | null, test: (name: string, info: StyleInfo | undefined) => boolean): boolean => {
    const seen = new Set<string>()
    for (let n = styleName; n && !seen.has(n); n = styles.get(n)?.parent ?? null) {
      seen.add(n)
      if (test(n, styles.get(n))) return true
    }
    return false
  }
  const isTitle = (styleName: string | null): boolean => inherits(styleName, (n, i) => /^(title|titre)$/i.test(n.replace(/_20_/g, ' ').trim()) || /^(title|titre)$/i.test((i?.display ?? '').trim()))
  /** Niveau hiérarchique donné par le style (ou un parent), 0 si le style n'en porte pas. */
  const styleOutline = (styleName: string | null): number => {
    const seen = new Set<string>()
    for (let n = styleName; n && !seen.has(n); n = styles.get(n)?.parent ?? null) {
      seen.add(n)
      const o = styles.get(n)?.outline
      if (o !== undefined) return o
    }
    return 0
  }
  const breaksBefore = (styleName: string | null): boolean => {
    // le saut vient du style du paragraphe lui-même, ou d'un style parent qui le porte
    return inherits(styleName, (_n, i) => !!i?.breakBefore)
  }

  /** Texte d'un paragraphe ou d'un titre, avec espaces, tabulations et retours à la ligne ; notes de bas de page et suivi des modifications ignorés. */
  function textOf(el: Element): string {
    let s = ''
    const walk = (n: Element): void => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          s += c.nodeValue ?? ''
          continue
        }
        if (c.nodeType !== 1) continue
        const e = c as Element
        const name = nameOfEl(e)
        if (name === 's') s += ' '.repeat(Math.min(50, Math.max(1, Number(attr(e, 'c')) || 1)))
        else if (name === 'tab' || name === 'line-break') s += ' '
        else if (['span', 'a', 'hidden-text', 'ruby', 'ruby-base', 'meta', 'meta-field', 'bookmark-ref', 'reference-ref'].includes(name)) walk(e)
        // `note`, `annotation`, `frame`, `change`…: pas du texte du paragraphe
      }
    }
    walk(el)
    return s
  }

  /** Images (cadres `draw:frame` contenant `draw:image`) d'un paragraphe, dans l'ordre. */
  async function imagesOf(p: Element): Promise<void> {
    for (const frame of deep(p, 'frame')) {
      const image = kid(frame, 'image')
      if (!image) {
        // zone de texte, formule, objet : non repris
        if (kid(frame, 'text-box') || kid(frame, 'object') || kid(frame, 'object-ole')) out.notes.skippedImages++
        continue
      }
      const path = archivePath(attr(image, 'href'))
      const ext = path?.split('.').pop()?.toLowerCase() ?? ''
      const file = path ? zip.file(path) : null
      if (!file || !MIME[ext] || imageCount >= MAX_IMAGES) {
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
      const w = points(attr(frame, 'width'))
      const h = points(attr(frame, 'height'))
      const alt = clean(kid(frame, 'desc')?.textContent ?? kid(frame, 'title')?.textContent ?? '')
      push({ kind: 'image', src: `data:${MIME[ext]};base64,${data}`, ...(alt ? { alt } : {}), ...(w && h ? { ratio: w / h } : {}) })
    }
  }

  async function paragraph(p: Element, list: { ordered: boolean; level: number } | null): Promise<void> {
    const style = attr(p, 'style-name')
    if (out.blocks.length && breaksBefore(style)) push({ kind: 'break' }) // LibreOffice pose un style de page sur le tout premier paragraphe
    const text = clean(textOf(p)).slice(0, MAX_BLOCK_CHARS)
    const isHeading = nameOfEl(p) === 'h'
    if (text) {
      if (!isHeading && isTitle(style) && !list) {
        if (out.title === undefined) out.title = text
      } else if (isHeading) {
        const level = Number(attr(p, 'outline-level'))
        push({ kind: 'heading', level: Number.isFinite(level) && level >= 1 ? Math.min(6, Math.round(level)) : Math.max(1, styleOutline(style)), text })
      } else if (list) push({ kind: 'item', level: list.level, ordered: list.ordered, text })
      else {
        const lvl = styleOutline(style)
        if (lvl > 0) push({ kind: 'heading', level: Math.min(6, lvl), text })
        else push({ kind: 'para', text })
      }
    }
    await imagesOf(p)
  }

  async function listOf(l: Element, styleName: string | null, depth: number): Promise<void> {
    const name = attr(l, 'style-name') ?? styleName
    for (const item of kids(l, 'list-item')) {
      for (const c of kids(item)) {
        const kind = nameOfEl(c)
        if (kind === 'p' || kind === 'h') {
          const level = Math.min(MAX_ITEM_LEVEL, depth)
          const ordered = listStyles.get(name ?? '')?.get(depth + 1) ?? false
          await paragraph(c, { ordered, level })
        } else if (kind === 'list') await listOf(c, name, depth + 1)
      }
    }
    for (const header of kids(l, 'list-header')) for (const c of kids(header, 'p')) await paragraph(c, null)
  }

  async function table(tbl: Element): Promise<void> {
    let rows = 0
    for (const tr of deep(tbl, 'table-row')) {
      const cells = kids(tr, 'table-cell').map((tc) => clean(deep(tc, 'p').map((p) => textOf(p)).join(' ')))
      const text = cells.filter(Boolean).join(' | ').slice(0, MAX_BLOCK_CHARS)
      if (text) {
        push({ kind: 'para', text })
        rows++
      }
      for (const _ of deep(tr, 'frame')) out.notes.skippedImages++
    }
    if (rows) out.notes.tables++
  }

  async function walk(parent: Element): Promise<void> {
    for (const el of kids(parent)) {
      const name = nameOfEl(el)
      if (name === 'p' || name === 'h') await paragraph(el, null)
      else if (name === 'list') await listOf(el, null, 0)
      else if (name === 'table') await table(el)
      else if (name === 'section' || name === 'index-body' || name === 'table-of-content' || name === 'alphabetical-index') {
        // les tables des matières sont des copies du texte : on les saute
        if (name === 'section' || name === 'index-body') await walk(el)
      }
    }
  }
  await walk(body)
  return out
}
