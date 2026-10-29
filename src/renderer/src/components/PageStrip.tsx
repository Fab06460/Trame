import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { PageThumb } from './PageThumb'
import { Splitter } from './Splitter'
import { useLayout } from '@/store/layout'
import { stripHeight, thumbBox } from '@/layout'
import { useT } from '@/i18n'

export function PageStrip(): React.JSX.Element {
  const t = useT()
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
          title={open ? t('strip.toggle.hide') : t('strip.toggle.show')}
        >
          {open ? '▾' : '▴'} {t('strip.pages', { count: doc.pages.length })}
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
              <button title={t('strip.duplicate')} onClick={(e) => { e.stopPropagation(); duplicatePage(p.id) }}>⧉</button>
              <button
                title={t('strip.delete')}
                disabled={doc.pages.length <= 1}
                onClick={(e) => { e.stopPropagation(); removePage(p.id) }}
              >
                ✕
              </button>
            </span>
          </div>
        </div>
      ))}
      <button className="add-page" onClick={addPage} title={t('strip.add')}>＋</button>
    </footer>
      )}
    </>
  )
}
