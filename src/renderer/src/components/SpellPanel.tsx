import { useCallback, useEffect, useState } from 'react'
import { contextAround, replaceWord } from '@/spelling'
import { issueCount, type Issue, type Occurrence } from '@/spellScan'
import { useEditor } from '@/store/editor'
import { useSpell } from '@/store/spell'
import { useT } from '@/i18n'
import { InfoTip } from './InfoTip'
import type { SpellUiState } from '../../../preload'

const LANGUAGE_NAMES: Record<string, string> = { fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español' }

/**
 * Onglet « Orthographe » : les fautes possibles de tout le document (correcteur du système, rien ne quitte l'ordinateur). Un clic sur une
 * suggestion corrige toutes les occurrences du mot en un seul pas d'historique ; on peut aussi ignorer le mot ou l'ajouter au dictionnaire.
 */
export function SpellPanel(): React.JSX.Element {
  const t = useT()
  const ignored = useSpell((s) => s.ignored)
  const issues = useSpell((s) => s.issues)
  const [state, setState] = useState<SpellUiState | null>(null)
  const [dictionary, setDictionary] = useState<string[]>([])
  const [cursor, setCursor] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')

  const refreshDictionary = useCallback(() => void window.trame.spellDictionary().then(setDictionary), [])
  useEffect(() => {
    void window.trame.spellState().then(setState)
    refreshDictionary()
  }, [refreshDictionary])

  const total = issueCount(issues)

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
    useSpell.getState().bump()
  }
  const change = async (patch: { enabled?: boolean; language?: string }): Promise<void> => {
    const next = await window.trame.setSpell(patch)
    setState(next)
    useSpell.getState().setEnabled(next.enabled)
  }

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
          <div className="row">
            <label className="check">
              <input type="checkbox" data-field="spellEnabled" checked={state.enabled} onChange={(e) => void change({ enabled: e.target.checked })} /> {t('spell.enabled')}
            </label>
            <InfoTip>{t('spell.privacy')}</InfoTip>
          </div>
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
                  <button className="link" data-spell-dict-remove={w} aria-label={t('spell.dictionary.remove', { word: w })} title={t('spell.dictionary.remove', { word: w })} onClick={() => void window.trame.removeSpellWord(w).then(() => { refreshDictionary(); useSpell.getState().bump() })}>×</button>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  )
}
