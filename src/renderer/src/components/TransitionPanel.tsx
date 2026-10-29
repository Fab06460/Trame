import { useEditor, selectPage } from '@/store/editor'
import { DEFAULT_TRANSITION, TRANSITIONS, pageTransition, transitionLabel, type PageTransition } from '@/transition'
import { useT } from '@/i18n'

const labelOf = transitionLabel

/**
 * Transitions de la présentation : celle de la page courante (jouée à l'arrivée sur elle), celle du document (par défaut), et un
 * raccourci pour donner la même à toutes les pages.
 */
export function TransitionPanel(): React.JSX.Element {
  const t = useT()
  const page = useEditor(selectPage)
  const doc = useEditor((s) => s.doc)
  const index = doc.pages.findIndex((p) => p.id === page.id)
  const fallback = doc.transition ?? DEFAULT_TRANSITION
  const effective = pageTransition(doc, index)
  const { setPageTransition, setTransition, applyTransitionToAll } = useEditor.getState()
  const custom = doc.pages.filter((p) => p.transition !== undefined).length

  return (
    <>
      <h3>{t('transition.section')}</h3>
      <label>
        {t('transition.page')}
        <select data-field="pageTransition" value={page.transition ?? 'inherit'} onChange={(e) => setPageTransition(page.id, e.target.value === 'inherit' ? null : (e.target.value as PageTransition))}>
          <option value="inherit">{t('transition.inherit', { name: labelOf(fallback) })}</option>
          {TRANSITIONS.map((x) => (
            <option key={x.id} value={x.id}>{labelOf(x.id)}</option>
          ))}
        </select>
      </label>
      <label>
        {t('transition.default')}
        <select data-field="docTransition" value={fallback} onChange={(e) => setTransition(e.target.value as PageTransition)}>
          {TRANSITIONS.map((x) => (
            <option key={x.id} value={x.id}>{labelOf(x.id)}</option>
          ))}
        </select>
      </label>
      <button data-action="transition-all" onClick={() => applyTransitionToAll(effective)} disabled={custom === 0 && effective === fallback} title={t('transition.all.title', { name: labelOf(effective) })}>
        {t('transition.all', { name: labelOf(effective) })}
      </button>
      {custom > 0 && <p className="hint" data-transition-count>{t('transition.custom', { count: custom })}</p>}
    </>
  )
}
