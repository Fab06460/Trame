import { buildChoices, withGroupMates } from '@/builds'
import { LinkPanel } from '@/components/LinkPanel'
import { selectPage, useEditor } from '@/store/editor'
import { useT } from '@/i18n'

/**
 * Apparition en présentation : à quel clic chaque élément sélectionné apparaît (0 = dès l'ouverture de la page). Un groupe (graphique,
 * tableau…) apparaît d'un seul bloc. Les exports (PDF, images, SVG, PowerPoint) montrent toujours tout.
 */
export function AppearancePanel(): React.JSX.Element {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const ids = withGroupMates(page.elements, selectedIds)
  const values = new Set(page.elements.filter((e) => ids.includes(e.id)).map((e) => e.build ?? 0))
  const value = values.size === 1 ? [...values][0] : -1
  const apply = (n: number): void => {
    useEditor.getState().patchElements(ids.map((elementId) => ({ elementId, patch: { build: n > 0 ? n : undefined } })))
  }
  return (
    <>
      <h3>{t('build.section')}</h3>
      <label>
        {t('build.when')}
        <select data-field="build" value={value} onChange={(e) => apply(Number(e.target.value))}>
          {value === -1 && <option value={-1} disabled>{t('build.mixed')}</option>}
          {buildChoices(page).map((n) => (
            <option key={n} value={n}>{n === 0 ? t('build.none') : t('build.click', { n })}</option>
          ))}
        </select>
      </label>
      <p className="hint">{t('build.hint')}</p>
      <LinkPanel />
    </>
  )
}
