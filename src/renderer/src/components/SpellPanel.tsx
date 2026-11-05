import { useCallback, useEffect, useMemo, useState } from 'react'
import { contextAround, findMisspellings, replaceWord, type Misspelling } from '@/spelling'
import { useEditor } from '@/store/editor'
import { useSpell } from '@/store/spell'
import { useT } from '@/i18n'
import type { SpellUiState } from '../../../preload'

interface Occurrence {
  pageId: string
  pageNumber: number
  elementId: string
  text: string
  spans: Misspelling[]
  span: Misspelling
}

interface Issue {
  word: string
  suggestions: string[]
  occurrences: Occurrence[]
}

const LANGUAGE_NAMES: Record<string, string> = { fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español' }

/** Les fautes possibles de tout le document, regroupées par mot, dans l'ordre des pages. */
function scan(doc: ReturnType<typeof useEditor.getState>['doc'], ignored: readonly string[]): Issue[] {
  const meta = new Map<string, { pageId: string; pageNumber: number; elementId: string; text: string }>()
  doc.pages.forEach((page, i) => {
    for (const el of page.elements) if (el.type === 'text' && !el.hidden && el.text?.trim()) meta.set(`${page.id}:${el.id}`, { pageId: page.id, pageNumber: i + 1, elementId: el.id, text: el.text })
  })
  const found = findMisspellings([...meta].map(([key, m]) => ({ key, text: m.text })), (words) => window.trame.spellCheck(words), new Set(ignored))
  const issues = new Map<string, Issue>()
  for (const [key, spans] of found) {
    const m = meta.get(key)!
    for (const span of spans) {
      const issue = issues.get(span.word) ?? { word: span.word, suggestions: span.suggestions, occurrences: [] }
      issue.occurrences.push({ ...m, spans, span })
      issues.set(span.word, issue)
    }
  }
  return [...issues.values()]
}

/**
 * Onglet « Orthographe » : les fautes possibles de tout le document (correcteur du système, rien ne quitte l'ordinateur). Un clic sur une
 * suggestion corrige toutes les occurrences du mot en un seul pas d'historique ; on peut aussi ignorer le mot ou l'ajouter au dictionnaire.
 */
export function SpellPanel(): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const ignored = useSpell((s) => s.ignored)
  const [state, setState] = useState<SpellUiState | null>(null)
  const [dictionary, setDictionary] = useState<string[]>([])
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [cursor, setCursor] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')

  const refreshDictionary = useCallback(() => void window.trame.spellDictionary().then(setDictionary), [])
  useEffect(() => {
    void window.trame.spellState().then(setState)
    refreshDictionary()
  }, [refreshDictionary])

  // le document change souvent (déplacements, frappe) : on attend une pause avant de relire tous les textes
  const enabled = state?.enabled ?? false
  useEffect(() => {
    if (!enabled) {
      setIssues(null)
      return
    }
    const timer = setTimeout(() => setIssues(scan(doc, ignored)), 350)
    return () => clearTimeout(timer)
  }, [doc, ignored, enabled, dictionary])

  const total = useMemo(() => issues?.reduce((n, i) => n + i.occurrences.length, 0) ?? 0, [issues])

  const correct = (issue: Issue, replacement: string): void => {
    const byElement = new Map<string, Occurrence>()
    for (const o of issue.occurrences) byElement.set(o.elementId, o)
    const changes = [...byElement.values()].map((o) => ({ elementId: o.elementId, text: replaceWord(o.text, o.spans, issue.word, replacement) }))
    const { skipped } = useEditor.getState().replaceTexts(changes)
    setNote(skipped > 0 ? t('spell.skipped', { count: skipped }) : '')
  }
  const view = (issue: Issue): void => {
    const at = (cursor[issue.word] ?? -1) + 1
    const o = issue.occurrences[at % issue.occurrences.length]
    setCursor({ ...cursor, [issue.word]: at % issue.occurrences.length })
    useEditor.getState().revealElement(o.pageId, o.elementId)
  }
  const addWord = async (word: string): Promise<void> => {
    await window.trame.addSpellWord(word)
    useSpell.getState().ignore(word) // au cas où le système ne tienne pas compte du dictionnaire tout de suite
    refreshDictionary()
  }
  const change = async (patch: { enabled?: boolean; language?: string }): Promise<void> => setState(await window.trame.setSpell(patch))

  return (
    <div className="spell-panel" data-spell-panel>
      {state && !state.enabled ? (
        <>
          <p className="hint" data-spell-off>{t('spell.off')}</p>
          <button className="primary" data-action="spell-enable" onClick={() => void change({ enabled: true })}>{t('spell.enable')}</button>
        </>
      ) : issues === null ? (
        <p className="hint" role="status">{t('spell.checking')}</p>
      ) : issues.length === 0 ? (
        <p className="hint" role="status" data-spell-ok>{t('spell.ok')}</p>
      ) : (
        <>
          <p className="warn" role="status" data-spell-count={total}>{t('spell.count', { count: total })}</p>
          <ul className="spell-list">
            {issues.map((issue) => {
              const first = issue.occurrences[0]
              const ctx = contextAround(first.text, first.span)
              return (
                <li key={issue.word} data-spell-item={issue.word}>
                  <div className="spell-head">
                    <strong className="spell-word">{issue.word}</strong>
                    <span className="hint">{issue.occurrences.length > 1 ? t('spell.times', { count: issue.occurrences.length }) : t('spell.page', { page: first.pageNumber })}</span>
                  </div>
                  <p className="spell-context">{ctx.before}<mark>{ctx.word}</mark>{ctx.after}</p>
                  {issue.suggestions.length > 0 ? (
                    <div className="spell-suggestions">
                      {issue.suggestions.map((s) => (
                        <button key={s} data-spell-suggestion={s} title={issue.occurrences.length > 1 ? t('spell.fixAll.title', { count: issue.occurrences.length }) : t('spell.fix.title')} onClick={() => correct(issue, s)}>{s}</button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">{t('spell.noSuggestion')}</p>
                  )}
                  <div className="spell-actions">
                    <button className="link" data-spell-view onClick={() => view(issue)}>{t('spell.view')}</button>
                    <button className="link" data-spell-ignore onClick={() => useSpell.getState().ignore(issue.word)}>{t('spell.ignore')}</button>
                    <button className="link" data-spell-add onClick={() => void addWord(issue.word)}>{t('spell.add')}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {note && <p className="hint" role="status" data-spell-note>{note}</p>}
      {ignored.length > 0 && (
        <button className="link" data-spell-reset onClick={() => useSpell.getState().resetIgnored()}>{t('spell.resetIgnored', { count: ignored.length })}</button>
      )}

      {state && (
        <details className="spell-settings" data-spell-settings>
          <summary>{t('spell.settings')}</summary>
          <label className="check">
            <input type="checkbox" data-field="spellEnabled" checked={state.enabled} onChange={(e) => void change({ enabled: e.target.checked })} /> {t('spell.enabled')}
          </label>
          <label>
            {t('spell.language')}
            <select data-field="spellLanguage" value={state.language} disabled={state.systemManaged || !state.enabled} onChange={(e) => void change({ language: e.target.value })}>
              <option value="auto">{t('spell.language.auto')}</option>
              {state.languages.map((l) => (
                <option key={l} value={l}>{LANGUAGE_NAMES[l] ?? l}</option>
              ))}
            </select>
          </label>
          {state.systemManaged && <p className="hint" data-spell-system>{t('spell.system')}</p>}
          <h4>{t('spell.dictionary', { count: dictionary.length })}</h4>
          {dictionary.length === 0 ? (
            <p className="hint">{t('spell.dictionary.empty')}</p>
          ) : (
            <ul className="spell-dictionary">
              {dictionary.map((w) => (
                <li key={w} data-spell-dict-word={w}>
                  <span>{w}</span>
                  <button className="link" data-spell-dict-remove={w} aria-label={t('spell.dictionary.remove', { word: w })} title={t('spell.dictionary.remove', { word: w })} onClick={() => void window.trame.removeSpellWord(w).then(refreshDictionary)}>×</button>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">{t('spell.privacy')}</p>
        </details>
      )}
    </div>
  )
}
