import { useEffect, useRef, useState } from 'react'
import { DRAW_TOOLS, WIDTH_LIMITS, isLineTool, type DrawTool } from '@/drawTools'
import { useDraw, type BarPlace } from '@/store/draw'
import { usePenDraft } from '@/store/pen'
import { useT } from '@/i18n'
import type { LineEnd } from '@/types'

/** À moins de cette distance d'un bord gauche ou droit (et plus près de lui que du haut ou du bas), la barre se met en colonne. */
const SIDE = 170

/** La barre est-elle en colonne pour ce point (dans la zone w × h) : près d'un côté, sinon à plat. */
export function isVertical(x: number, y: number, w: number, h: number): boolean {
  const side = Math.min(x, w - x)
  return side < SIDE && side < Math.min(y, h - y)
}

const ENDS: Array<LineEnd | 'none'> = ['none', 'arrow', 'dot']

/**
 * La barre de l'outil de dessin, au-dessus de la page : le choix de l'outil, sa couleur, son épaisseur et, pour une ligne, ses
 * extrémités. Visible tant qu'un outil est actif ; Échap ou le bouton « Terminer » rend la main à la sélection.
 */
export function DrawBar(): React.JSX.Element | null {
  const t = useT()
  const tool = useDraw((d) => d.tool)
  const settings = useDraw((d) => d.settings)
  const saved = useDraw((d) => d.bar)
  const root = useRef<HTMLDivElement>(null)
  /** position pendant un déplacement (enregistrée au lâcher) */
  const [moving, setMoving] = useState<BarPlace | null>(null)
  const grab = useRef<{ dx: number; dy: number } | null>(null)
  const pos = moving ?? saved
  const vertical = !!pos?.v

  /** Ramène une position dans la zone de la page : la barre ne sort jamais complètement de l'écran. */
  const clamp = (x: number, y: number, v?: true): BarPlace => {
    const bar = root.current
    const area = bar?.offsetParent?.getBoundingClientRect()
    if (!bar || !area) return v ? { x, y, v } : { x, y }
    // la taille de la barre dépend de sa disposition : on la mesure telle qu'elle est (la colonne suit au rendu suivant)
    const px = Math.round(Math.min(Math.max(0, x), Math.max(0, area.width - bar.offsetWidth)))
    const py = Math.round(Math.min(Math.max(0, y), Math.max(0, area.height - bar.offsetHeight)))
    return v ? { x: px, y: py, v } : { x: px, y: py }
  }
  /** Position actuelle de la barre dans sa zone (la position par défaut est centrée : on la mesure). */
  const current = (): BarPlace => {
    const r = root.current?.getBoundingClientRect()
    const area = root.current?.offsetParent?.getBoundingClientRect()
    return r && area ? { x: Math.round(r.left - area.left), y: Math.round(r.top - area.top), ...(vertical ? { v: true as const } : {}) } : { x: 0, y: 0 }
  }
  const press = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const area = root.current?.offsetParent?.getBoundingClientRect()
    const at = current()
    grab.current = { dx: e.clientX - (area?.left ?? 0) - at.x, dy: e.clientY - (area?.top ?? 0) - at.y }
    setMoving(at)
  }
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!grab.current) return
    const area = root.current?.offsetParent?.getBoundingClientRect()
    const px = e.clientX - (area?.left ?? 0)
    const py = e.clientY - (area?.top ?? 0)
    const v = area ? isVertical(px, py, area.width, area.height) : false
    if (v !== !!moving?.v) grab.current = { dx: 16, dy: 14 } // la disposition change : la poignée revient sous le pointeur
    setMoving(clamp(px - grab.current.dx, py - grab.current.dy, v ? true : undefined))
  }
  const release = (): void => {
    if (grab.current && moving) useDraw.getState().setBar(moving)
    grab.current = null
    setMoving(null)
  }
  const nudge = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 40 : 10
    const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null
    if (!d) return
    e.preventDefault()
    const at = current()
    const area = root.current?.offsetParent?.getBoundingClientRect()
    const x = at.x + d[0]
    const y = at.y + d[1]
    const v = area && root.current ? isVertical(x + root.current.offsetWidth / 2, y + root.current.offsetHeight / 2, area.width, area.height) : false
    useDraw.getState().setBar(clamp(x, y, v ? true : undefined))
  }
  useEffect(() => {
    if (!tool) return
    const onKey = (e: KeyboardEvent): void => {
      const draft = usePenDraft.getState()
      if (e.key === 'Enter' && tool === 'pen' && draft.nodes.length) {
        // Entrée termine le tracé de la plume (sauf dans un champ de saisie)
        if ((e.target as HTMLElement | null)?.closest('input, select, textarea')) return
        e.preventDefault()
        e.stopPropagation()
        draft.finish()
        return
      }
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // un tracé de plume en cours : Échap l'abandonne ; un second Échap quitte l'outil
      if (draft.nodes.length) draft.cancel()
      else useDraw.getState().setTool(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tool])
  // changer d'outil (ou le quitter) pose le tracé de la plume qui était en cours
  useEffect(() => {
    if (tool !== 'pen') usePenDraft.getState().finish()
  }, [tool])
  if (!tool) return null
  const cfg = settings[tool]
  const { setTool, setColor, setWidth, setEnds, setFill } = useDraw.getState()
  return (
    <div ref={root} className={`draw-bar${pos ? ' placed' : ''}${vertical ? ' vertical' : ''}`} style={pos ? { left: pos.x, top: pos.y } : undefined} role="toolbar" aria-label={t('draw.bar')} data-draw-bar>
      <div
        className="draw-grip"
        data-draw-grip
        role="button"
        tabIndex={0}
        title={t('draw.move.title')}
        aria-label={t('draw.move')}
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onDoubleClick={() => useDraw.getState().setBar(null)}
        onKeyDown={nudge}
      >
        ⠿
      </div>
      <div className="seg" role="group" aria-label={t('draw.tool')}>
        {DRAW_TOOLS.map((id: DrawTool) => (
          <button key={id} data-draw-tool={id} title={id === 'pen' ? t('draw.pen.hint') : undefined} aria-pressed={tool === id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)}>
            {t(`draw.tool.${id}`)}
          </button>
        ))}
      </div>
      <input type="color" data-field="drawColor" title={t('draw.color')} aria-label={t('draw.color')} value={cfg.color} onChange={(e) => setColor(tool, e.target.value)} />
      <label className="draw-width">
        <span>{t('draw.width')}</span>
        <input type="range" data-field="drawWidth" min={WIDTH_LIMITS.min} max={WIDTH_LIMITS.max} value={cfg.width} onChange={(e) => setWidth(tool, Number(e.target.value))} />
        <output>{cfg.width} px</output>
      </label>
      {tool === 'pen' && (
        <label title={t('draw.pen.hint')}>
          <input type="checkbox" data-field="drawFill" checked={!!cfg.fill} onChange={(e) => setFill(tool, e.target.checked)} />
          <span>{t('draw.fill')}</span>
        </label>
      )}
      {isLineTool(tool) &&
        (['start', 'end'] as const).map((side) => (
          <label key={side}>
            <span>{t(side === 'start' ? 'draw.ends.start' : 'draw.ends.end')}</span>
            <select
              data-field={side === 'start' ? 'drawEndStart' : 'drawEndEnd'}
              value={cfg.ends?.[side] ?? 'none'}
              onChange={(e) => {
                const v = e.target.value as LineEnd | 'none'
                const next = { ...cfg.ends, [side]: v === 'none' ? undefined : v }
                setEnds(tool, next.start || next.end ? next : undefined)
              }}
            >
              {ENDS.map((o) => (
                <option key={o} value={o}>
                  {t(`draw.end.${o}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      <button data-action="draw-done" onClick={() => setTool(null)}>
        {t('draw.done')}
      </button>
    </div>
  )
}
