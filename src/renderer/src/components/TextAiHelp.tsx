import { useEffect, useState } from 'react'
import { TRANSLATE_LANGUAGES, providerInfo } from '@shared/ai'
import { useT } from '@/i18n'
import { contentLocked } from '@/protection'
import { aiErrorMessage, useAi } from '@/store/ai'
import { useEditor } from '@/store/editor'
import { openSidebarTab } from '@/store/sidebar'
import type { TrameElement } from '@/types'

const ACTIONS = ['rewrite', 'shorten', 'expand', 'fix'] as const

/**
 * Aide à la rédaction dans les propriétés d'un texte : les actions courantes à portée de main, sans quitter le panneau. Même moteur et
 * mêmes garanties que l'onglet « IA » (propositions à valider, rien d'envoyé avant un clic) ; l'onglet reste là pour les demandes libres.
 */
export function TextAiHelp({ el, enforced }: { el: TrameElement; enforced: boolean }): React.JSX.Element {
  const t = useT()
  const { status, provider, busy, error, drafts, writeLanguage } = useAi()
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!status) void useAi.getState().refresh()
  }, [status])
  // le service choisi dans l'onglet « IA » n'est peut-être pas celui qui est connecté : on prend alors celui qui l'est
  const configured = status?.providers.filter((p) => p.configured).map((p) => p.id) ?? []
  const ready = configured.includes(provider)
  useEffect(() => {
    if (status && !ready && configured.length) useAi.getState().set({ provider: configured[0] })
  }, [status, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const empty = !el.text?.trim()
  const locked = contentLocked(el, enforced)
  const draft = drafts.find((d) => d.sourceId === el.id)
  const mine = error?.where === 'write'

  return (
    <>
      <h4>{t('aiw.inline.title')}</h4>
      {!status || (!ready && !configured.length) ? (
        <>
          <p className="hint" data-aiw-inline-connect>{t('aiw.inline.connect')}</p>
          <button data-action="ai-open-tab" onClick={() => { useAi.getState().set({ mode: 'text' }); openSidebarTab('ai') }}>{t('aiw.inline.openTab')}</button>
        </>
      ) : (
        <>
          <div className="chips">
            {ACTIONS.map((a) => (
              <button key={a} data-ai-write-inline={a} disabled={busy !== null || empty || locked} title={locked ? t('aiw.replace.locked') : empty ? t('aiw.inline.empty') : undefined} onClick={() => void useAi.getState().write(a)}>
                {t(`aiw.${a}`)}
              </button>
            ))}
          </div>
          <div className="row">
            <select data-field="aiInlineLanguage" aria-label={t('aiw.translate')} value={writeLanguage} disabled={busy !== null} onChange={(e) => useAi.getState().set({ writeLanguage: e.target.value })}>
              {TRANSLATE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <button data-ai-write-inline="translate" disabled={busy !== null || empty || locked} onClick={() => void useAi.getState().write('translate')}>{t('aiw.translate.button')}</button>
          </div>
          {busy && (
            <div className="row">
              <button disabled data-aiw-inline-busy>{t('aiw.working')}</button>
              <button onClick={() => useAi.getState().cancel()}>{t('common.cancel')}</button>
            </div>
          )}
          {mine && (
            <div className="warn" role="status" data-aiw-inline-error={error.kind}>
              {aiErrorMessage(error.kind, provider)}
              {error.detail && <small className="detail">{t('ai.detail', { detail: error.detail })}</small>}
            </div>
          )}
          {draft && (
            <div className="ai-draft" data-ai-inline-draft={draft.id}>
              <strong>{draft.label}</strong>
              <div className="ai-draft-text" data-ai-inline-draft-text>{draft.text}</div>
              <div className="row wrap">
                <button
                  className="primary"
                  data-action="ai-inline-replace"
                  disabled={locked}
                  onClick={() => {
                    useEditor.getState().updateElement(el.id, { text: draft.text })
                    useAi.getState().dropDraft(draft.id)
                  }}
                >
                  {t('aiw.replace')}
                </button>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(draft.text).catch(() => {})
                    setCopied(draft.id)
                    setTimeout(() => setCopied(null), 1500)
                  }}
                >
                  {copied === draft.id ? t('aiw.copied') : t('aiw.copy')}
                </button>
                <button className="link" data-action="ai-inline-dismiss" onClick={() => useAi.getState().dropDraft(draft.id)}>{t('aiw.inline.dismiss')}</button>
              </div>
            </div>
          )}
          <p className="hint">
            {t('aiw.inline.sent', { service: providerInfo(provider).name })}{' '}
            <button className="link" data-action="ai-open-tab" onClick={() => { useAi.getState().set({ mode: 'text' }); openSidebarTab('ai') }}>{t('aiw.inline.more')}</button>
          </p>
        </>
      )}
    </>
  )
}
