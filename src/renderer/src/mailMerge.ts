import { nanoid } from 'nanoid'
import { fileSafeName } from '@/docName'
import { t } from '@/i18n'
import type { MergeData, TrameDocument, TrameElement } from '@/types'

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
  if (columns.length === 0 || rows.length === 0) delete doc.mailMerge
  else doc.mailMerge = { columns, rows }
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

/** Champs utilisés dans les textes du document, dans l'ordre d'apparition. */
export function fieldsUsed(doc: Pick<TrameDocument, 'pages'>): string[] {
  const out: string[] = []
  for (const p of doc.pages) for (const e of p.elements) if (e.type === 'text' && e.text) for (const f of fieldsIn(e.text)) if (!out.some((o) => key(o) === key(f))) out.push(f)
  return out
}

/** Champs utilisés dans les textes qui n'ont pas de colonne correspondante. */
export const unknownFields = (doc: Pick<TrameDocument, 'pages'>, columns: string[]): string[] => fieldsUsed(doc).filter((f) => !columns.some((c) => key(c) === key(f)))

/** Colonnes dont aucun texte ne se sert. */
export const unusedColumns = (doc: Pick<TrameDocument, 'pages'>, columns: string[]): string[] => {
  const used = fieldsUsed(doc)
  return columns.filter((c) => !used.some((f) => key(f) === key(c)))
}

const fillElement = (e: TrameElement, columns: string[], row: string[]): TrameElement => {
  const copy: TrameElement = { ...e, id: nanoid(8) }
  if (e.type === 'text' && e.text) copy.text = fillText(e.text, columns, row)
  return copy
}

/**
 * Document fusionné : les pages du modèle, remplies avec chacune des lignes choisies (ligne 1 : toutes les pages, puis ligne 2…).
 * Le document d'origine n'est pas modifié ; les données du publipostage ne suivent pas dans l'exportation.
 */
export function mergeDocument(doc: TrameDocument, data: MergeData, rowIndexes: number[]): TrameDocument {
  const { mailMerge: _mm, ...rest } = doc
  void _mm
  const groupIds = new Map<string, string>()
  const pages = rowIndexes.flatMap((r) => {
    const row = data.rows[r] ?? []
    groupIds.clear()
    return doc.pages.map((p) => ({
      ...p,
      id: nanoid(8),
      elements: p.elements.map((e) => {
        const copy = fillElement(e, data.columns, row)
        if (e.groupId) {
          if (!groupIds.has(e.groupId)) groupIds.set(e.groupId, nanoid(8))
          copy.groupId = groupIds.get(e.groupId)
        }
        return copy
      })
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
