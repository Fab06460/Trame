import { useEffect } from 'react'
import { Canvas } from '@/components/Canvas'
import { Toolbar } from '@/components/Toolbar'
import { NotesPanel } from '@/components/NotesPanel'
import { PageStrip } from '@/components/PageStrip'
import { Sidebar } from '@/components/Sidebar'
import { Properties } from '@/components/Properties'
import { PdfImportDialog } from '@/components/PdfImportDialog'
import { FindPanel } from '@/components/FindPanel'
import { useFind } from '@/store/find'
import { PresentationMode } from '@/components/PresentationMode'
import { usePresentation } from '@/store/presentation'
import { ExportPagesDialog } from '@/components/ExportPagesDialog'
import { FontCatalogDialog } from '@/components/FontCatalogDialog'
import { useEditor } from '@/store/editor'
import { useView } from '@/store/view'
import { useLayout } from '@/store/layout'
import { Splitter } from '@/components/Splitter'
import { overlayWidth } from '@/layout'
import { watchDocument } from '@/store/pdfIssues'
import { copySelection, cutSelection, paste } from '@/clipboardActions'
import { confirmUnsaved, newProject, openFile, openProject, saveProject } from '@/fileActions'

export default function App(): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      // ⌘⌥1 / ⌘⌥2 / ⌘⌥3 : panneau de gauche, panneau de droite, liste des pages
      if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code) && !usePresentation.getState().active) {
        e.preventDefault()
        const l = useLayout.getState()
        if (e.code === 'Digit3') l.toggleStrip()
        else l.toggle(e.code === 'Digit1' ? 'left' : 'right')
        return
      }
      const k = e.key.toLowerCase()
      // ⌘F : rechercher et remplacer dans les textes
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && k === 'f' && !usePresentation.getState().active) {
        e.preventDefault()
        useFind.getState().show()
        return
      }
      // F5 ou ⌘⇧P : présenter depuis la page courante
      if ((e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.shiftKey && k === 'p')) && !usePresentation.getState().active) {
        e.preventDefault()
        usePresentation.getState().start()
        return
      }
      // raccourcis fichier : actifs même pendant la saisie de texte
      if ((e.metaKey || e.ctrlKey) && ['s', 'o', 'n'].includes(k)) {
        e.preventDefault()
        if (k === 's') void saveProject(e.shiftKey)
        else if (k === 'o') void openProject()
        else void newProject()
        return
      }
      // Maj + R : règles ; Maj + G : repères ; Maj + A : aimantation
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && ['r', 'g', 'a'].includes(e.key.toLowerCase()) && !(['TEXTAREA', 'INPUT'].includes(t.tagName))) {
        e.preventDefault()
        useView.getState().toggleSetting({ r: 'rulers', g: 'guides', a: 'snap' }[e.key.toLowerCase() as 'r' | 'g' | 'a'] as 'rulers' | 'guides' | 'snap')
        return
      }
      // zoom (actif aussi pendant la saisie hors texte) : ⌘+ / ⌘- / ⌘0 ajuster / ⌘1 taille réelle
      if ((e.metaKey || e.ctrlKey) && ['=', '+', '-', '0', '1'].includes(e.key)) {
        e.preventDefault()
        const v = useView.getState()
        if (e.key === '-') v.zoomBy(1 / 1.25)
        else if (e.key === '0') v.fitToScreen()
        else if (e.key === '1') v.actualSize()
        else v.zoomBy(1.25)
        return
      }
      if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'number'].includes((t as HTMLInputElement).type))) return
      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicateSelected()
      } else if (mod && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        const k = e.key.toLowerCase()
        void (k === 'c' ? copySelection() : k === 'x' ? cutSelection() : paste())
      } else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        s.toggleLockSelected()
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.selectAll()
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        e.shiftKey ? s.ungroupSelected() : s.groupSelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.removeSelected()
      } else if (e.key === 'Escape') {
        s.select([])
      } else if (s.selectedIds.length && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        s.nudgeSelected(dx, dy)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Taille de la fenêtre : bascule entre panneaux ancrés et panneaux en recouvrement (voir layout.ts)
  useEffect(() => {
    const apply = (): void => useLayout.getState().setWindow(window.innerWidth, window.innerHeight)
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  // Tient le processus principal informé (garde de fermeture, indicateur macOS) et met à jour le titre
  const dirty = useEditor((s) => s.dirty)
  const filePath = useEditor((s) => s.filePath)
  const name = useEditor((s) => s.doc.name)
  useEffect(() => {
    window.trame.setState({ dirty, path: filePath })
    const file = filePath ? filePath.split(/[\\/]/).pop()!.replace(/\.trame$/, '') : name
    document.title = `${file}${dirty ? ' •' : ''} — Trame`
  }, [dirty, filePath, name])

  // Avertissements « ce texte sera exporté en image dans le PDF » : recalculés après chaque modification du document
  const doc = useEditor((s) => s.doc)
  useEffect(() => watchDocument(doc), [doc])

  // Fichiers ouverts depuis le Finder ou le Dock : en cours d'exécution, ou reçus pendant le démarrage
  useEffect(() => {
    const stop = window.trame.onOpenFile((file) => void openFile(file))
    void window.trame.rendererReady().then((file) => file && openFile(file))
    return stop
  }, [])

  // Fermeture de fenêtre avec des modifications : proposer d'enregistrer
  useEffect(
    () =>
      window.trame.onBeforeClose(async () => {
        if (await confirmUnsaved('fermer')) window.trame.confirmClose()
      }),
    []
  )

  const compact = useLayout((s) => s.compact)
  const overlay = useLayout((s) => s.overlay)
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)
  const leftWidth = useLayout((s) => s.leftWidth)
  const rightWidth = useLayout((s) => s.rightWidth)
  const windowWidth = useLayout((s) => s.windowWidth)
  // ancré : selon la préférence ; compact : seulement le panneau ouvert en recouvrement
  const showLeft = compact ? overlay === 'left' : leftOpen
  const showRight = compact ? overlay === 'right' : rightOpen

  // Échap ferme le panneau en recouvrement
  useEffect(() => {
    if (!compact || !overlay) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useLayout.getState().closeOverlay()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [compact, overlay])

  return (
    <div className="app">
      <Toolbar />
      <PdfImportDialog />
      <FontCatalogDialog />
      <ExportPagesDialog />
      <FindPanel />
      <PresentationMode />
      <main className="workspace" data-compact={compact || undefined}>
        {showLeft && (
          <>
            <div className={`dock dock-left${compact ? ' overlay' : ''}`} data-dock="left" style={{ width: compact ? overlayWidth(leftWidth, windowWidth) : leftWidth }}>
              <Sidebar />
            </div>
            {!compact && <Splitter kind="left" />}
          </>
        )}
        <div className="center">
          {compact && overlay && <div className="dock-backdrop" data-dock="backdrop" onPointerDown={() => useLayout.getState().closeOverlay()} />}
          <Canvas />
          <NotesPanel />
          <PageStrip />
        </div>
        {showRight && (
          <>
            {!compact && <Splitter kind="right" />}
            <div className={`dock dock-right${compact ? ' overlay' : ''}`} data-dock="right" style={{ width: compact ? overlayWidth(rightWidth, windowWidth) : rightWidth }}>
              <Properties />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
