import { selectPage, useEditor } from '@/store/editor'
import { hasProtected, isEnforced } from '@/protection'
import type { Protection } from '@/types'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

/**
 * Bandeau « modèle de marque » : tant que le document contient des éléments protégés, il dit dans quel état on est
 * (modèle verrouillé : on remplit ; modèle en modification : on décide ce qui est figé ou à remplir).
 */
export function TemplateBanner(): React.JSX.Element | null {
  const t = useT()
  const protectedAny = useEditor((s) => hasProtected(s.doc))
  const unlocked = useEditor((s) => s.templateUnlocked)
  const { setTemplateUnlocked } = useEditor.getState()
  if (!protectedAny) return null
  return unlocked ? (
    <div className="template-banner editing" role="status" data-template-state="editing">
      <strong>{t('protect.editing.title')}</strong>
      <span>{t('protect.editing.text')}</span>
      <button className="primary" data-action="template-lock" onClick={() => setTemplateUnlocked(false)}>
        {t('protect.editing.lock')}
      </button>
    </div>
  ) : (
    <div className="template-banner" role="status" data-template-state="locked">
      <strong>{t('protect.locked.title')}</strong>
      <span>{t('protect.locked.text')}</span>
      <button data-action="template-unlock" onClick={() => setTemplateUnlocked(true)}>
        {t('protect.locked.unlock')}
      </button>
    </div>
  )
}

const OPTIONS: Array<[Protection | undefined, MessageKey, MessageKey]> = [
  [undefined, 'protect.free', 'protect.free.title'],
  ['fill', 'protect.fill', 'protect.fill.title'],
  ['fixed', 'protect.fixed', 'protect.fixed.title']
]

/** Choix de la protection des éléments sélectionnés (disponible quand le modèle n'est pas verrouillé). */
export function ProtectionControls(): React.JSX.Element | null {
  const t = useT()
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const values = useEditor((s) => selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id)).map((e) => e.protect ?? '').join('|'))
  const { setProtection } = useEditor.getState()
  if (enforced) return null
  const list = values.split('|')
  const common = list.every((v) => v === list[0]) ? list[0] || undefined : null // null : sélection mixte
  return (
    <>
      <h3>{t('protect.heading')}</h3>
      <div className="seg three" role="group" aria-label={t('protect.element')}>
        {OPTIONS.map(([value, key, titleKey]) => (
          <button key={key} data-protect={value ?? 'free'} title={t(titleKey)} aria-pressed={common === value} className={common === value ? 'active' : ''} onClick={() => setProtection(value)}>
            {t(key)}
          </button>
        ))}
      </div>
      <p className="hint">{t('protect.hint')}</p>
    </>
  )
}
