import { useEffect, useMemo, useRef, useState } from 'react'
import { findInDocument, replacementsFor, type Hit } from '@/textSearch'
import { useEditor } from '@/store/editor'
import { useFind } from '@/store/find'

/**
 * Rechercher et remplacer dans les textes du document (⌘F) : occurrences listées page par page, navigation, remplacement de l'occurrence
 * courante ou de toutes, avec casse, mot entier et accents. « Tout remplacer » est un seul cran d'historique (un seul ⌘Z).
 */
export function FindPanel(): React.JSX.Element | null {
  const f = useFind()
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.pageId)
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const hits = useMemo(() => (f.open ? findInDocument(doc, f.query, { caseSensitive: f.caseSensitive, wholeWord: f.wholeWord, ignoreAccents: f.ignoreAccents }, f.scope === 'page' ? pageId : undefined) : []), [f.open, doc, f.query, f.caseSensitive, f.wholeWord, f.ignoreAccents, f.scope, pageId])
  const index = hits.length ? Math.min(f.index, hits.length - 1) : 0
  const pages = new Set(hits.map((h) => h.pageId)).size

  useEffect(() => {
    if (f.open) {
      input.current?.focus()
      input.current?.select()
    }
  }, [f.open, f.focusTick])
  useEffect(() => setMessage(''), [f.query, f.caseSensitive, f.wholeWord, f.ignoreAccents, f.scope])

  if (!f.open) return null

  const goTo = (i: number): void => {
    if (!hits.length) return
    const n = (i + hits.length) % hits.length
    f.set({ index: n })
    const h = hits[n]
    const s = useEditor.getState()
    if (s.pageId !== h.pageId) s.setPage(h.pageId)
    s.select([h.elementId])
  }

  const replace = (list: Hit[]): void => {
    const r = useEditor.getState().replaceTexts(replacementsFor(doc, list, f.replacement))
    const n = list.length
    setMessage(
      r.replaced === 0 && r.skipped > 0
        ? `Aucun remplacement : ${r.skipped} élément${r.skipped > 1 ? 's sont figés' : ' est figé'} par le modèle.`
        : `${n} occurrence${n > 1 ? 's remplacées' : ' remplacée'}${r.skipped ? ` (${r.skipped} élément${r.skipped > 1 ? 's figés ignorés' : ' figé ignoré'})` : ''}.`
    )
  }

  return (
    <div className="find-panel" role="search" aria-label="Rechercher et remplacer" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); f.hide() } }}>
      <div className="find-row">
        <input
          ref={input}
          data-field="findQuery"
          type="search"
          placeholder="Rechercher dans les textes"
          value={f.query}
          onChange={(e) => f.set({ query: e.target.value, index: 0 })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              goTo(index + (e.shiftKey ? -1 : 1))
            }
          }}
        />
        <span className="find-count" data-find-count>{f.query ? (hits.length ? `${index + 1} / ${hits.length}` : '0') : ''}</span>
        <button data-find="prev" disabled={!hits.length} title="Précédent (Maj + Entrée)" onClick={() => goTo(index - 1)}>↑</button>
        <button data-find="next" disabled={!hits.length} title="Suivant (Entrée)" onClick={() => goTo(index + 1)}>↓</button>
        <button data-find="close" title="Fermer (Échap)" onClick={() => f.hide()}>✕</button>
      </div>
      <div className="find-row">
        <input
          data-field="findReplacement"
          type="text"
          placeholder="Remplacer par"
          value={f.replacement}
          onChange={(e) => f.set({ replacement: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits.length) {
              e.preventDefault()
              replace([hits[index]])
            }
          }}
        />
        <button data-find="replace" disabled={!hits.length} title="Remplacer l'occurrence courante (Entrée)" onClick={() => replace([hits[index]])}>Remplacer</button>
        <button data-find="replace-all" disabled={!hits.length} onClick={() => replace(hits)}>Tout remplacer</button>
      </div>
      <div className="find-options">
        <label><input type="checkbox" data-find-option="case" checked={f.caseSensitive} onChange={(e) => f.set({ caseSensitive: e.target.checked, index: 0 })} /> Casse</label>
        <label><input type="checkbox" data-find-option="word" checked={f.wholeWord} onChange={(e) => f.set({ wholeWord: e.target.checked, index: 0 })} /> Mot entier</label>
        <label><input type="checkbox" data-find-option="accents" checked={f.ignoreAccents} onChange={(e) => f.set({ ignoreAccents: e.target.checked, index: 0 })} /> Sans accents</label>
        <select data-find-option="scope" value={f.scope} onChange={(e) => f.set({ scope: e.target.value as 'all' | 'page', index: 0 })} aria-label="Portée">
          <option value="all">Tout le document</option>
          <option value="page">Page courante</option>
        </select>
      </div>
      <p className="hint find-status" role="status" data-find-status>
        {message || (f.query ? (hits.length ? `${hits.length} occurrence${hits.length > 1 ? 's' : ''} dans ${pages} page${pages > 1 ? 's' : ''}` : 'Aucun résultat') : 'Tapez un mot pour le chercher dans tous les textes.')}
      </p>
      {hits.length > 0 && (
        <ul className="find-results" data-find-results>
          {hits.slice(0, 60).map((h, i) => (
            <li key={`${h.elementId}:${h.start}`}>
              <button className={i === index ? 'active' : ''} onClick={() => goTo(i)}>
                <em>p. {h.pageIndex + 1}</em>
                <span>{h.before}<mark>{h.found}</mark>{h.after}</span>
              </button>
            </li>
          ))}
          {hits.length > 60 && <li className="hint">+ {hits.length - 60} autres occurrences</li>}
        </ul>
      )}
    </div>
  )
}
