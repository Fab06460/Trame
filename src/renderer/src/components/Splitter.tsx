import { useRef } from 'react'
import { dragSize, LIMITS, type Side } from '@/layout'
import { useLayout } from '@/store/layout'

/**
 * Poignée de redimensionnement entre deux zones : se glisse à la souris (ou au clavier avec les flèches), un double-clic
 * rétablit la taille par défaut.
 */
export function Splitter({ kind }: { kind: Side | 'strip' }): React.JSX.Element {
  const start = useRef<{ pos: number; size: number } | null>(null)
  const vertical = kind === 'strip' // poignée horizontale qui change une hauteur
  const size = useLayout((s) => (kind === 'left' ? s.leftWidth : kind === 'right' ? s.rightWidth : s.stripHeight))
  const label = kind === 'left' ? 'Largeur du panneau de gauche' : kind === 'right' ? 'Largeur du panneau de droite' : 'Hauteur de la liste des pages'

  const set = (v: number): void => useLayout.getState().setSize(kind, v)
  return (
    <div
      className={`splitter ${vertical ? 'splitter-h' : 'splitter-v'}`}
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={LIMITS[kind].min}
      aria-valuemax={LIMITS[kind].max}
      tabIndex={0}
      data-splitter={kind}
      title={`${label} — glisser, double-clic pour rétablir`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { pos: vertical ? e.clientY : e.clientX, size }
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        set(dragSize(kind, start.current.size, (vertical ? e.clientY : e.clientX) - start.current.pos))
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => set(LIMITS[kind].def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16
        const dir = vertical ? { ArrowUp: -1, ArrowDown: 1 }[e.key] : { ArrowLeft: -1, ArrowRight: 1 }[e.key]
        if (!dir) return
        e.preventDefault()
        set(dragSize(kind, size, dir * step))
      }}
    />
  )
}
