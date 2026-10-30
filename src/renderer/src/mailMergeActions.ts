import { fileSafeName } from '@/docName'
import { describeFallbacks } from '@/pdfFallbacks'
import { exportPdf } from '@/pdfExport'
import { decodeCsv, mergeDocument, parseCsv, rowFileNames, toMergeData, type MergeData } from '@/mailMerge'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'

export type CsvImport = { ok: true; data: MergeData; truncated: boolean } | { ok: false; error: 'cancel' | 'empty' }

/** Choisit un fichier CSV et le lit. Les données ne sont enregistrées dans le document que par l'appelant. */
export async function pickMergeData(): Promise<CsvImport> {
  const file = await window.trame.pickCsv()
  if (!file) return { ok: false, error: 'cancel' }
  const read = toMergeData(parseCsv(decodeCsv(file.bytes)))
  return read ? { ok: true, data: read.data, truncated: read.truncated } : { ok: false, error: 'empty' }
}

export interface MergeExportOptions {
  mode: 'single' | 'folder'
  /** colonne qui nomme les fichiers (mode « dossier »), null = numéro de ligne */
  nameColumn: number | null
  onProgress?: (done: number, total: number) => void
}

export interface MergeExportResult {
  /** chemin enregistré (fichier ou dossier), ou null si l'utilisateur a annulé */
  saved: string | null
  files: number
}

/**
 * Exporte le publipostage en PDF : un seul fichier (les pages du modèle pour la ligne 1, puis la ligne 2…) ou un fichier par ligne dans
 * un dossier. Le dossier est demandé AVANT le rendu : annuler ne coûte rien. Les textes qui n'ont pas pu être écrits en vrai texte sont
 * signalés après l'enregistrement, comme pour l'export PDF ordinaire.
 */
export async function exportMerge(o: MergeExportOptions): Promise<MergeExportResult> {
  const { doc } = useEditor.getState()
  const data = doc.mailMerge
  if (!data || data.rows.length === 0) return { saved: null, files: 0 }
  const rows = data.rows.map((_, i) => i)
  const base = fileSafeName(doc.name)
  const warn = async (fallbacks: Parameters<typeof describeFallbacks>[0]): Promise<void> => {
    const warning = describeFallbacks(fallbacks, doc.pages.length)
    if (warning) await window.trame.showInfo(warning.message, warning.detail)
  }

  if (o.mode === 'single') {
    o.onProgress?.(0, 1)
    const { dataUrl, fallbacks } = await exportPdf(mergeDocument(doc, data, rows))
    o.onProgress?.(1, 1)
    const saved = await window.trame.saveExport(dataUrl, `${base}.pdf`)
    if (saved) await warn(fallbacks)
    return { saved, files: saved ? 1 : 0 }
  }

  const names = rowFileNames(doc.name, data, rows, o.nameColumn, 'pdf')
  const picked = await window.trame.pickExportFolder(names, base)
  if (!picked) return { saved: null, files: 0 }
  if (picked.existing.length && !(await window.trame.confirm(t('xp.replace.title', { count: picked.existing.length }), t('xp.replace.detail', { list: `${picked.existing.slice(0, 5).join(', ')}${picked.existing.length > 5 ? '…' : ''}` }), t('xp.replace.button')))) return { saved: null, files: 0 }
  let firstFallbacks: Parameters<typeof describeFallbacks>[0] = []
  for (const [i, r] of rows.entries()) {
    o.onProgress?.(i, rows.length)
    const { dataUrl, fallbacks } = await exportPdf(mergeDocument(doc, data, [r]))
    if (i === 0) firstFallbacks = fallbacks
    if (!(await window.trame.writeExportFile(picked.dir, names[i], dataUrl))) throw new Error(t('xp.writeFailed', { name: names[i] }))
  }
  o.onProgress?.(rows.length, rows.length)
  await warn(firstFallbacks)
  return { saved: picked.dir, files: rows.length }
}
