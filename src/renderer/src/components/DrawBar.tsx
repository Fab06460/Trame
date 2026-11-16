import { useEffect } from 'react'
import { DRAW_TOOLS, WIDTH_LIMITS, isLineTool, type DrawTool } from '@/drawTools'
import { useDraw } from '@/store/draw'
import { useT } from '@/i18n'
import type { LineEnd } from '@/types'

const ENDS: Array<LineEnd | 'none'> = ['none', 'arrow', 'dot']

/**
 * La barre de l'outil de dessin, au-dessus de la page : le choix de l'outil, sa couleur, son épaisseur et, pour une ligne, ses
 * extrémités. Visible tant qu'un outil est actif ; Échap ou le bouton « Terminer » rend la main à la sélection.
 */
export function DrawBar(): React.JSX.Element | null {
  const t = useT()
  const tool = useDraw((d) => d.tool)
  const settings = useDraw((d) => d.settings)
  useEffect(() => {
    if (!tool) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      useDraw.getState().setTool(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tool])
  if (!tool) return null
  const cfg = settings[tool]
  const { setTool, setColor, setWidth, setEnds } = useDraw.getState()
  return (
    <div className="draw-bar" role="toolbar" aria-label={t('draw.bar')} data-draw-bar>
      <div className="seg" role="group" aria-label={t('draw.tool')}>
        {DRAW_TOOLS.map((id: DrawTool) => (
          <button key={id} data-draw-tool={id} aria-pressed={tool === id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)}>
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
