import { lineEndPoints } from '@/openPath'
import { WIDTH_LIMITS } from '@/drawTools'
import { useEditor } from '@/store/editor'
import { useBrand } from '@/store/brand'
import { useT } from '@/i18n'
import { KitSwatches } from './KitSwatches'
import { NumberField } from './NumberField'
import type { LineEnd, TrameElement } from '@/types'

const ENDS: Array<LineEnd | 'none'> = ['none', 'arrow', 'dot']

/**
 * Réglages d'un tracé ouvert (trait à main levée, surligneur, ligne, flèche) : sa couleur, son épaisseur, les tirets et, pour une
 * ligne droite, ce qui termine chaque bout. Il n'a pas de remplissage : la couleur est celle du trait.
 */
export function LinePanel({ el }: { el: TrameElement }): React.JSX.Element {
  const t = useT()
  const { updateElement, beginChange } = useEditor.getState()
  const color = el.stroke ?? el.fill
  const set = (c: string): void => updateElement(el.id, { stroke: c, fill: c })
  const straight = !!lineEndPoints(el.path)
  const setEnd = (side: 'start' | 'end', v: LineEnd | 'none'): void => {
    const next = { ...el.ends, [side]: v === 'none' ? undefined : v }
    updateElement(el.id, { ends: next.start || next.end ? { ...(next.start ? { start: next.start } : {}), ...(next.end ? { end: next.end } : {}) } : undefined })
  }
  return (
    <div data-line-panel>
      <label>
        {t('draw.color')}
        <input type="color" data-field="lineColor" value={color} onPointerDown={beginChange} onChange={(e) => updateElement(el.id, { stroke: e.target.value, fill: e.target.value }, false)} onBlur={(e) => useBrand.getState().noteColor(e.target.value)} />
      </label>
      <KitSwatches current={color} onPick={set} />
      <div className="stroke-row">
        <NumberField label={t('draw.width')} field="lineWidth" value={el.strokeWidth ?? 4} min={WIDTH_LIMITS.min} max={WIDTH_LIMITS.max} step={1} suffix="px" onCommit={(v) => updateElement(el.id, { strokeWidth: Math.max(WIDTH_LIMITS.min, v) })} />
        <button data-flag="strokeDashed" aria-pressed={!!el.strokeDashed} className={el.strokeDashed ? 'active' : ''} title={t('prop.stroke.dashed')} onClick={() => updateElement(el.id, { strokeDashed: el.strokeDashed ? undefined : true })}>
          ┅
        </button>
      </div>
      {straight &&
        (['start', 'end'] as const).map((side) => (
          <label key={side}>
            {t(side === 'start' ? 'draw.ends.start' : 'draw.ends.end')}
            <select data-field={side === 'start' ? 'lineEndStart' : 'lineEndEnd'} value={el.ends?.[side] ?? 'none'} onChange={(e) => setEnd(side, e.target.value as LineEnd | 'none')}>
              {ENDS.map((o) => (
                <option key={o} value={o}>
                  {t(`draw.end.${o}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
    </div>
  )
}
