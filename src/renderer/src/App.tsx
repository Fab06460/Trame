import { useEffect } from 'react'
import { Canvas } from '@/components/Canvas'
import { Toolbar } from '@/components/Toolbar'
import { PageStrip } from '@/components/PageStrip'
import { Sidebar } from '@/components/Sidebar'
import { Properties } from '@/components/Properties'
import { useEditor } from '@/store/editor'

export default function App(): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
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
