import { elementNodes, refit, removeNode, toggleSmooth } from '@/pen'
import { useEditor } from '@/store/editor'
import { usePenEdit } from '@/store/pen'
import { useT } from '@/i18n'
import type { TrameElement } from '@/types'

/**
 * Modification d'un tracé point par point : le bouton qui ouvre ou ferme le mode (poignées sur la page), puis, pendant la modification,
 * le point choisi (angle ou courbe, suppression) et la fermeture du tracé. N'apparaît que pour un chemin que la plume sait relire
 * (segments droits et courbes de Bézier) : les formes à arcs, par exemple, restent telles quelles.
 */
export function PenPanel({ el }: { el: TrameElement }): React.JSX.Element | null {
  const t = useT()
  const editing = usePenEdit((p) => p.id === el.id)
  const sel = usePenEdit((p) => p.sel)
  const parsed = elementNodes(el)
  if (!parsed) return null
  const { nodes, closed } = parsed
  const node = editing && sel !== null ? nodes[sel] : undefined
  const apply = (next: typeof nodes, nextClosed = closed): void => useEditor.getState().updateElement(el.id, refit(el, next, nextClosed))
  const smooth = !!node && !!(node.inH || node.outH)
  return (
    <div data-pen-panel>
      <button data-action="pen-edit" aria-pressed={editing} className={editing ? 'active' : ''} disabled={!!el.locked} onClick={() => usePenEdit.getState().set(editing ? null : el.id)}>
        {t(editing ? 'pen.edit.done' : 'pen.edit')}
      </button>
      {editing && (
        <>
          <small className="hint">{t('pen.edit.hint')}</small>
          <div className="seg" role="group" aria-label={t('pen.node')}>
            <button data-pen-node="corner" disabled={!node} aria-pressed={!!node && !smooth} className={node && !smooth ? 'active' : ''} onClick={() => sel !== null && smooth && apply(toggleSmooth(nodes, closed, sel))}>
              {t('pen.node.corner')}
            </button>
            <button data-pen-node="smooth" disabled={!node} aria-pressed={smooth} className={smooth ? 'active' : ''} onClick={() => sel !== null && !smooth && apply(toggleSmooth(nodes, closed, sel))}>
              {t('pen.node.smooth')}
            </button>
          </div>
          <button
            data-action="pen-delete-node"
            disabled={!node || nodes.length <= 2}
            onClick={() => {
              const next = sel !== null ? removeNode(nodes, sel) : null
              if (!next) return
              apply(next)
              usePenEdit.getState().select(null)
            }}
          >
            {t('pen.node.delete')}
          </button>
          <label>
            <input type="checkbox" data-field="penClosed" checked={closed} onChange={(e) => apply(nodes, e.target.checked)} />
            <span>{t('pen.closed')}</span>
          </label>
        </>
      )}
    </div>
  )
}
