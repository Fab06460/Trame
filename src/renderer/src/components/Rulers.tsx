import { useEffect, useRef, useState } from 'react'
import { rulerTicks } from '@/rulerMath'
import { selectPage, useEditor } from '@/store/editor'
import { useTheme } from '@/store/theme'
import { useView } from '@/store/view'
import type { Guide } from '@/types'
import { useT } from '@/i18n'

/** Épaisseur des règles, en pixels écran. */
export const RULER = 22

/** Couleurs des règles : celles du thème en cours, lues dans la feuille de style (le dessin est fait à la main dans un canvas). */
function rulerColors(): { bg: string; page: string; tick: string; text: string; cursor: string } {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  return { bg: v('--panel'), page: v('--ruler-page'), tick: v('--ruler-tick'), text: v('--ruler-text'), cursor: v('--accent') }
}

/**
 * Règles graduées (en pixels de design) et repères d'alignement.
 * - Glisser depuis la règle du haut crée un repère horizontal, depuis celle de gauche un repère vertical.
 * - Glisser un repère le déplace ; le relâcher sur une règle (ou hors du canvas) le supprime ; double-clic = supprimer.
 * Tout se calcule à partir du store de vue : la position d'un repère en pixels écran est `décalage + position × échelle`.
 */
export function Rulers(): React.JSX.Element {
  const t = useT()
  const fit = useView((v) => v.fit)
  const zoom = useView((v) => v.zoom)
  const panX = useView((v) => v.panX)
  const panY = useView((v) => v.panY)
  const viewW = useView((v) => v.viewW)
  const viewH = useView((v) => v.viewH)
  const docW = useView((v) => v.docW)
  const docH = useView((v) => v.docH)
  const settings = useView((v) => v.settings)
  const theme = useTheme((s) => s.theme)
  const guides = useEditor((s) => selectPage(s).guides)

  const scale = fit * zoom
  const offX = (viewW - docW * scale) / 2 + panX
  const offY = (viewH - docH * scale) / 2 + panY

  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [label, setLabel] = useState<{ x: number; y: number; text: string } | null>(null)

  // position du curseur (en pixels de design) pour le repère mobile des règles
  useEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent) return
    let raf = 0
    const move = (e: PointerEvent): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = parent.getBoundingClientRect()
        setPointer({ x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale })
      })
    }
    const leave = (): void => setPointer(null)
    parent.addEventListener('pointermove', move)
    parent.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(raf)
      parent.removeEventListener('pointermove', move)
      parent.removeEventListener('pointerleave', leave)
    }
  }, [offX, offY, scale])

  // dessin des règles
  useEffect(() => {
    if (!settings.rulers) return
    const dpr = window.devicePixelRatio || 1
    const COLORS = rulerColors()
    const draw = (canvas: HTMLCanvasElement | null, horizontal: boolean): void => {
      if (!canvas) return
      const length = horizontal ? viewW : viewH
      canvas.width = Math.max(1, Math.round(length * dpr))
      canvas.height = Math.round(RULER * dpr)
      const g = canvas.getContext('2d')!
      g.scale(dpr, dpr)
      g.fillStyle = COLORS.bg
      g.fillRect(0, 0, length, RULER)
      const off = horizontal ? offX : offY
      const size = (horizontal ? docW : docH) * scale
      g.fillStyle = COLORS.page // étendue de la page
      g.fillRect(Math.max(RULER, off), 0, Math.max(0, Math.min(length, off + size) - Math.max(RULER, off)), RULER)
      g.strokeStyle = COLORS.tick
      g.fillStyle = COLORS.text
      g.font = '10px -apple-system, "Helvetica Neue", Arial, sans-serif'
      g.lineWidth = 1
      for (const t of rulerTicks((RULER - off) / scale, (length - off) / scale, scale)) {
        const pos = Math.round(off + t.value * scale) + 0.5
        if (pos < RULER) continue
        // La règle de gauche est tournée de 90° par CSS : sa face collée au canvas est en haut du dessin (y = 0), pas en bas
        const base = horizontal ? RULER : 0
        const dir = horizontal ? -1 : 1
        g.beginPath()
        g.moveTo(pos, base)
        g.lineTo(pos, base + dir * (t.major ? 10 : 5))
        g.stroke()
        if (t.major) g.fillText(String(t.value), pos + 3, horizontal ? 10 : 20)
      }
      if (pointer) {
        const p = Math.round(off + (horizontal ? pointer.x : pointer.y) * scale) + 0.5
        if (p > RULER) {
          g.strokeStyle = COLORS.cursor
          g.beginPath()
          g.moveTo(p, 0)
          g.lineTo(p, RULER)
          g.stroke()
        }
      }
    }
    // la règle de gauche est dessinée à plat puis tournée par CSS : on trace donc la graduation « horizontalement »
    draw(topRef.current, true)
    draw(leftRef.current, false)
  }, [settings.rulers, viewW, viewH, offX, offY, scale, docW, docH, pointer, theme])

  /** Position de design (arrondie au pixel) sous le pointeur, selon l'orientation du repère. */
  const toDesign = (e: { clientX: number; clientY: number }, orientation: Guide['orientation']): number => {
    const r = rootRef.current!.getBoundingClientRect()
    return Math.round(orientation === 'v' ? (e.clientX - r.left - offX) / scale : (e.clientY - r.top - offY) / scale)
  }

  /** Crée (index null) ou déplace un repère, d'un seul geste annulable ; le relâcher sur une règle le supprime. */
  const startGuideDrag = (orientation: Guide['orientation'], index: number | null, start: React.PointerEvent): void => {
    start.preventDefault()
    const ed = useEditor.getState()
    ed.beginChange()
    let i = index
    if (i === null) {
      i = (selectPage(ed).guides ?? []).length
      ed.updateGuides((g) => [...g, { orientation, position: toDesign(start, orientation) }], false)
    }
    const target = i
    const outside = (e: PointerEvent): boolean => {
      const r = rootRef.current!.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom ||
        (orientation === 'h' ? e.clientY - r.top < RULER : e.clientX - r.left < RULER)
    }
    const show = (e: PointerEvent): void => {
      const r = rootRef.current!.getBoundingClientRect()
      setLabel({ x: e.clientX - r.left + 14, y: e.clientY - r.top + 14, text: `${orientation === 'v' ? 'X' : 'Y'} ${toDesign(e, orientation)} px` })
    }
    const move = (e: PointerEvent): void => {
      useEditor.getState().updateGuides((g) => g.map((x, k) => (k === target ? { ...x, position: toDesign(e, orientation) } : x)), false)
      show(e)
    }
    const end = (e: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      setLabel(null)
      if (outside(e)) useEditor.getState().updateGuides((g) => g.filter((_, k) => k !== target), false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    show(start.nativeEvent)
  }

  const list = guides ?? []
  return (
    <div ref={rootRef} className="rulers-layer">
      {settings.guides &&
        list.map((g, i) => (
          <div
            key={i}
            className={`guide ${g.orientation}`}
            data-guide={`${g.orientation}:${g.position}`}
            style={g.orientation === 'v' ? { left: offX + g.position * scale, top: settings.rulers ? RULER : 0 } : { top: offY + g.position * scale, left: settings.rulers ? RULER : 0 }}
            title={t('view.guide.remove')}
            onPointerDown={(e) => startGuideDrag(g.orientation, i, e)}
            onDoubleClick={() => useEditor.getState().updateGuides((all) => all.filter((_, k) => k !== i))}
          />
        ))}
      {settings.rulers && (
        <>
          <canvas ref={topRef} className="ruler top" style={{ width: viewW, height: RULER }} onPointerDown={(e) => startGuideDrag('h', null, e)} />
          <canvas
            ref={leftRef}
            className="ruler left"
            style={{ width: viewH, height: RULER }}
            onPointerDown={(e) => startGuideDrag('v', null, e)}
          />
          <div className="ruler-corner" style={{ width: RULER, height: RULER }} />
        </>
      )}
      {label && <div className="guide-label" style={{ left: label.x, top: label.y }}>{label.text}</div>}
    </div>
  )
}

/** Boutons d'affichage : règles, repères, aimantation. */
export function ViewOptions(): React.JSX.Element {
  const settings = useView((v) => v.settings)
  const toggle = useView((v) => v.toggleSetting)
  const t = useT()
  const items = [
    { key: 'rulers', label: t('view.rulers'), title: t('view.rulers.title') },
    { key: 'guides', label: t('view.guides'), title: t('view.guides.title') },
    { key: 'snap', label: t('view.snap'), title: t('view.snap.title') }
  ] as const
  return (
    <div className="view-options" onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button key={it.key} data-setting={it.key} aria-pressed={settings[it.key]} className={settings[it.key] ? 'active' : ''} title={it.title} onClick={() => toggle(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
