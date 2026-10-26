import { useEffect, useState } from 'react'
import { boundsOf, unionBox } from '@/geometry'
import { selectPage, useEditor } from '@/store/editor'
import { NumberField } from './NumberField'

/**
 * Position, taille et rotation numériques de la sélection, comme dans Canva.
 * X / Y sont ceux de la **boîte englobante visible** (rotation comprise), donc cohérents avec l'alignement et l'aimantation ;
 * largeur / hauteur / rotation sont celles de l'élément lui-même. Une sélection multiple se déplace d'un bloc (X, Y seulement).
 */
export function PositionPanel(): React.JSX.Element | null {
  // Zustand 5 exige des sélecteurs à résultat stable : on lit les valeurs brutes, le filtrage se fait au rendu
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const els = page.elements.filter((e) => selectedIds.includes(e.id))
  const { nudgeSelected, updateElement } = useEditor.getState()
  const single = els.length === 1 ? els[0] : null
  const [lock, setLock] = useState(false)

  // les images gardent leurs proportions par défaut
  useEffect(() => setLock(single?.type === 'image'), [single?.id, single?.type])

  if (!els.length) return null
  const box = unionBox(els.map(boundsOf))
  const isText = single?.type === 'text'
  const ratio = single && single.height > 0 ? single.width / single.height : 1

  const setWidth = (w: number): void => {
    if (!single) return
    updateElement(single.id, isText || !lock ? { width: w } : { width: w, height: w / ratio })
  }
  const setHeight = (h: number): void => {
    if (!single) return
    updateElement(single.id, lock ? { height: h, width: h * ratio } : { height: h })
  }

  return (
    <>
      <h3>Position et taille</h3>
      <div className="num-grid">
        <NumberField label="X" field="x" value={box.x} suffix="px" onCommit={(v) => nudgeSelected(v - box.x, 0)} />
        <NumberField label="Y" field="y" value={box.y} suffix="px" onCommit={(v) => nudgeSelected(0, v - box.y)} />
        <NumberField label="L" field="width" value={single ? single.width : box.width} min={1} suffix="px" disabled={!single} onCommit={setWidth} />
        <NumberField label="H" field="height" value={single ? single.height : box.height} min={1} suffix="px" disabled={!single || isText} onCommit={setHeight} />
        <NumberField label="Rotation" field="rotation" value={single ? single.rotation : 0} step={1} suffix="°" disabled={!single} onCommit={(v) => single && updateElement(single.id, { rotation: v })} />
        <button
          className={`lock${lock ? ' active' : ''}`}
          title={lock ? 'Proportions verrouillées' : 'Verrouiller les proportions'}
          disabled={!single || isText}
          onClick={() => setLock(!lock)}
        >
          {lock ? '🔒' : '🔓'}
        </button>
      </div>
      {isText && <p className="hint">La hauteur d'un texte dépend de son contenu : elle s'ajuste seule.</p>}
    </>
  )
}
