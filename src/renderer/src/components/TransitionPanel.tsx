import { useEditor, selectPage } from '@/store/editor'
import { DEFAULT_TRANSITION, TRANSITIONS, pageTransition, type PageTransition } from '@/transition'

const labelOf = (t: PageTransition): string => TRANSITIONS.find((x) => x.id === t)?.label ?? t

/**
 * Transitions de la présentation : celle de la page courante (jouée à l'arrivée sur elle), celle du document (par défaut), et un
 * raccourci pour donner la même à toutes les pages.
 */
export function TransitionPanel(): React.JSX.Element {
  const page = useEditor(selectPage)
  const doc = useEditor((s) => s.doc)
  const index = doc.pages.findIndex((p) => p.id === page.id)
  const fallback = doc.transition ?? DEFAULT_TRANSITION
  const effective = pageTransition(doc, index)
  const { setPageTransition, setTransition, applyTransitionToAll } = useEditor.getState()
  const custom = doc.pages.filter((p) => p.transition !== undefined).length

  return (
    <>
      <h3>Présentation</h3>
      <label>
        Transition vers cette page
        <select data-field="pageTransition" value={page.transition ?? 'inherit'} onChange={(e) => setPageTransition(page.id, e.target.value === 'inherit' ? null : (e.target.value as PageTransition))}>
          <option value="inherit">Comme le document ({labelOf(fallback)})</option>
          {TRANSITIONS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>
      <label>
        Par défaut (document)
        <select data-field="docTransition" value={fallback} onChange={(e) => setTransition(e.target.value as PageTransition)}>
          {TRANSITIONS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>
      <button data-action="transition-all" onClick={() => applyTransitionToAll(effective)} disabled={custom === 0 && effective === fallback} title={`Donne « ${labelOf(effective)} » à toutes les pages et retire les réglages propres à chaque page`}>
        Appliquer « {labelOf(effective)} » à toutes les pages
      </button>
      {custom > 0 && <p className="hint" data-transition-count>{custom} page{custom > 1 ? 's ont' : ' a'} sa propre transition.</p>}
    </>
  )
}
