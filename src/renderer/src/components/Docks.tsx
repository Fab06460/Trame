import { useEffect, useRef } from 'react'
import { overlayWidth, type Side } from '@/layout'
import { useLayout } from '@/store/layout'

/** Dernière position connue de la souris : sert à savoir si elle est encore sur un panneau ouvert par le survol. */
const pointer = { x: -1, y: -1 }
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => ((pointer.x = e.clientX), (pointer.y = e.clientY)), true)

/** Délai de survol du bord avant d'ouvrir, et d'éloignement avant de refermer (millisecondes). */
export const PEEK_OPEN_MS = 150
export const PEEK_CLOSE_MS = 450

/**
 * Bande fine au bord de la fenêtre, qui n'existe que si le panneau n'est pas affiché : la survoler quelques instants le fait
 * apparaître en recouvrement (il disparaît quand la souris s'éloigne). Ignorée pendant un glisser (bouton enfoncé).
 */
export function EdgeZone({ side }: { side: Side }): React.JSX.Element {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  return (
    <div
      className={`edge-zone edge-${side}`}
      data-edge={side}
      aria-hidden
      onPointerEnter={(e) => {
        if (e.buttons !== 0) return
        stop()
        timer.current = setTimeout(() => useLayout.getState().peekOpen(side), PEEK_OPEN_MS)
      }}
      onPointerLeave={stop}
    />
  )
}

/**
 * Conteneur d'un panneau latéral : ancré, ou en recouvrement (survol du bord, bouton, fenêtre étroite). Un recouvrement ouvert
 * par le survol se referme quand la souris le quitte, sauf si un champ du panneau a le focus ou si un bouton de souris est enfoncé.
 */
export function Dock({ side, docked, width, children }: { side: Side; docked: boolean; width: number; children: React.ReactNode }): React.JSX.Element {
  const windowWidth = useLayout((s) => s.windowWidth)
  const peeking = useLayout((s) => s.peek && s.overlay === side)
  const root = useRef<HTMLDivElement>(null)
  const state = useRef({ focus: false, down: false })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!peeking) return
    const clear = (): void => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    const check = (): void => {
      const r = root.current?.getBoundingClientRect()
      const inside = !!r && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
      if (inside || state.current.focus || state.current.down) clear()
      else if (!timer.current) timer.current = setTimeout(() => ((timer.current = null), recheck()), PEEK_CLOSE_MS)
    }
    const recheck = (): void => {
      const r = root.current?.getBoundingClientRect()
      const inside = !!r && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom
      if (!inside && !state.current.focus && !state.current.down) useLayout.getState().closeOverlay()
    }
    const onDown = (): void => {
      state.current.down = true
    }
    const onUp = (): void => {
      state.current.down = false
      check()
    }
    window.addEventListener('pointermove', check, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    check()
    return () => {
      clear()
      state.current = { focus: false, down: false }
      window.removeEventListener('pointermove', check, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [peeking])

  return (
    <div
      ref={root}
      className={`dock dock-${side}${docked ? '' : ' overlay'}${peeking ? ' peek' : ''}`}
      data-dock={side}
      style={{ width: docked ? width : overlayWidth(width, windowWidth) }}
      onFocus={() => (state.current.focus = true)}
      onBlur={(e) => {
        state.current.focus = !!root.current?.contains(e.relatedTarget as Node | null)
      }}
    >
      {children}
    </div>
  )
}
