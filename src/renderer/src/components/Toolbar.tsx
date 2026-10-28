import { useLayoutEffect, useRef, useState } from 'react'
import { useLayout } from '@/store/layout'
import { fitStep, type FitState } from '@/toolbarFit'
import { DropMenu } from './DropMenu'
import { importPptxFile } from '@/pptxImport/actions'
import { startPdfImport } from '@/pdfImport/actions'
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
  const name = useEditor((s) => s.doc.name)

  const addImage = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src) await insertImage(src)
  }

  // Une seule ligne : quand la place manque, des boutons se replient dans des menus (voir toolbarFit.ts)
  const bar = useRef<HTMLElement>(null)
  const fit = useRef<FitState>({ tier: 0, natural: [] })
  const [tier, setTier] = useState(0)
  const measure = (): void => {
    const el = bar.current
    if (!el) return
    const next = fitStep(fit.current, el.clientWidth, el.scrollWidth)
    if (next !== fit.current) {
      fit.current = next
      setTier(next.tier)
    }
  }
  // à chaque rendu (le nom, le point « modifié »… changent la largeur) et à chaque changement de taille de la fenêtre
  useLayoutEffect(measure)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const save = <button onClick={() => saveProject()} title="Enregistrer (⌘S)">Enregistrer{dirty ? ' •' : ''}</button>

  return (
    <header className="toolbar" ref={bar} data-tier={tier} data-doc={name}>
      {tier < 4 && <div className="brand">Trame</div>}
      <PanelToggle side="left" />
      {tier < 2 ? (
        <>
          <button onClick={newProject} title="Nouveau (⌘N)">Nouveau</button>
          <button onClick={openProject} title="Ouvrir (⌘O)">Ouvrir</button>
          <ImportMenu />
          <span className="sep" />
          {save}
          <button onClick={() => saveProject(true)} title="Enregistrer sous (⇧⌘S)">Enregistrer sous…</button>
        </>
      ) : (
        <>
          <DropMenu
            name="file"
            label="Fichier"
            title="Nouveau, Ouvrir, Importer, Enregistrer sous"
            items={[
              { key: 'new', label: 'Nouveau', hint: '⌘N', onSelect: newProject },
              { key: 'open', label: 'Ouvrir…', hint: '⌘O', onSelect: openProject },
              { key: 'import-pdf', label: 'Importer un PDF…', onSelect: startPdfImport },
              { key: 'import-pptx', label: 'Importer un PowerPoint…', onSelect: importPptxFile },
              { key: 'save-as', label: 'Enregistrer sous…', hint: '⇧⌘S', onSelect: () => saveProject(true) }
            ]}
          />
          {save}
        </>
      )}
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title="Annuler (⌘Z)">↩︎</button>
      <button disabled={!canRedo} onClick={redo} title="Rétablir (⇧⌘Z)">↪︎</button>
      <button onClick={() => useFind.getState().show()} title="Rechercher et remplacer dans les textes (⌘F)" aria-label="Rechercher et remplacer">🔍︎</button>
      <span className="sep" />
      {tier < 1 ? (
        <>
          <button onClick={() => addElement({ type: 'text' }, { edit: true })}>Texte</button>
          <button onClick={() => addElement({ type: 'rect' })}>Rectangle</button>
          <button onClick={() => addElement({ type: 'ellipse' })}>Ellipse</button>
          <button onClick={addImage}>Image</button>
        </>
      ) : (
        <DropMenu
          name="add"
          label="Ajouter"
          title="Ajouter un texte, une forme ou une image"
          items={[
            { key: 'text', label: 'Texte', onSelect: () => addElement({ type: 'text' }, { edit: true }) },
            { key: 'rect', label: 'Rectangle', onSelect: () => addElement({ type: 'rect' }) },
            { key: 'ellipse', label: 'Ellipse', onSelect: () => addElement({ type: 'ellipse' }) },
            { key: 'image', label: 'Image…', onSelect: addImage }
          ]}
        />
      )}
      <span className="spacer" />
      {tier < 3 && <DocName />}
      <button onClick={() => usePresentation.getState().start()} title="Présenter en plein écran depuis la page courante (F5)" aria-label="Présenter">{tier < 4 ? '▶ Présenter' : '▶'}</button>
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
