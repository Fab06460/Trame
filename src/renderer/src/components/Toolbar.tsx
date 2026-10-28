import { useLayout } from '@/store/layout'
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
      <PanelToggle side="left" />
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
      <PanelToggle side="right" />
    </header>
  )
}

/** Bouton qui masque / affiche un panneau latéral (en fenêtre étroite : l'ouvre en recouvrement). */
function PanelToggle({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  const compact = useLayout((s) => s.compact)
  const visible = useLayout((s) => (compact ? s.overlay === side : side === 'left' ? s.leftOpen : s.rightOpen))
  const name = side === 'left' ? 'de gauche (modèles, photos, marque…)' : 'de droite (propriétés)'
  return (
    <button
      className="panel-toggle"
      data-panel-toggle={side}
      aria-pressed={visible}
      aria-label={`${visible ? 'Masquer' : 'Afficher'} le panneau ${name}`}
      title={`${visible ? 'Masquer' : 'Afficher'} le panneau ${name} (⌘⌥${side === 'left' ? 1 : 2})`}
      onClick={() => useLayout.getState().toggle(side)}
    >
      {side === 'left' ? '◧' : '◨'}
    </button>
  )
}
