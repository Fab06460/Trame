import { useEffect, useRef, useState } from 'react'
import { PageThumb } from '@/components/PageThumb'
import { useT } from '@/i18n'
import type { TrameDocument } from '@/types'

/**
 * Vue d'ensemble des pages pendant la présentation : une grille de miniatures où l'on saute à la page voulue (clic, flèches puis
 * Entrée). Elle lit le clavier elle-même ; la présentation s'efface derrière le temps qu'elle est ouverte.
 */
export function PresentationOverview({ doc, current, onPick, onClose }: { doc: TrameDocument; current: number; onPick: (index: number) => void; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const [cursor, setCursor] = useState(current)
  const grid = useRef<HTMLDivElement>(null)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  useEffect(() => {
    const last = doc.pages.length - 1
    const move = (to: number): void => setCursor(Math.max(0, Math.min(last, to)))
    const onKey = (e: KeyboardEvent): void => {
      const cols = Math.max(1, (grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').length : 1) || 1)
      const c = cursorRef.current
      const k = e.key
      if (k === 'Escape' || k.toLowerCase() === 'g') onClose()
      else if (k === 'ArrowRight') move(c + 1)
      else if (k === 'ArrowLeft') move(c - 1)
      else if (k === 'ArrowDown') move(c + cols)
      else if (k === 'ArrowUp') move(c - cols)
      else if (k === 'Home') move(0)
      else if (k === 'End') move(last)
      else if (k === 'Enter' || k === ' ') onPick(c)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [doc.pages.length, onClose, onPick])

  // la miniature sélectionnée reste visible quand la grille défile
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-pres-overview-item="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <div className="presentation-overview" data-pres="overview-panel" role="dialog" aria-label={t('pres.overview')} onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="overview-grid" ref={grid}>
        {doc.pages.map((p, i) => (
          <button
            key={p.id}
            className={`overview-item${i === cursor ? ' cursor' : ''}${i === current ? ' current' : ''}`}
            data-pres-overview-item={i}
            aria-current={i === current ? 'page' : undefined}
            aria-label={t('pres.page', { page: i + 1 })}
            onClick={(e) => {
              e.stopPropagation()
              onPick(i)
            }}
            onMouseEnter={() => setCursor(i)}
          >
            <PageThumb page={p} width={doc.width} height={doc.height} maxW={240} maxH={150} />
            <span className="overview-number">{i + 1}</span>
          </button>
        ))}
      </div>
      <p className="overview-hint">{t('pres.overview.hint')}</p>
    </div>
  )
}
