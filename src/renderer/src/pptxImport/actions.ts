import { confirmUnsaved } from '@/fileActions'
import { importPptx, MAX_PPTX_SLIDES } from '@/pptxImport/importPptx'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'

/** Importe un fichier PowerPoint comme nouveau document (confirmation si le document courant est modifié) et résume ce qui n'a pas été repris. */
export async function importPptxFile(): Promise<void> {
  const picked = await window.trame.pickPptx()
  if (!picked) return // annuler le sélecteur ne pose aucune question
  if (!(await confirmUnsaved('importPptx'))) return
  try {
    const report = await importPptx(picked.bytes, picked.name)
    useEditor.getState().loadDocument(report.doc, undefined)
    useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
    const notes: string[] = []
    if (report.unsupported.length) notes.push(t('imp.pptx.notImported', { list: report.unsupported.map((u) => t('imp.pptx.slides', { what: u.what, count: u.slides })).join(', ') }))
    if (report.substitutedFonts.length) notes.push(t('imp.fontsReplaced', { fonts: report.substitutedFonts.join(', ') }))
    if (report.truncated) notes.push(t('imp.pptx.truncated', { count: MAX_PPTX_SLIDES }))
    if (notes.length) await window.trame.showInfo(t('imp.pptx.done', { count: report.slides }), notes.join('\n'))
  } catch (err) {
    await window.trame.showError(t('imp.failed'), t('imp.pptx.unreadable', { error: err instanceof Error ? err.message : String(err) }))
  }
}
