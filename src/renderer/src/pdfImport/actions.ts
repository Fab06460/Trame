import { confirmUnsaved } from '@/fileActions'
import { importPdf, openPdf } from '@/pdfImport/importPdf'
import { useEditor } from '@/store/editor'
import { usePdfImport } from '@/store/pdfImport'
import { t } from '@/i18n'

/** Étape 1 : choisir un PDF puis ouvrir la fenêtre d'options. Annuler le sélecteur ne pose aucune question. */
export async function startPdfImport(): Promise<void> {
  const picked = await window.trame.pickPdf()
  if (!picked) return
  try {
    usePdfImport.getState().open(await openPdf(picked.bytes), picked.name, picked.bytes)
  } catch (err) {
    await window.trame.showError(t('imp.failed'), t('imp.pdf.unreadable', { error: err instanceof Error ? err.message : String(err) }))
  }
}

/** Étape 2 : importer avec les options choisies, remplacer le document (après confirmation si besoin) et résumer ce qui a été remplacé. */
export async function runPdfImport(): Promise<void> {
  const s = usePdfImport.getState()
  if (!s.pdf) return
  if (!(await confirmUnsaved('importPdf'))) return
  s.set({ progress: { done: 0, total: s.pages } })
  try {
    const report = await importPdf(s.pdf, s.name, { mode: s.mode, pages: s.pages, source: s.bytes ?? undefined, onProgress: (done, total) => usePdfImport.getState().set({ progress: { done, total } }) })
    useEditor.getState().loadDocument(report.doc, undefined)
    useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
    usePdfImport.getState().close()
    const notes: string[] = []
    if (s.mode === 'editable') {
      notes.push(t('imp.pdf.texts', { count: report.texts }))
      if (report.substitutedFonts.length) notes.push(t('imp.fontsReplaced', { fonts: report.substitutedFonts.join(', ') }))
      if (report.keptAsImage) notes.push(t('imp.pdf.keptAsImage', { count: report.keptAsImage }))
    }
    if (report.sourceDropped) notes.push(t('imp.pdf.sourceDropped'))
    if (report.doc.pages.length < s.pdf?.numPages) notes.push(t('imp.pdf.firstPages', { count: report.doc.pages.length }))
    if (notes.length) await window.trame.showInfo(t('imp.pdf.done', { count: report.doc.pages.length }), notes.join('\n'))
  } catch (err) {
    usePdfImport.getState().set({ progress: null })
    await window.trame.showError(t('imp.failed'), err instanceof Error ? err.message : String(err))
  }
}
