import { useEditor } from '@/store/editor'
import { insertImage } from '@/clipboardActions'
import { newProject, openProject, saveProject } from '@/fileActions'
import { DocName } from './DocName'
import { ExportMenu } from './ExportMenu'
import { ImportMenu } from './ImportMenu'
import { useFind } from '@/store/find'
import { usePresentation } from '@/store/presentation'

export function Toolbar(): React.JSX.Element {
  const { addElement, undo, redo } = useEditor.getState()
  const dirty = useEditor((s) => s.dirty)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)

  const addImage = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src) await insertImage(src)
  }

  return (
    <header className="toolbar">
      <div className="brand">Trame</div>
      <button onClick={newProject} title="Nouveau (⌘N)">Nouveau</button>
      <button onClick={openProject} title="Ouvrir (⌘O)">Ouvrir</button>
      <ImportMenu />
      <span className="sep" />
      <button onClick={() => saveProject()} title="Enregistrer (⌘S)">Enregistrer{dirty ? ' •' : ''}</button>
      <button onClick={() => saveProject(true)} title="Enregistrer sous (⇧⌘S)">Enregistrer sous…</button>
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title="Annuler (⌘Z)">↩︎</button>
      <button disabled={!canRedo} onClick={redo} title="Rétablir (⇧⌘Z)">↪︎</button>
      <button onClick={() => useFind.getState().show()} title="Rechercher et remplacer dans les textes (⌘F)" aria-label="Rechercher et remplacer">🔍︎</button>
      <span className="sep" />
      <button onClick={() => addElement({ type: 'text' }, { edit: true })}>Texte</button>
      <button onClick={() => addElement({ type: 'rect' })}>Rectangle</button>
      <button onClick={() => addElement({ type: 'ellipse' })}>Ellipse</button>
      <button onClick={addImage}>Image</button>
      <span className="spacer" />
      <DocName />
      <button onClick={() => usePresentation.getState().start()} title="Présenter en plein écran depuis la page courante (F5)">▶ Présenter</button>
      <ExportMenu />
    </header>
  )
}
