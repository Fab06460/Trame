import { useRef } from 'react'
import { dragSize, LIMITS, type Side } from '@/layout'
import { useLayout } from '@/store/layout'
import { useT } from '@/i18n'

/**
 * Poignée de redimensionnement entre deux zones : se glisse à la souris (ou au clavier avec les flèches), un double-clic
 * rétablit la taille par défaut.
 */
export function Splitter({ kind }: { kind: Side | 'strip' }): React.JSX.Element {
  const start = useRef<{ pos: number; size: number } | null>(null)
  const vertical = kind === 'strip' // poignée horizontale qui change une hauteur
  const size = useLayout((s) => (kind === 'left' ? s.leftWidth : kind === 'right' ? s.rightWidth : s.stripHeight))
  const t = useT()
  const label = t(`splitter.${kind}`)

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
      title={t('splitter.title', { label })}
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
