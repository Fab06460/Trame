import { useEditor } from '@/store/editor'
import { insertImage } from '@/clipboardActions'
import { newProject, openProject, saveProject } from '@/fileActions'
import { renderPage } from '@/exportPages'
import { exportPptx } from '@/pptxExport'
import { exportPdf } from '@/pdfExport'
import { describeFallbacks } from '@/pdfFallbacks'
import { fileSafeName } from '@/docName'
import { DocName } from './DocName'
import { importPptxFile } from '@/pptxImport/actions'
import { startPdfImport } from '@/pdfImport/actions'
import { usePdfIssues } from '@/store/pdfIssues'

export function Toolbar(): React.JSX.Element {
  const { addElement, undo, redo } = useEditor.getState()
  const name = useEditor((s) => s.doc.name)
  const pageNo = useEditor((s) => s.doc.pages.findIndex((p) => p.id === s.pageId) + 1)
  const pageCount = useEditor((s) => s.doc.pages.length)
  const dirty = useEditor((s) => s.dirty)
  const pdfIssueCount = usePdfIssues((s) => Object.keys(s.issues).length)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)

  const addImage = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src) await insertImage(src)
  }

  const exportAs = async (type: 'image/png' | 'image/jpeg'): Promise<void> => {
    // rendu hors écran à la taille réelle du design : indépendant du zoom et de la position de la vue
    const { doc, pageId } = useEditor.getState()
    const url = await renderPage(doc, doc.pages.find((p) => p.id === pageId) ?? doc.pages[0], type)
    await window.trame.saveExport(url, `${fileSafeName(name)}${pageCount > 1 ? `-page${pageNo}` : ''}.${type === 'image/png' ? 'png' : 'jpg'}`)
  }

  const exportPdfFile = async (): Promise<void> => {
    const { doc } = useEditor.getState()
    const { dataUrl, fallbacks } = await exportPdf(doc)
    const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(doc.name)}.pdf`)
    // On prévient APRÈS l'enregistrement (rien n'est perdu) des textes qui n'ont pas pu être écrits en vrai texte
    const warning = saved ? describeFallbacks(fallbacks, doc.pages.length) : null
    if (warning) await window.trame.showInfo(warning.message, warning.detail)
  }

  const exportPptxFile = async (): Promise<void> => {
    const { doc } = useEditor.getState()
    const { dataUrl, rasterized } = await exportPptx(doc)
    const saved = await window.trame.saveExport(dataUrl, `${fileSafeName(doc.name)}.pptx`)
    // comme pour le PDF : on prévient APRÈS l'enregistrement de ce qui n'est pas resté modifiable dans PowerPoint
    if (saved && rasterized.length) {
      const causes = [...new Set(rasterized.map((r) => r.reason))].join(', ')
      await window.trame.showInfo(
        `${rasterized.length} élément${rasterized.length > 1 ? 's exportés' : ' exporté'} sous forme d'image`,
        `PowerPoint ne sait pas reproduire en objet modifiable : ${causes}. Ils sont placés en image à la même position.\nLes polices de Trame (Inter, Montserrat…) doivent être installées sur l'ordinateur qui ouvre le fichier, sinon PowerPoint les remplace.`
      )
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">Trame</div>
      <button onClick={newProject} title="Nouveau (⌘N)">Nouveau</button>
      <button onClick={openProject} title="Ouvrir (⌘O)">Ouvrir</button>
      <button onClick={() => saveProject()} title="Enregistrer (⌘S)">Enregistrer{dirty ? ' •' : ''}</button>
      <button onClick={() => void startPdfImport()} title="Importer un PDF comme nouveau document">Importer PDF</button>
      <button onClick={() => void importPptxFile()} title="Importer une présentation PowerPoint (.pptx) comme nouveau document">Importer PPTX</button>
      <button onClick={() => saveProject(true)} title="Enregistrer sous (⇧⌘S)">Enregistrer sous…</button>
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title="Annuler (⌘Z)">↩︎</button>
      <button disabled={!canRedo} onClick={redo} title="Rétablir (⇧⌘Z)">↪︎</button>
      <span className="sep" />
      <button onClick={() => addElement({ type: 'text' })}>Texte</button>
      <button onClick={() => addElement({ type: 'rect' })}>Rectangle</button>
      <button onClick={() => addElement({ type: 'ellipse' })}>Ellipse</button>
      <button onClick={addImage}>Image</button>
      <span className="spacer" />
      <DocName />
      <button
        onClick={exportPdfFile}
        className={pdfIssueCount ? 'has-warning' : ''}
        title={
          pdfIssueCount
            ? `${pdfIssueCount} texte${pdfIssueCount > 1 ? 's seront exportés' : ' sera exporté'} en image dans le PDF (non sélectionnable${pdfIssueCount > 1 ? 's' : ''}). Sélectionnez-les : l'éditeur indique pourquoi.`
            : 'Exporter toutes les pages en PDF'
        }
      >
        Export PDF{pdfIssueCount ? ` ⚠ ${pdfIssueCount}` : ''}
      </button>
      <button onClick={() => void exportPptxFile()} title="Exporter en présentation PowerPoint (Keynote, Google Slides et Canva savent l'ouvrir)">Export PPTX</button>
      <button onClick={() => exportAs('image/jpeg')}>Export JPG</button>
      <button className="primary" onClick={() => exportAs('image/png')}>Export PNG</button>
    </header>
  )
}
