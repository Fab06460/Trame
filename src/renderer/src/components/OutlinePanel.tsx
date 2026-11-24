import { useT } from '@/i18n'
import { outlinable, outlinedElements, strokeShape } from '@/strokeOutline'
import { selectPage, useEditor } from '@/store/editor'

/** « Contour en forme » : le trait des éléments sélectionnés (formes, tracés, lignes, flèches) devient une surface pleine, modifiable point par point. */
export function OutlinePanel(): React.JSX.Element | null {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selection = page.elements.filter((e) => selectedIds.includes(e.id))
  if (!selection.length || !selection.every(outlinable)) return null

  const run = async (): Promise<void> => {
    try {
      const changes: Array<{ id: string; elements: ReturnType<typeof outlinedElements> }> = []
      for (const el of selection) {
        const shape = await strokeShape(el)
        if (shape) changes.push({ id: el.id, elements: outlinedElements(el, shape.outline) })
      }
      if (!changes.length) return void window.trame.showInfo(t('outline.title'), t('outline.empty'))
      if (!useEditor.getState().expandElements(changes)) void window.trame.showInfo(t('outline.title'), t('outline.locked'))
    } catch {
      void window.trame.showError(t('outline.title'), t('outline.failed'))
    }
  }

  return (
    <>
      <h3>{t('outline.title')}</h3>
      <div className="row">
        <button data-action="outline-to-shape" title={t('outline.convert.title')} onClick={() => void run()}>
          {t('outline.convert')}
        </button>
      </div>
    </>
  )
}
