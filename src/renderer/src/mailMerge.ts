import { nanoid } from 'nanoid'
import { fileSafeName } from '@/docName'
import { t } from '@/i18n'
import { qrElements, qrKept } from '@/qr'
import type { MergeData, MergeSettings, TrameDocument, TrameElement } from '@/types'

export type { MergeData }

export const MAX_MERGE_ROWS = 2000
export const MAX_MERGE_COLUMNS = 50
export const MAX_MERGE_CELL = 500

/**
 * Texte d'un fichier CSV à partir de ses octets : UTF-8 (avec ou sans BOM) ou UTF-16 avec BOM ; à défaut Windows-1252, ce
 * qu'Excel écrit en français quand on choisit « CSV » sans préciser l'encodage.
 */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return new TextDecoder('windows-1252').decode(body)
  }
}

/** Séparateur le plus probable : celui qui revient le plus dans la première ligne, hors guillemets (« ; » en cas d'égalité avec « , » : Excel français). */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch]++
  }
  return counts[';'] >= counts[','] && counts[';'] >= counts['\t'] ? ';' : counts[','] >= counts['\t'] ? ',' : '\t'
}

/** Lit un CSV (guillemets, guillemets doublés, retours à la ligne dans une cellule, fins de ligne Windows ou Unix). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = (): void => {
    row.push(cell)
    cell = ''
  }
  const endRow = (): void => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) endCell()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

// eslint-disable-next-line no-control-regex
const cleanCell = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_MERGE_CELL)

/** En-têtes utilisables : vides remplacés par « Colonne n », doublons suffixés (« Nom », « Nom 2 »), accolades retirées. */
function cleanHeaders(raw: string[]): string[] {
  const seen = new Set<string>()
  return raw.map((h, i) => {
    const base = cleanCell(h).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || `Colonne ${i + 1}`
    let name = base
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} ${n}`
    seen.add(name.toLowerCase())
    return name
  })
}

export interface MergeImport {
  data: MergeData
  /** lignes ou colonnes ignorées parce que le tableau dépasse les limites */
  truncated: boolean
}

/** Tableau lu → données de publipostage : la première ligne donne les noms des champs ; les lignes vides sont ignorées. */
export function toMergeData(table: string[][]): MergeImport | null {
  const [head, ...body] = table
  if (!head || head.every((h) => !h.trim())) return null
  const width = Math.min(head.length, MAX_MERGE_COLUMNS)
  const columns = cleanHeaders(head.slice(0, width))
  const filled = body.filter((r) => r.some((c) => c.trim()))
  const rows = filled.slice(0, MAX_MERGE_ROWS).map((r) => columns.map((_, i) => cleanCell(r[i] ?? '').trim()))
  return { data: { columns, rows }, truncated: head.length > MAX_MERGE_COLUMNS || filled.length > MAX_MERGE_ROWS }
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const bounded = (v: unknown, min: number, max: number, fallback: number, integer = false): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, integer ? Math.round(v) : Math.round(v * 10) / 10)) : fallback)

/** Choix mémorisés lus dans un fichier : valeurs hors bornes ramenées aux bornes, le reste remplacé par la valeur par défaut ; illisibles = absents. */
export function cleanSettings(raw: unknown, columnCount: number): MergeSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const l = (r.layout && typeof r.layout === 'object' ? r.layout : {}) as Record<string, unknown>
  const nameColumn = typeof r.nameColumn === 'number' && Number.isInteger(r.nameColumn) && r.nameColumn >= 0 && r.nameColumn < columnCount ? r.nameColumn : null
  return {
    mode: r.mode === 'folder' ? 'folder' : 'single',
    nameColumn,
    sheet: bool(r.sheet, false),
    layout: {
      paper: l.paper === 'letter' ? 'letter' : 'a4',
      landscape: bool(l.landscape, false),
      cols: bounded(l.cols, 1, 10, 2, true),
      rows: bounded(l.rows, 1, 20, 4, true),
      marginMm: bounded(l.marginMm, 0, 50, 10),
      gapMm: bounded(l.gapMm, 0, 50, 2),
      cutMarks: bool(l.cutMarks, true),
      mirrorBacks: bool(l.mirrorBacks, true),
      fillCell: bool(l.fillCell, false),
      offsetXMm: bounded(l.offsetXMm, -20, 20, 0),
      offsetYMm: bounded(l.offsetYMm, -20, 20, 0),
      ...(typeof l.preset === 'string' && /^[\w-]{1,40}$/.test(l.preset) ? { preset: l.preset } : {})
    }
  }
}

/** Lecture lors de l'ouverture d'un fichier : données invalides ou vides → retirées. */
export function sanitizeMergeData(doc: { mailMerge?: unknown }): void {
  const raw = doc.mailMerge as Partial<MergeData> | undefined
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns) || !Array.isArray(raw.rows) || raw.columns.some((c) => typeof c !== 'string')) {
    delete doc.mailMerge
    return
  }
  const columns = cleanHeaders((raw.columns as string[]).slice(0, MAX_MERGE_COLUMNS))
  const rows = (raw.rows as unknown[])
    .filter((r): r is unknown[] => Array.isArray(r))
    .slice(0, MAX_MERGE_ROWS)
    .map((r) => columns.map((_, i) => (typeof r[i] === 'string' ? cleanCell(r[i] as string) : '')))
  const settings = cleanSettings(raw.settings, columns.length)
  if (columns.length === 0 || rows.length === 0) delete doc.mailMerge
  else doc.mailMerge = { columns, rows, ...(settings ? { settings } : {}) }
}

const FIELD = /\{\{\s*([^{}]+?)\s*\}\}/g

const key = (s: string): string => s.trim().toLowerCase()

/** Noms des champs « {{…}} » d'un texte, dans l'ordre, sans doublon. */
export function fieldsIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(FIELD)) if (!out.some((f) => key(f) === key(m[1]))) out.push(m[1].trim())
  return out
}

/** Remplace chaque « {{champ}} » par la valeur de la ligne ; un champ inconnu reste tel quel (il se voit sur la page). */
export function fillText(text: string, columns: string[], row: string[]): string {
  return text.replace(FIELD, (whole, name: string) => {
    const at = columns.findIndex((c) => key(c) === key(name))
    return at < 0 ? whole : (row[at] ?? '')
  })
}

/** Colonnes qui donnent une image (champ « Remplir avec la colonne » d'une image), dans l'ordre d'apparition. */
export function imageFieldsUsed(doc: Pick<TrameDocument, 'pages'>): string[] {
  const out: string[] = []
  for (const p of doc.pages) for (const e of p.elements) if (e.type === 'image' && e.imageField && !out.some((o) => key(o) === key(e.imageField!))) out.push(e.imageField)
  return out
}

/** Champs utilisés dans le document (textes et QR codes « {{champ}} » puis colonnes d'images), dans l'ordre d'apparition. */
export function fieldsUsed(doc: Pick<TrameDocument, 'pages'>): string[] {
  const out: string[] = []
  for (const p of doc.pages) {
    for (const e of p.elements) {
      const text = e.type === 'text' ? e.text : e.qr?.text
      if (text) for (const f of fieldsIn(text)) if (!out.some((o) => key(o) === key(f))) out.push(f)
    }
  }
  for (const f of imageFieldsUsed(doc)) if (!out.some((o) => key(o) === key(f))) out.push(f)
  return out
}

/** Lecture d'un fichier : `imageField` ne vaut que pour une image et doit être un nom de colonne raisonnable. */
export function sanitizeImageField(e: { type?: unknown; imageField?: unknown }): void {
  const v = e.imageField
  if (e.type !== 'image' || typeof v !== 'string' || !v.trim()) delete e.imageField
  else e.imageField = v.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || undefined
  if (e.imageField === undefined) delete e.imageField
}

/** Champs utilisés (textes ou images) qui n'ont pas de colonne correspondante. */
export const unknownFields = (doc: Pick<TrameDocument, 'pages'>, columns: string[]): string[] => fieldsUsed(doc).filter((f) => !columns.some((c) => key(c) === key(f)))

/** Colonnes dont aucun texte ne se sert. */
export const unusedColumns = (doc: Pick<TrameDocument, 'pages'>, columns: string[]): string[] => {
  const used = fieldsUsed(doc)
  return columns.filter((c) => !used.some((f) => key(f) === key(c)))
}

/** Image à mettre à la place de celle du modèle pour la valeur d'une cellule (nom de fichier) : les champs à remplacer, ou null si introuvable (l'image du modèle reste). */
export type ImageResolver = (template: TrameElement, value: string) => Partial<TrameElement> | null

/** Ajuste un texte rempli : `template` est le texte du modèle, `filled` le même texte rempli ; rend l'élément à garder. */
export type FitText = (template: TrameElement, filled: TrameElement) => TrameElement

const fillElement = (e: TrameElement, columns: string[], row: string[], fit?: FitText, images?: ImageResolver): TrameElement => {
  const copy: TrameElement = { ...e, id: nanoid(8) }
  if (e.type === 'image' && e.imageField) {
    const at = columns.findIndex((c) => key(c) === key(e.imageField!))
    const patch = at < 0 ? null : images?.(e, row[at] ?? '')
    return patch ? { ...copy, ...patch } : copy
  }
  if (e.type === 'text' && e.text) {
    copy.text = fillText(e.text, columns, row)
    if (fit && e.mergeFit && copy.text !== e.text) return fit(e, copy)
  }
  return copy
}

/**
 * Les QR codes dont le contenu porte des champs, remplis avec la ligne : chacun est redessiné (fond et modules, mêmes cadre, rotation et
 * rang dans la pile). Une cellule vide, ou un contenu qui ne tient pas dans un QR code, supprime le QR code de cette fiche : mieux vaut
 * rien qu'un code qui mène ailleurs.
 */
function fillQrCodes(elements: TrameElement[], columns: string[], row: string[]): TrameElement[] {
  const anchors = elements.filter((e) => e.qr && e.groupId && fieldsIn(e.qr.text).length > 0)
  if (anchors.length === 0) return elements
  const drawn = new Map<string, TrameElement[]>()
  for (const a of anchors) {
    const res = qrElements({ ...a.qr!, text: fillText(a.qr!.text, columns, row) }, { x: a.x, y: a.y, width: a.width, height: a.height }, { groupId: a.groupId, rotation: a.rotation, keep: qrKept(a) })
    drawn.set(a.groupId!, res?.elements ?? [])
  }
  const out: TrameElement[] = []
  const placed = new Set<string>()
  for (const e of elements) {
    const g = e.groupId
    if (!g || !drawn.has(g)) out.push(e)
    else if (!placed.has(g)) {
      placed.add(g)
      out.push(...drawn.get(g)!)
    }
  }
  return out
}

/**
 * Document fusionné : les pages du modèle, remplies avec chacune des lignes choisies (ligne 1 : toutes les pages, puis ligne 2…).
 * Le document d'origine n'est pas modifié ; les données du publipostage ne suivent pas dans l'exportation.
 */
export function mergeDocument(doc: TrameDocument, data: MergeData, rowIndexes: number[], fit?: FitText, images?: ImageResolver): TrameDocument {
  const { mailMerge: _mm, ...rest } = doc
  void _mm
  const groupIds = new Map<string, string>()
  const pages = rowIndexes.flatMap((r) => {
    const row = data.rows[r] ?? []
    groupIds.clear()
    return doc.pages.map((p) => ({
      ...p,
      id: nanoid(8),
      elements: fillQrCodes(
        p.elements.map((e) => {
          const copy = fillElement(e, data.columns, row, fit, images)
          if (e.groupId) {
            if (!groupIds.has(e.groupId)) groupIds.set(e.groupId, nanoid(8))
            copy.groupId = groupIds.get(e.groupId)
          }
          return copy
        }),
        data.columns,
        row
      )
    }))
  })
  return { ...rest, pages }
}

/** Noms de fichiers d'un fichier par ligne : valeur de la colonne choisie (ou numéro de ligne), sans caractère interdit, sans doublon. */
export function rowFileNames(docName: string, data: MergeData, rowIndexes: number[], column: number | null, extension: string): string[] {
  const used = new Set<string>()
  const width = String(data.rows.length).length
  return rowIndexes.map((r) => {
    const value = column === null ? '' : (data.rows[r]?.[column] ?? '').trim()
    const stem = value ? fileSafeName(value).slice(0, 80) : `${fileSafeName(docName)}-${String(r + 1).padStart(width, '0')}`
    let name = `${stem}.${extension}`
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem}-${n}.${extension}`
    used.add(name.toLowerCase())
    return name
  })
}

