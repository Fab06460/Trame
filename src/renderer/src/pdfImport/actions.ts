import { confirmUnsaved } from '@/fileActions'
import { importPdf, openPdf } from '@/pdfImport/importPdf'
import { useEditor } from '@/store/editor'
import { usePdfImport } from '@/store/pdfImport'

/** Étape 1 : choisir un PDF puis ouvrir la fenêtre d'options. Annuler le sélecteur ne pose aucune question. */
export async function startPdfImport(): Promise<void> {
  const picked = await window.trame.pickPdf()
  if (!picked) return
  try {
    usePdfImport.getState().open(await openPdf(picked.bytes), picked.name, picked.bytes)
  } catch (err) {
    await window.trame.showError('Import impossible', `Ce fichier n'a pas pu être lu comme un PDF (${err instanceof Error ? err.message : String(err)}). Il est peut-être protégé par un mot de passe ou endommagé.`)
  }
}

/** Étape 2 : importer avec les options choisies, remplacer le document (après confirmation si besoin) et résumer ce qui a été remplacé. */
export async function runPdfImport(): Promise<void> {
  const s = usePdfImport.getState()
  if (!s.pdf) return
  if (!(await confirmUnsaved('importer un PDF'))) return
  s.set({ progress: { done: 0, total: s.pages } })
  try {
    const report = await importPdf(s.pdf, s.name, { mode: s.mode, pages: s.pages, source: s.bytes ?? undefined, onProgress: (done, total) => usePdfImport.getState().set({ progress: { done, total } }) })
    useEditor.getState().loadDocument(report.doc, undefined)
    useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
    usePdfImport.getState().close()
    const notes: string[] = []
    if (s.mode === 'editable') {
      notes.push(`${report.texts} bloc${report.texts > 1 ? 's' : ''} de texte modifiable${report.texts > 1 ? 's' : ''}.`)
      if (report.substitutedFonts.length) notes.push(`Polices remplacées par une police voisine : ${report.substitutedFonts.join(', ')}.`)
      if (report.keptAsImage) notes.push(`${report.keptAsImage} bloc${report.keptAsImage > 1 ? 's' : ''} de texte laissé${report.keptAsImage > 1 ? 's' : ''} dans l'image de fond (non modifiable${report.keptAsImage > 1 ? 's' : ''}).`)
    }
    if (report.sourceDropped) notes.push("Le PDF d'origine est trop volumineux pour être conservé dans le document : l'export PDF utilisera l'image des pages.")
    if (report.doc.pages.length < s.pdf?.numPages) notes.push(`Seules les ${report.doc.pages.length} premières pages ont été importées.`)
    if (notes.length) await window.trame.showInfo(`PDF importé (${report.doc.pages.length} page${report.doc.pages.length > 1 ? 's' : ''})`, notes.join('\n'))
  } catch (err) {
    usePdfImport.getState().set({ progress: null })
    await window.trame.showError('Import impossible', err instanceof Error ? err.message : String(err))
  }
}
