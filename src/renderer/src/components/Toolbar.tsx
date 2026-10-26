import { useEditor } from '@/store/editor'
import { insertImage } from '@/clipboardActions'
import { newProject, openProject, saveProject } from '@/fileActions'
import { renderPage } from '@/exportPages'
import { exportPdf } from '@/pdfExport'
import { describeFallbacks } from '@/pdfFallbacks'
import { fileSafeName } from '@/docName'
import { DocName } from './DocName'
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

  return (
    <header className="toolbar">
      <div className="brand">Trame</div>
      <button onClick={newProject} title="Nouveau (⌘N)">Nouveau</button>
      <button onClick={openProject} title="Ouvrir (⌘O)">Ouvrir</button>
      <button onClick={() => saveProject()} title="Enregistrer (⌘S)">Enregistrer{dirty ? ' •' : ''}</button>
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
      <button onClick={() => exportAs('image/jpeg')}>Export JPG</button>
      <button className="primary" onClick={() => exportAs('image/png')}>Export PNG</button>
    </header>
  )
}
