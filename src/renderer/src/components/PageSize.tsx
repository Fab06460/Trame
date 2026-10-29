import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { SIZE_LIMITS } from '@/magicResize'
import { NumberField } from './NumberField'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

export const PRESETS: Array<[MessageKey, number, number]> = [
  ['page.preset.instagram', 1080, 1080],
  ['page.preset.story', 1080, 1920],
  ['page.preset.presentation', 1920, 1080],
  ['page.preset.youtube', 1280, 720],
  ['page.preset.social', 1200, 630],
  ['page.preset.a4', 794, 1123]
]

/** Format de la page : préréglages ou dimensions libres. « Adapter le contenu » = Magic Resize (mise à l'échelle et recomposition). */
export function PageSize(): React.JSX.Element {
  const t = useT()
  const width = useEditor((s) => s.doc.width)
  const height = useEditor((s) => s.doc.height)
  const [adapt, setAdapt] = useState(true)
  const { resizeDocument } = useEditor.getState()
  const custom = !PRESETS.some(([, w, h]) => w === width && h === height)
  return (
    <>
      <label>
        {t('page.format')}
        <select
          value={`${width}x${height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number)
            resizeDocument(w, h, adapt)
          }}
        >
          {PRESETS.map(([n, w, h]) => (
            <option key={n} value={`${w}x${h}`}>{t(n)} — {w}×{h}</option>
          ))}
          {custom && <option value={`${width}x${height}`}>{t('page.custom', { w: width, h: height })}</option>}
        </select>
      </label>
      <div className="num-grid">
        <NumberField label={t('page.width')} field="pageWidth" value={width} min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} suffix="px" onCommit={(v) => resizeDocument(Math.round(v), height, adapt)} />
        <NumberField label={t('page.height')} field="pageHeight" value={height} min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} suffix="px" onCommit={(v) => resizeDocument(width, Math.round(v), adapt)} />
      </div>
      <label className="check" title={t('page.adapt.title')}>
        <input type="checkbox" data-field="adaptContent" checked={adapt} onChange={(e) => setAdapt(e.target.checked)} />
        {t('page.adapt')}
      </label>
    </>
  )
}
