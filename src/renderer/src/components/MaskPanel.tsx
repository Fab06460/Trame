import { useT } from '@/i18n'
import { canBeMask } from '@/clipMask'
import { selectPage, useEditor } from '@/store/editor'

/** « Masque d'écrêtage » : la forme la plus haute de la sélection découpe les autres éléments ; ou, pour un groupe masqué, libérer le masque. */
export function MaskPanel(): React.JSX.Element | null {
  const t = useT()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selection = page.elements.filter((e) => selectedIds.includes(e.id))
  const groups = new Set(selection.map((e) => e.groupId).filter((g): g is string => !!g))
  const masked = page.elements.some((e) => e.clip && e.groupId && groups.has(e.groupId))
  const canMake = selection.length >= 2 && selection.some(canBeMask)
  if (!masked && !canMake) return null
  const isMask = selection.length === 1 && selection[0].clip
  return (
    <>
      <h3>{t('mask.title')}</h3>
      {isMask && <p className="hint">{t('mask.isMask')}</p>}
      <div className="row">
        {canMake && !masked && (
          <button data-action="mask-make" title={t('mask.make.title')} onClick={() => !useEditor.getState().makeMask() && void window.trame.showInfo(t('mask.title'), t('mask.locked'))}>
            {t('mask.make')}
          </button>
        )}
        {masked && (
          <button data-action="mask-release" title={t('mask.release.title')} onClick={() => useEditor.getState().releaseMask()}>
            {t('mask.release')}
          </button>
        )}
      </div>
    </>
  )
}
