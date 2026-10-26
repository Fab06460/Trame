import { useEffect } from 'react'
import { Canvas } from '@/components/Canvas'
import { Toolbar } from '@/components/Toolbar'
import { PageStrip } from '@/components/PageStrip'
import { Sidebar } from '@/components/Sidebar'
import { Properties } from '@/components/Properties'
import { useEditor } from '@/store/editor'
import { useView } from '@/store/view'
import { watchDocument } from '@/store/pdfIssues'
import { copySelection, cutSelection, paste } from '@/clipboardActions'
import { confirmUnsaved, newProject, openFile, openProject, saveProject } from '@/fileActions'

export default function App(): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      const k = e.key.toLowerCase()
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

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <Sidebar />
        <div className="center">
          <Canvas />
          <PageStrip />
        </div>
        <Properties />
      </main>
    </div>
  )
}
