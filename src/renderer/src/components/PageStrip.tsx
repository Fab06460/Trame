import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { PageThumb } from './PageThumb'
import { Splitter } from './Splitter'
import { useLayout } from '@/store/layout'
import { stripHeight, thumbBox } from '@/layout'

export function PageStrip(): React.JSX.Element {
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.pageId)
  const { setPage, addPage, duplicatePage, removePage, movePage } = useEditor.getState()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const open = useLayout((s) => s.stripOpen)
  const height = useLayout((s) => stripHeight(s.stripHeight, s.windowHeight))
  const box = thumbBox(height)

  return (
    <>
      <div className="strip-bar">
        {open && <Splitter kind="strip" />}
        <button
          className="strip-toggle"
          data-strip-toggle
          aria-expanded={open}
          onClick={() => useLayout.getState().toggleStrip()}
          title={`${open ? 'Masquer' : 'Afficher'} la liste des pages (⌘⌥3)`}
        >
          {open ? '▾' : '▴'} Pages ({doc.pages.length})
        </button>
      </div>
      {open && (
    <footer className="page-strip" style={{ height }}>
      {doc.pages.map((p, i) => (
        <div
          key={p.id}
          className={`page-item${p.id === pageId ? ' current' : ''}${overIdx === i && dragId !== p.id ? ' drop' : ''}`}
          draggable
          onDragStart={() => setDragId(p.id)}
          onDragOver={(e) => {
            e.preventDefault()
            setOverIdx(i)
          }}
          onDrop={() => {
            if (dragId) movePage(dragId, i)
            setDragId(null)
            setOverIdx(null)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverIdx(null)
          }}
          onClick={() => setPage(p.id)}
        >
          <PageThumb page={p} width={doc.width} height={doc.height} maxW={box.maxW} maxH={box.maxH} />
          <div className="page-meta">
            <span>{i + 1}</span>
            <span className="page-actions">
              <button title="Dupliquer la page" onClick={(e) => { e.stopPropagation(); duplicatePage(p.id) }}>⧉</button>
              <button
                title="Supprimer la page"
                disabled={doc.pages.length <= 1}
                onClick={(e) => { e.stopPropagation(); removePage(p.id) }}
              >
                ✕
              </button>
            </span>
          </div>
        </div>
      ))}
      <button className="add-page" onClick={addPage} title="Ajouter une page">＋</button>
    </footer>
      )}
    </>
  )
}
