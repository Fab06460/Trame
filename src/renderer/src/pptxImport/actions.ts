import { confirmUnsaved } from '@/fileActions'
import { importPptx, MAX_PPTX_SLIDES } from '@/pptxImport/importPptx'
import { useEditor } from '@/store/editor'

/** Importe un fichier PowerPoint comme nouveau document (confirmation si le document courant est modifié) et résume ce qui n'a pas été repris. */
export async function importPptxFile(): Promise<void> {
  const picked = await window.trame.pickPptx()
  if (!picked) return // annuler le sélecteur ne pose aucune question
  if (!(await confirmUnsaved('importer une présentation'))) return
  try {
    const report = await importPptx(picked.bytes, picked.name)
    useEditor.getState().loadDocument(report.doc, undefined)
    useEditor.setState({ dirty: true }) // un import n'est enregistré nulle part tant qu'on ne l'a pas fait
    const notes: string[] = []
    if (report.unsupported.length) notes.push(`Non repris : ${report.unsupported.map((u) => `${u.what} (${u.slides} diapositive${u.slides > 1 ? 's' : ''})`).join(', ')}.`)
    if (report.substitutedFonts.length) notes.push(`Polices remplacées par une police voisine : ${report.substitutedFonts.join(', ')}.`)
    if (report.truncated) notes.push(`Seules les ${MAX_PPTX_SLIDES} premières diapositives ont été importées.`)
    if (notes.length) await window.trame.showInfo(`Présentation importée (${report.slides} diapositive${report.slides > 1 ? 's' : ''})`, notes.join('\n'))
  } catch (err) {
    await window.trame.showError('Import impossible', `Ce fichier n'a pas pu être lu comme une présentation PowerPoint (${err instanceof Error ? err.message : String(err)}).`)
  }
}
