import { useEffect } from 'react'
import { Canvas } from '@/components/Canvas'
import { Toolbar } from '@/components/Toolbar'
import { PageStrip } from '@/components/PageStrip'
import { Sidebar } from '@/components/Sidebar'
import { Properties } from '@/components/Properties'
import { useEditor } from '@/store/editor'
import { useView } from '@/store/view'
import { confirmUnsaved, newProject, openProject, saveProject } from '@/fileActions'

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
      if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text')) return
      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicateSelected()
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
