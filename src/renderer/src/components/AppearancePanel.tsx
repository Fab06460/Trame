import { buildChoices, withGroupMates } from '@/builds'
import { LinkPanel } from '@/components/LinkPanel'
import { selectPage, useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import { BLEND_MODES, blendOf, type BlendMode } from '@/blend'
import type { MessageKey } from '@shared/i18n'

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
  const picked = page.elements.filter((e) => selectedIds.includes(e.id))
  const modes = new Set(picked.map((e) => blendOf(e)))
  const blend = modes.size === 1 ? [...modes][0] : 'mixed'
  const applyBlend = (mode: BlendMode): void => {
    useEditor.getState().patchElements(picked.map((e) => ({ elementId: e.id, patch: { blend: mode === 'normal' ? undefined : mode } })))
  }
  return (
    <>
      <h3>{t('blend.section')}</h3>
      <label>
        {t('blend.mode')}
        <select data-field="blend" value={blend} onChange={(e) => applyBlend(e.target.value as BlendMode)}>
          {blend === 'mixed' && <option value="mixed" disabled>{t('blend.mixed')}</option>}
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>{t(`blend.${m}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <p className="hint">{t('blend.hint')}</p>
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