/** Lignes choisies dans une saisie comme « 1-3, 5, 8-9 » (numéros à partir de 1) : indices triés (à partir de 0), ou la raison du refus. */
export function parseRowRange(text: string, rowCount: number): { ok: true; rows: number[] } | { ok: false; error: string } {
  const parts = text.split(/[,;\s]+/).filter(Boolean)
  if (parts.length === 0) return { ok: false, error: t('mm.range.empty') }
  const out = new Set<number>()
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return { ok: false, error: t('mm.range.invalid', { part }) }
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (from < 1 || to < 1 || from > rowCount || to > rowCount) return { ok: false, error: t('mm.range.missing', { row: from > rowCount || from < 1 ? from : to, count: rowCount }) }
    if (from > to) return { ok: false, error: t('mm.range.order', { part }) }
    for (let r = from; r <= to; r++) out.add(r - 1)
  }
  return { ok: true, rows: [...out].sort((a, b) => a - b) }
}

/** Valeurs différentes d'une colonne, triées (pour filtrer : « Classe = 6A »). */
export const distinctValues = (data: MergeData, column: number): string[] =>
  [...new Set(data.rows.map((r) => r[column] ?? '').filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 200)

/** Lignes à produire : celles de `only` (indices, null = toutes) dont la colonne `filter.column` vaut `filter.value`. */
export function selectRows(data: MergeData, only: number[] | null, filter: { column: number; value: string } | null): number[] {
  const base = only ?? data.rows.map((_, i) => i)
  return base.filter((r) => r >= 0 && r < data.rows.length && (!filter || (data.rows[r][filter.column] ?? '') === filter.value))
}
