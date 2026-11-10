import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MessageKey } from '@shared/i18n'
import { useT } from '@/i18n'
import { markTourSeen, tourSeen, useTour } from '@/store/tour'

type Step = { selector: string | null; title: MessageKey; text: MessageKey }

/** Étapes de la visite : sans cible visible (panneau masqué, fenêtre étroite), la bulle s'affiche au milieu de l'écran. */
const STEPS: Step[] = [
  { selector: null, title: 'tour.welcome.title', text: 'tour.welcome.text' },
  { selector: '.side-rail', title: 'tour.left.title', text: 'tour.left.text' },
  { selector: '.canvas-wrap', title: 'tour.canvas.title', text: 'tour.canvas.text' },
  { selector: '[data-dock="right"]', title: 'tour.props.title', text: 'tour.props.text' },
  { selector: '.page-strip', title: 'tour.pages.title', text: 'tour.pages.text' },
  { selector: '[data-tour="present"]', title: 'tour.present.title', text: 'tour.present.text' },
  { selector: '[data-action="help-open"]', title: 'tour.help.title', text: 'tour.help.text' }
]

const W = 330
const MARGIN = 12
const GAP = 14

type Rect = { left: number; top: number; right: number; bottom: number }

function targetRect(selector: string | null): Rect | null {
  if (!selector) return null
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
}

/** Position de la bulle : à droite, à gauche, dessous ou dessus de la cible selon la place ; sinon au milieu de la cible (ou de l'écran). */
export function bubblePosition(r: Rect | null, h: number, vw: number, vh: number): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
  if (!r) return { left: (vw - W) / 2, top: Math.max(MARGIN, (vh - h) / 2) }
  const midY = clamp(r.top, MARGIN, vh - h - MARGIN)
  const midX = clamp(r.left, MARGIN, vw - W - MARGIN)
  if (r.right + GAP + W <= vw - MARGIN) return { left: r.right + GAP, top: midY }
  if (r.left - GAP - W >= MARGIN) return { left: r.left - GAP - W, top: midY }
  if (r.bottom + GAP + h <= vh - MARGIN) return { left: midX, top: r.bottom + GAP }
  if (r.top - GAP - h >= MARGIN) return { left: midX, top: r.top - GAP - h }
  return { left: clamp((r.left + r.right) / 2 - W / 2, MARGIN, vw - W - MARGIN), top: clamp((r.top + r.bottom) / 2 - h / 2, MARGIN, vh - h - MARGIN) }
}

function Bubble(): React.JSX.Element {
  const t = useT()
  const step = useTour((s) => s.step)
  const close = useTour.getState().close
  const [, redraw] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(190)
  const s = STEPS[Math.min(step, STEPS.length - 1)]
  const last = step >= STEPS.length - 1
  const go = (n: number): void => useTour.getState().go(Math.max(0, n))
  const next = (): void => (last ? close() : go(step + 1))

  useEffect(() => {
    const onResize = (): void => redraw((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight)
  }, [step])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key
      if (!['Escape', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(k)) return
      e.preventDefault()
      e.stopPropagation()
      if (k === 'Escape') close()
      else if (k === 'ArrowLeft') go(useTour.getState().step - 1)
      else useTour.getState().step >= STEPS.length - 1 ? close() : go(useTour.getState().step + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close])

  const r = targetRect(s.selector)
  const pos = bubblePosition(r, height, window.innerWidth, window.innerHeight)

  return (
    <div className="tour-layer" data-tour-layer data-tour-step={step}>
      {r ? <div className="tour-spot" style={{ left: r.left - 4, top: r.top - 4, width: r.right - r.left + 8, height: r.bottom - r.top + 8 }} /> : <div className="tour-dim" />}
      <div ref={ref} className="tour-bubble" role="dialog" aria-label={t(s.title)} style={{ left: pos.left, top: pos.top, width: W }}>
        <h4>{t(s.title)}</h4>
        <p>{t(s.text)}</p>
        <div className="tour-foot">
          <span className="hint">{t('tour.progress', { current: step + 1, total: STEPS.length })}</span>
          <span className="spacer" />
          {!last && <button data-action="tour-skip" onClick={close}>{t('tour.skip')}</button>}
          {step > 0 && <button data-action="tour-prev" onClick={() => go(step - 1)}>{t('tour.prev')}</button>}
          <button className="primary" data-action="tour-next" autoFocus onClick={next}>{last ? t('tour.done') : t('tour.next')}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Visite guidée : proposée une seule fois, au premier lancement (puis à la demande depuis l'aide). Elle attend qu'aucune autre fenêtre
 * ne soit ouverte (reprise après un plantage, par exemple) et ne se lance jamais pendant les tests automatiques.
 */
export function Tour(): React.JSX.Element | null {
  const open = useTour((s) => s.open)

  useEffect(() => {
    if (tourSeen()) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0
    const tick = (): void => {
      if (cancelled) return
      if (document.querySelector('.modal-backdrop, .presentation')) {
        if (tries++ < 15) timer = setTimeout(tick, 1000)
        return
      }
      markTourSeen()
      useTour.getState().start()
    }
    void window.trame
      .getSystemInfo()
      .then((info) => {
        if (!cancelled && !info.automated) timer = setTimeout(tick, 1500)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return open ? <Bubble /> : null
}
