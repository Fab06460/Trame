import { useEditor, migrateDocument } from '@/store/editor'
import { exportDataUrl } from '@/stageRegistry'
import { exportPdf } from '@/exportPages'

export function Toolbar(): React.JSX.Element {
  const { addElement, undo, redo, newDocument, loadDocument, markSaved } = useEditor.getState()
  const name = useEditor((s) => s.doc.name)
  const pageNo = useEditor((s) => s.doc.pages.findIndex((p) => p.id === s.pageId) + 1)
  const pageCount = useEditor((s) => s.doc.pages.length)
  const dirty = useEditor((s) => s.dirty)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)

  const save = async (): Promise<void> => {
    const { doc, filePath } = useEditor.getState()
    const path = await window.trame.saveProject(JSON.stringify(doc), filePath)
    if (path) markSaved(path)
  }

  const open = async (): Promise<void> => {
    const res = await window.trame.openProject()
    if (res) loadDocument(migrateDocument(JSON.parse(res.json)), res.path)
  }

  const addImage = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (!src) return
    const img = new window.Image()
    img.onload = () => {
      const { doc } = useEditor.getState()
      const ratio = Math.min(1, (doc.width * 0.6) / img.width, (doc.height * 0.6) / img.height)
      addElement({ type: 'image', src, width: img.width * ratio, height: img.height * ratio })
    }
    img.src = src
  }

  const exportAs = async (type: 'image/png' | 'image/jpeg'): Promise<void> => {
    const url = exportDataUrl(type)
    if (url) await window.trame.saveExport(url, `${name}${pageCount > 1 ? `-page${pageNo}` : ''}.${type === 'image/png' ? 'png' : 'jpg'}`)
  }

  const exportPdfFile = async (): Promise<void> => {
    const { doc } = useEditor.getState()
    await window.trame.saveExport(await exportPdf(doc), `${doc.name}.pdf`)
  }

  return (
    <header className="toolbar">
      <div className="brand">Trame</div>
      <button onClick={newDocument}>Nouveau</button>
      <button onClick={open}>Ouvrir</button>
      <button onClick={save}>Enregistrer{dirty ? ' •' : ''}</button>
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title="Annuler (⌘Z)">↩︎</button>
      <button disabled={!canRedo} onClick={redo} title="Rétablir (⇧⌘Z)">↪︎</button>
      <span className="sep" />
      <button onClick={() => addElement({ type: 'text' })}>Texte</button>
      <button onClick={() => addElement({ type: 'rect' })}>Rectangle</button>
      <button onClick={() => addElement({ type: 'ellipse' })}>Ellipse</button>
      <button onClick={addImage}>Image</button>
      <span className="spacer" />
      <button onClick={exportPdfFile}>Export PDF</button>
      <button onClick={() => exportAs('image/jpeg')}>Export JPG</button>
      <button className="primary" onClick={() => exportAs('image/png')}>Export PNG</button>
    </header>
  )
}
