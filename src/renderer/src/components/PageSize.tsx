import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { SIZE_LIMITS } from '@/magicResize'
import { NumberField } from './NumberField'

export const PRESETS: Array<[string, number, number]> = [
  ['Post Instagram', 1080, 1080],
  ['Story', 1080, 1920],
  ['Présentation 16:9', 1920, 1080],
  ['Miniature YouTube', 1280, 720],
  ['Facebook / LinkedIn', 1200, 630],
  ['A4 (96 dpi)', 794, 1123]
]

/** Format de la page : préréglages ou dimensions libres. « Adapter le contenu » = Magic Resize (mise à l'échelle et recomposition). */
export function PageSize(): React.JSX.Element {
  const width = useEditor((s) => s.doc.width)
  const height = useEditor((s) => s.doc.height)
  const [adapt, setAdapt] = useState(true)
  const { resizeDocument } = useEditor.getState()
  const custom = !PRESETS.some(([, w, h]) => w === width && h === height)
  return (
    <>
      <label>
        Format
        <select
          value={`${width}x${height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number)
            resizeDocument(w, h, adapt)
          }}
        >
          {PRESETS.map(([n, w, h]) => (
            <option key={n} value={`${w}x${h}`}>{n} — {w}×{h}</option>
          ))}
          {custom && <option value={`${width}x${height}`}>Personnalisé — {width}×{height}</option>}
        </select>
      </label>
      <div className="num-grid">
        <NumberField label="Largeur" field="pageWidth" value={width} min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} suffix="px" onCommit={(v) => resizeDocument(Math.round(v), height, adapt)} />
        <NumberField label="Hauteur" field="pageHeight" value={height} min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} suffix="px" onCommit={(v) => resizeDocument(width, Math.round(v), adapt)} />
      </div>
      <label className="check" title="Reporte tous les éléments de toutes les pages dans le nouveau format (Magic Resize). Décoché : seule la taille de la page change.">
        <input type="checkbox" data-field="adaptContent" checked={adapt} onChange={(e) => setAdapt(e.target.checked)} />
        Adapter le contenu (Magic Resize)
      </label>
    </>
  )
}
