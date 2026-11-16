import { confirmUnsaved } from '@/fileActions'
import { ImportCancelled, importPdf, looksScanned, openPdf } from '@/pdfImport/importPdf'
import { languageForLocale, storedOcrLanguage } from '@/ocr/languages'
import { useLocale } from '@/i18n'
import { useEditor } from '@/store/editor'
import { usePdfImport } from '@/store/pdfImport'
import { t } from '@/i18n'

/** Étape 1 : choisir un PDF puis ouvrir la fenêtre d'options. Annuler le sélecteur ne pose aucune question. */
export async function startPdfImport(): Promise<void> {
  const picked = await window.trame.pickPdf()
  if (!picked) return
  try {
    const pdf = await openPdf(picked.bytes)
    usePdfImport.getState().open(pdf, picked.name, picked.bytes, await looksScanned(pdf).catch(() => false))
    usePdfImport.getState().set({ ocrLanguage: storedOcrLanguage(languageForLocale(useLocale.getState().locale)) })
  } catch (err) {
    await window.trame.showError(t('imp.failed'), t('imp.pdf.unreadable', { error: err instanceof Error ? err.message : String(err) }))
  }
}

/** Étape 2 : importer avec les options choisies, remplacer le document (après confirmation si besoin) et résumer ce qui a été remplacé. */
export async function runPdfImport(): Promise<void> {
  const s = usePdfImport.getState()
  if (!s.pdf) return
  if (!(await confirmUnsaved('importPdf'))) return
  const abort = new AbortController()
  s.set({ progress: { done: 0, total: s.pages }, abort })
  try {
    const report = await importPdf(s.pdf, s.name, { mode: s.mode, pages: s.pages, source: s.bytes ?? undefined, signal: abort.signal, ...(s.mode === 'editable' && s.ocr ? { ocr: { language: s.ocrLanguage } } : {}), onProgress: (done, total) => usePdfImport.getState().set({ progress: { done, total } }) })
    useEditor.getState().loadDocument(report.doc, undefined)
    useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
    usePdfImport.getState().close()
    const notes: string[] = []
    if (s.mode === 'editable') {
      notes.push(t('imp.pdf.texts', { count: report.texts }))
      if (report.substitutedFonts.length) notes.push(t('imp.fontsReplaced', { fonts: report.substitutedFonts.join(', ') }))
      if (report.keptAsImage) notes.push(t('imp.pdf.keptAsImage', { count: report.keptAsImage }))
      if (report.ocrPages) notes.push(t('imp.pdf.ocr', { pages: report.ocrPages, count: report.ocrBlocks }))
    }
    if (report.sourceDropped) notes.push(t('imp.pdf.sourceDropped'))
    if (report.doc.pages.length < s.pdf?.numPages) notes.push(t('imp.pdf.firstPages', { count: report.doc.pages.length }))
    if (notes.length) await window.trame.showInfo(t('imp.pdf.done', { count: report.doc.pages.length }), notes.join('\n'))
  } catch (err) {
    usePdfImport.getState().set({ progress: null, abort: null })
    if (err instanceof ImportCancelled) return // arrêté par la personne : la fenêtre reste ouverte, rien n'a été remplacé
    await window.trame.showError(t('imp.failed'), err instanceof Error ? err.message : String(err))
  }
}
