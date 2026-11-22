import { useT } from '@/i18n'
import { BOOLEAN_OPS, canCombine, combineShapes, combinedElement, type BooleanOp } from '@/pathBoolean'
import { selectPage, useEditor } from '@/store/editor'
import type { MessageKey } from '@shared/i18n'

/** « Combiner les formes » : unir, soustraire, intersecter ou exclure les formes sélectionnées (rectangles, ellipses, tracés fermés), en un seul tracé modifiable. */
export function BooleanPanel(): React.JSX.Element | null {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  // dans l'ordre de la pile : la forme du dessous donne son style et se fait soustraire les suivantes
  const shapes = page.elements.filter((e) => selectedIds.includes(e.id))
  // une sélection qui contient un masque d'écrêtage se combinerait en perdant le masque : on libère d'abord le masque
  if (!canCombine(shapes) || shapes.some((e) => e.clip)) return null

  const run = async (op: BooleanOp): Promise<void> => {
    try {
      const combined = await combineShapes(shapes, op)
      if (!combined) return void window.trame.showInfo(t('bool.title'), t('bool.empty'))
      if (!useEditor.getState().replaceSelection(combinedElement(shapes, combined))) void window.trame.showInfo(t('bool.title'), t('bool.locked'))
    } catch {
      void window.trame.showError(t('bool.title'), t('bool.failed'))
    }
  }

  return (
    <>
      <h3>{t('bool.title')}</h3>
      <div className="chart-kinds">
        {BOOLEAN_OPS.map((op) => (
          <button key={op} data-action={`bool-${op}`} title={t(`bool.${op}.title` as MessageKey)} onClick={() => void run(op)}>
            {t(`bool.${op}` as MessageKey)}
          </button>
        ))}
      </div>
    </>
  )
}
