import { useEffect, useState } from 'react'
import { boundsOf, unionBox } from '@/geometry'
import { isEnforced, positionLocked } from '@/protection'
import { selectPage, useEditor } from '@/store/editor'
import { NumberField } from './NumberField'
import { useT } from '@/i18n'

/**
 * Position, taille et rotation numériques de la sélection, comme dans Canva.
 * X / Y sont ceux de la **boîte englobante visible** (rotation comprise), donc cohérents avec l'alignement et l'aimantation ;
 * largeur / hauteur / rotation sont celles de l'élément lui-même. Une sélection multiple se déplace d'un bloc (X, Y seulement).
 */
export function PositionPanel(): React.JSX.Element | null {
  const t = useT()
  // Zustand 5 exige des sélecteurs à résultat stable : on lit les valeurs brutes, le filtrage se fait au rendu
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const els = page.elements.filter((e) => selectedIds.includes(e.id))
  const { nudgeSelected, updateElement } = useEditor.getState()
  const single = els.length === 1 ? els[0] : null
  const [lock, setLock] = useState(false)

  // les images gardent leurs proportions par défaut
  useEffect(() => setLock(single?.type === 'image'), [single?.id, single?.type])

  if (!els.length) return null
  const box = unionBox(els.map(boundsOf))
  const isText = single?.type === 'text'
  const byTemplate = els.some((e) => !e.locked && enforced && e.protect)
  const locked = els.some((e) => positionLocked(e, enforced))
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
      <h3>{t('pos.title')}</h3>
      <div className="num-grid">
        <NumberField label="X" field="x" value={box.x} suffix="px" disabled={locked} onCommit={(v) => nudgeSelected(v - box.x, 0)} />
        <NumberField label="Y" field="y" value={box.y} suffix="px" disabled={locked} onCommit={(v) => nudgeSelected(0, v - box.y)} />
        <NumberField label={t('pos.w')} field="width" value={single ? single.width : box.width} min={1} suffix="px" disabled={!single || locked} onCommit={setWidth} />
        <NumberField label={t('pos.h')} field="height" value={single ? single.height : box.height} min={1} suffix="px" disabled={!single || isText || locked} onCommit={setHeight} />
        <NumberField label={t('pos.rotation')} field="rotation" value={single ? single.rotation : 0} step={1} suffix="°" disabled={!single || locked} onCommit={(v) => single && updateElement(single.id, { rotation: v })} />
        <button
          className={`lock${lock ? ' active' : ''}`}
          title={lock ? t('pos.ratio.locked') : t('pos.ratio.lock')}
          disabled={!single || isText}
          onClick={() => setLock(!lock)}
        >
          {lock ? '🔒' : '🔓'}
        </button>
      </div>
      {locked && <p className="hint">{byTemplate ? t('pos.hint.template') : t('pos.hint.locked')}</p>}
      {isText && <p className="hint">{t('pos.hint.textHeight')}</p>}
    </>
  )
}
