import { useEffect, useState } from 'react'
import { AI_PROVIDERS, MAX_AI_PROMPT, TRANSLATE_LANGUAGES, providerInfo, type AiSize, type WriteAction } from '@shared/ai'
import { contentLocked, isEnforced } from '@/protection'
import { placeResult } from '@/aiEdit'
import { selectPage, useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import { AltAudit } from './AltAudit'
import { imagesMissingAlt } from '@/altCheck'
import { aiErrorMessage, useAi, type AiMode, type AiResult } from '@/store/ai'

const MODES: AiMode[] = ['image', 'text', 'alt']
const SIZES: AiSize[] = ['square', 'landscape', 'portrait']

/**
 * Images générées par un service en ligne (Cloudflare Workers AI, OpenAI) avec le compte de l'utilisateur. Entièrement facultatif : tant
 * qu'aucun service n'est connecté, le panneau ne fait rien d'autre que l'expliquer. Les identifiants vont directement au processus
 * principal, qui les chiffre ; ce panneau ne les relit jamais.
 */
export function AiPanel(): React.JSX.Element {
  const t = useT()
  const { status, provider, mode, size, prompt, editPrompt, busy, error, results } = useAi()
  const missingAlt = useEditor((s) => imagesMissingAlt(s.doc).length)
  const selected = useEditor((s) => {
    const el = selectPage(s).elements.find((e) => e.id === s.selectedIds[0])
    return s.selectedIds.length === 1 && el?.type === 'image' && el.src ? el : null
  })
  const info = providerInfo(provider)
  const current = status?.providers.find((p) => p.id === provider)
  const configured = !!current?.configured
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [inserting, setInserting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const { writePrompt, writeLanguage, drafts } = useAi()
  const selectedText = useEditor((s) => {
    const el = selectPage(s).elements.find((e) => e.id === s.selectedIds[0])
    return s.selectedIds.length === 1 && el?.type === 'text' ? el : null
  })
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const hasText = !!selectedText?.text?.trim()
  const elementsOnPage = useEditor((s) => selectPage(s).elements)

  useEffect(() => {
    void useAi.getState().refresh()
  }, [])
  // changer de service repart d'un formulaire vide (les secrets ne sont jamais préremplis)
  useEffect(() => {
    setEditing(false)
    setForm({})
    setFormError(null)
  }, [provider])

  const save = async (): Promise<void> => {
    const res = await window.trame.aiSave(provider, form)
    if (!res.ok) {
      const field = info.fields.find((f) => f.id === res.field)
      setFormError(provider === 'cloudflare' && res.field === 'account' ? t('ai.invalid.account') : t('ai.invalid', { field: field ? t(field.label) : '' }))
      return
    }
    setForm({})
    setFormError(null)
    setEditing(false)
    await useAi.getState().refresh()
  }

  const forget = async (): Promise<void> => {
    await window.trame.aiForget(provider)
    setEditing(false)
    await useAi.getState().refresh()
  }

  const place = async (r: AiResult, mode: 'insert' | 'replace'): Promise<void> => {
    if (inserting) return
    setInserting(r.id)
    try {
      await placeResult(r, mode)
    } finally {
      setInserting(null)
    }
  }
  const insert = (r: AiResult): Promise<void> => place(r, 'insert')

  const showForm = !configured || editing
  const errorBox = (where: 'generate' | 'edit' | 'write', attr: string): React.JSX.Element | null =>
    error?.where === where ? (
      <div className="warn" role="status" {...{ [attr]: error.kind }}>
        {aiErrorMessage(error.kind, provider)}
        {error.detail && <small className="detail" data-ai-detail>{t('ai.detail', { detail: error.detail })}</small>}
      </div>
    ) : null

  return (
    <>
      <section className="ai-head">
        <div className="ai-service">
          <select aria-label={t('ai.provider')} title={t('ai.provider')} data-field="aiProvider" value={provider} onChange={(e) => useAi.getState().set({ provider: e.target.value as typeof provider })}>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {configured && (
            <button className="icon-btn" data-action="ai-edit" aria-pressed={editing} title={t('ai.settings')} aria-label={t('ai.settings')} onClick={() => setEditing(!editing)}>
              ⚙
            </button>
          )}
        </div>
        {configured ? (
          <span className="ai-state" data-ai-connected>✓ {t('ai.connected', { service: info.name })}</span>
        ) : (
          <p className="hint">{t('ai.intro')}</p>
        )}

        {showForm && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <strong>{t('ai.connect', { service: info.name })}</strong>
            <p className="hint" data-ai-cost>{t(info.costNote)}</p>
            {info.fields.map((f) => (
              <label key={f.id}>
                {t(f.label)}
                <input
                  className="text-field"
                  data-ai-field={f.id}
                  type={f.secret ? 'password' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.placeholder}
                  maxLength={300}
                  value={form[f.id] ?? (f.secret ? '' : current?.values[f.id] ?? '')}
                  onChange={(e) => setForm({ ...form, [f.id]: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </label>
            ))}
            <p className="hint">{t('ai.signup', { url: info.signupUrl })}</p>
            {formError && <div className="warn" role="status" data-ai-form-error>{formError}</div>}
            <div className="row wrap">
              <button type="submit" className="primary" data-action="ai-save" disabled={info.fields.some((f) => !(form[f.id] ?? (f.secret ? '' : current?.values[f.id] ?? '')).trim())}>
                {t('ai.save')}
              </button>
              {editing && <button type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button>}
              {configured && <button type="button" className="danger" data-action="ai-forget" onClick={() => void forget()}>{t('ai.forget')}</button>}
            </div>
            {status && <p className="hint">{status.persistent ? t('ai.storage.persistent') : t('ai.storage.session')}</p>}
          </form>
        )}
      </section>

      {configured && !editing && (
        <div className="seg three ai-modes" role="tablist" aria-label={t('ai.modes')}>
          {MODES.map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} data-ai-mode={m} onClick={() => useAi.getState().set({ mode: m })}>
              {t(`ai.mode.${m}`)}
              {m === 'alt' && missingAlt > 0 && <span className="count-dot" data-ai-alt-count={missingAlt} aria-label={t('altAudit.missing', { count: missingAlt })}>{missingAlt}</span>}
            </button>
          ))}
        </div>
      )}

      {configured && !editing && mode === 'image' && (
        <>
          <section>
            <label>
              {t('ai.prompt')}
              <textarea
                className="text-field"
                data-field="aiPrompt"
                rows={3}
                maxLength={MAX_AI_PROMPT}
                placeholder={t('ai.prompt.placeholder')}
                value={prompt}
                disabled={busy !== null}
                onChange={(e) => useAi.getState().set({ prompt: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation() // pas de raccourcis de l'éditeur pendant la saisie
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void useAi.getState().generate()
                }}
              />
            </label>
            {info.sizes.length > 1 && (
              <div className="seg three" role="group" aria-label={t('ai.size')}>
                {SIZES.filter((s) => info.sizes.includes(s)).map((s) => (
                  <button key={s} data-ai-size={s} aria-pressed={size === s} className={size === s ? 'active' : ''} disabled={busy !== null} onClick={() => useAi.getState().set({ size: s })}>
                    {t(`ai.size.${s}`)}
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              {busy ? (
                <>
                  <button disabled data-ai-busy>{t('ai.generating')}</button>
                  <button data-action="ai-cancel" onClick={() => useAi.getState().cancel()}>{t('common.cancel')}</button>
                </>
              ) : (
                <button className="primary" data-action="ai-generate" disabled={!prompt.trim()} onClick={() => void useAi.getState().generate()}>
                  {t('ai.generate')}
                </button>
              )}
            </div>
            {errorBox('generate', 'data-ai-error')}
          </section>

          <section data-ai-edit>
            <h3>{t('aie.title')}</h3>
            {selected ? (
              <>
                <img className="ai-source" src={selected.src} alt="" draggable={false} data-ai-source={selected.id} />
                <label>
                  {t('aie.instruction')}
                  <textarea
                    className="text-field"
                    data-field="aiEditPrompt"
                    rows={2}
                    maxLength={MAX_AI_PROMPT}
                    placeholder={t('aie.instruction.placeholder')}
                    value={editPrompt}
                    disabled={busy !== null}
                    onChange={(e) => useAi.getState().set({ editPrompt: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void useAi.getState().edit('edit')
                    }}
                  />
                </label>
                <div className="row wrap">
                  {busy ? (
                    <>
                      <button disabled data-aie-busy>{t('ai.generating')}</button>
                      <button data-action="aie-cancel" onClick={() => useAi.getState().cancel()}>{t('common.cancel')}</button>
                    </>
                  ) : (
                    <>
                      <button className="primary" data-action="ai-edit-run" disabled={!editPrompt.trim()} onClick={() => void useAi.getState().edit('edit')}>
                        {t('aie.edit')}
                      </button>
                      <button data-action="ai-variation" onClick={() => void useAi.getState().edit('variation')}>
                        {t('aie.variation')}
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="hint" data-aie-none>{t('aie.none')}</p>
            )}
            {errorBox('edit', 'data-aie-error')}
          </section>

          {results.length > 0 && (
            <section>
              <h3>{t('ai.results')}</h3>
              <p className="hint">{t('ai.results.hint')}</p>
              <div className="grid photos">
                {results.map((r) => (
                  <div key={r.id} className="ai-result-card">
                    <button className="photo ai-result" data-ai-result={r.id} data-ai-kind={r.kind ?? 'generate'} disabled={inserting !== null} title={t('ai.insert.title', { prompt: r.prompt })} onClick={() => void insert(r)}>
                      <img src={r.dataUrl} alt={r.prompt} draggable={false} />
                      {r.kind && <span className="photo-license">{r.kind === 'variation' ? t('aie.result.variation') : t('aie.result.edit', { prompt: r.prompt })}</span>}
                      {inserting === r.id && <span className="photo-busy">…</span>}
                    </button>
                    {r.kind && (
                      <>
                        <button className="link" data-action="ai-insert-next" disabled={inserting !== null} onClick={() => void place(r, 'insert')}>
                          {t('aie.insertNext')}
                        </button>
                        <button className="link" data-action="ai-replace" disabled={inserting !== null} onClick={() => void place(r, 'replace')}>
                          {t('aie.replace')}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <details className="ai-about">
            <summary>{t('ai.about')}</summary>
            <p className="hint">{t(info.costNote)}</p>
            <p className="hint">{t('ai.sent', { service: info.name })}</p>
            <p className="hint" data-aie-cost>{t(info.edit.costNote)}</p>
            <p className="hint">{t('aie.sent', { service: info.name, side: info.edit.maxInputSide })}</p>
          </details>
        </>
      )}

      {configured && !editing && mode === 'text' && (
        <>
          <section data-ai-write>
            {hasText ? (
              <blockquote className="ai-excerpt" data-ai-excerpt>{selectedText!.text!.length > 160 ? `${selectedText!.text!.slice(0, 160)}…` : selectedText!.text}</blockquote>
            ) : (
              <p className="hint" data-aiw-none>{t('aiw.none')}</p>
            )}
            {hasText && (
              <>
                <div className="chips">
                  {(['rewrite', 'shorten', 'expand', 'fix', 'formal', 'casual'] as const).map((a) => (
                    <button key={a} data-ai-write={a} disabled={busy !== null} onClick={() => void useAi.getState().write(a)}>
                      {t(`aiw.${a}`)}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <select aria-label={t('aiw.translate')} data-field="aiWriteLanguage" value={writeLanguage} disabled={busy !== null} onChange={(e) => useAi.getState().set({ writeLanguage: e.target.value })}>
                    {TRANSLATE_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{t('aiw.translate')} {l.name}</option>
                    ))}
                  </select>
                  <button data-ai-write="translate" disabled={busy !== null} onClick={() => void useAi.getState().write('translate')}>{t('aiw.translate.button')}</button>
                </div>
              </>
            )}
            <label>
              {t('aiw.free')}
              <textarea
                className="text-field"
                data-field="aiWritePrompt"
                rows={2}
                maxLength={MAX_AI_PROMPT}
                placeholder={hasText ? t('aiw.free.selected') : t('aiw.free.new')}
                value={writePrompt}
                disabled={busy !== null}
                onChange={(e) => useAi.getState().set({ writePrompt: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void useAi.getState().write('free')
                }}
              />
            </label>
            <div className="row">
              {busy ? (
                <>
                  <button disabled data-aiw-busy>{t('aiw.working')}</button>
                  <button data-action="aiw-cancel" onClick={() => useAi.getState().cancel()}>{t('common.cancel')}</button>
                </>
              ) : (
                <button className="primary" data-ai-write="free" disabled={!writePrompt.trim()} onClick={() => void useAi.getState().write('free')}>
                  {hasText ? t('aiw.free.apply') : t('aiw.free.write')}
                </button>
              )}
            </div>
            {errorBox('write', 'data-aiw-error')}
          </section>

          {drafts.length > 0 && (
            <section data-ai-drafts>
              <h3>{t('aiw.results')}</h3>
              <p className="hint">{t('aiw.results.hint')}</p>
              {drafts.map((d) => {
                const source = d.sourceId ? elementsOnPage.find((e) => e.id === d.sourceId) : undefined
                const locked = !!source && contentLocked(source, enforced)
                return (
                  <div key={d.id} className="ai-draft" data-ai-draft={d.id}>
                    <strong>{d.label}</strong>
                    <div className="ai-draft-text" data-ai-draft-text>{d.text}</div>
                    <div className="row wrap">
                      {source && (
                        <button className="primary" data-action="ai-draft-replace" disabled={locked} title={locked ? t('aiw.replace.locked') : undefined} onClick={() => useEditor.getState().updateElement(source.id, { text: d.text })}>
                          {t('aiw.replace')}
                        </button>
                      )}
                      <button data-action="ai-draft-new" onClick={() => useEditor.getState().addElement({ type: 'text', text: d.text }, { edit: false })}>{t('aiw.insertNew')}</button>
                      <button
                        data-action="ai-draft-copy"
                        onClick={() => {
                          void navigator.clipboard.writeText(d.text).catch(() => {})
                          setCopied(d.id)
                          setTimeout(() => setCopied(null), 1500)
                        }}
                      >
                        {copied === d.id ? t('aiw.copied') : t('aiw.copy')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          <details className="ai-about">
            <summary>{t('ai.about')}</summary>
            <p className="hint">{hasText ? t('aiw.sent', { service: info.name }) : t('aiw.sent.new', { service: info.name })}</p>
            <p className="hint" data-aiw-cost>{t(info.text.costNote)}</p>
          </details>
        </>
      )}

      {(!configured || (!editing && mode === 'alt')) && <AltAudit />}
    </>
  )
}
