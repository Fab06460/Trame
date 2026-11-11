import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'

const W = 260
const MARGIN = 8
const GAP = 6

type Rect = { left: number; top: number; right: number; bottom: number }

/** Position de la bulle : sous la pastille (ou au-dessus s'il n'y a pas la place), toujours entièrement dans la fenêtre. */
export function tipPosition(r: Rect, h: number, vw: number, vh: number): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
  const left = clamp((r.left + r.right) / 2 - W / 2, MARGIN, Math.max(MARGIN, vw - W - MARGIN))
  const below = r.bottom + GAP
  const top = below + h <= vh - MARGIN || r.top - GAP - h < MARGIN ? below : r.top - GAP - h
  return { left, top: clamp(top, MARGIN, Math.max(MARGIN, vh - h - MARGIN)) }
}

/**
 * Pastille « i » qui porte une explication : la bulle s'ouvre au survol ou au focus, et reste ouverte après un clic
 * (ou Entrée / Espace) jusqu'à un nouveau clic, Échap ou un clic ailleurs. Remplace un paragraphe d'aide permanent.
 */
export function InfoTip({ children }: { children: React.ReactNode }): React.JSX.Element {
  const t = useT()
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = hover || pinned

  useEffect(() => {
    if (!open || !button.current) {
      setPos(null)
      return
    }
    const place = (): void => {
      if (!button.current) return
      const r = button.current.getBoundingClientRect()
      setPos(tipPosition(r, bubble.current?.offsetHeight ?? 80, window.innerWidth, window.innerHeight))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const away = (e: PointerEvent): void => {
      const n = e.target as Node
      if (!button.current?.contains(n) && !bubble.current?.contains(n)) setPinned(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPinned(false)
      setHover(false)
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc, true)
    }
  }, [pinned])

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-tip"
        data-info-tip
        aria-label={t('info.label')}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => setPinned((p) => !p)}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="info-tip-bubble"
            data-info-tip-bubble
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: W, visibility: pos ? 'visible' : 'hidden' }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
