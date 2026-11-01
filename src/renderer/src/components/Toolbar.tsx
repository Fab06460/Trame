import { useLayoutEffect, useRef, useState } from 'react'
import { shortcut, useT } from '@/i18n'
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
import { useVersions } from '@/store/versions'

export function Toolbar(): React.JSX.Element {
  const t = useT()
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

  const save = <button onClick={() => saveProject()} title={t('toolbar.save.title')}>{t('toolbar.save')}{dirty ? ' •' : ''}</button>

  return (
    <header className="toolbar" ref={bar} data-tier={tier} data-doc={name}>
      {tier < 4 && <div className="brand">Trame</div>}
      <PanelToggle side="left" />
      {tier < 2 ? (
        <>
          <button onClick={newProject} title={t('toolbar.new.title')}>{t('toolbar.new')}</button>
          <button onClick={openProject} title={t('toolbar.open.title')}>{t('toolbar.open')}</button>
          <ImportMenu />
          <span className="sep" />
          {save}
          <button onClick={() => saveProject(true)} title={t('toolbar.saveAs.title')}>{t('toolbar.saveAs')}</button>
        </>
      ) : (
        <>
          <DropMenu
            name="file"
            label={t('toolbar.file')}
            title={t('toolbar.file.title')}
            items={[
              { key: 'new', label: t('toolbar.new'), hint: shortcut('⌘N'), onSelect: newProject },
              { key: 'open', label: t('toolbar.open.dots'), hint: shortcut('⌘O'), onSelect: openProject },
              { key: 'import-pdf', label: t('toolbar.importPdf'), onSelect: startPdfImport },
              { key: 'import-pptx', label: t('toolbar.importPptx'), onSelect: importPptxFile },
              { key: 'save-as', label: t('toolbar.saveAs'), hint: shortcut('⇧⌘S'), onSelect: () => saveProject(true) },
              { key: 'versions', label: t('versions.menu'), onSelect: () => useVersions.getState().setOpen(true) }
            ]}
          />
          {save}
        </>
      )}
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title={t('toolbar.undo.title')}>↩︎</button>
      <button disabled={!canRedo} onClick={redo} title={t('toolbar.redo.title')}>↪︎</button>
      <button data-action="versions-open" onClick={() => useVersions.getState().setOpen(true)} title={t('versions.menu.title')} aria-label={t('versions.title')}>🕘︎</button>
      <button onClick={() => useFind.getState().show()} title={t('toolbar.find.title')} aria-label={t('toolbar.find.label')}>🔍︎</button>
      <span className="sep" />
      {tier < 1 ? (
        <>
          <button onClick={() => addElement({ type: 'text' }, { edit: true })}>{t('toolbar.text')}</button>
          <button onClick={() => addElement({ type: 'rect' })}>{t('toolbar.rect')}</button>
          <button onClick={() => addElement({ type: 'ellipse' })}>{t('toolbar.ellipse')}</button>
          <button onClick={addImage}>{t('toolbar.image')}</button>
        </>
      ) : (
        <DropMenu
          name="add"
          label={t('toolbar.add')}
          title={t('toolbar.add.title')}
          items={[
            { key: 'text', label: t('toolbar.text'), onSelect: () => addElement({ type: 'text' }, { edit: true }) },
            { key: 'rect', label: t('toolbar.rect'), onSelect: () => addElement({ type: 'rect' }) },
            { key: 'ellipse', label: t('toolbar.ellipse'), onSelect: () => addElement({ type: 'ellipse' }) },
            { key: 'image', label: t('toolbar.image.dots'), onSelect: addImage }
          ]}
        />
      )}
      <span className="spacer" />
      {tier < 3 && <DocName />}
      <button onClick={() => usePresentation.getState().start()} title={t('toolbar.present.title')} aria-label={t('toolbar.present')}>{tier < 4 ? `▶ ${t('toolbar.present')}` : '▶'}</button>
      <ExportMenu />
      <PanelToggle side="right" />
    </header>
  )
}

/** Bouton qui masque / affiche un panneau latéral (en fenêtre étroite : l'ouvre en recouvrement). */
function PanelToggle({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  const t = useT()
  const compact = useLayout((s) => s.compact)
  const visible = useLayout((s) => (compact ? s.overlay === side : side === 'left' ? s.leftOpen : s.rightOpen))
  const label = t(`toolbar.${side}Panel.${visible ? 'hide' : 'show'}`)
  return (
    <button
      className="panel-toggle"
      data-panel-toggle={side}
      aria-pressed={visible}
      aria-label={label}
      title={`${label} (${shortcut(`⌘⌥${side === 'left' ? 1 : 2}`)})`}
      onClick={() => useLayout.getState().toggle(side)}
    >
      {side === 'left' ? '◧' : '◨'}
    </button>
  )
}
