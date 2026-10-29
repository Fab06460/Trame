import { useEffect, useState } from 'react'
import { AI_PROVIDERS, MAX_AI_PROMPT, providerInfo, type AiSize } from '@shared/ai'
import { aiLayerName } from '@/aiImage'
import { insertImage } from '@/clipboardActions'
import { useT } from '@/i18n'
import { downscaleImage } from '@/photoImport'
import { aiErrorMessage, useAi, type AiResult } from '@/store/ai'

const SIZES: AiSize[] = ['square', 'landscape', 'portrait']

/**
 * Images générées par un service en ligne (Cloudflare Workers AI, OpenAI) avec le compte de l'utilisateur. Entièrement facultatif : tant
 * qu'aucun service n'est connecté, le panneau ne fait rien d'autre que l'expliquer. Les identifiants vont directement au processus
 * principal, qui les chiffre ; ce panneau ne les relit jamais.
 */
export function AiPanel(): React.JSX.Element {
  const t = useT()
  const { status, provider, size, prompt, busy, error, results } = useAi()
  const info = providerInfo(provider)
  const current = status?.providers.find((p) => p.id === provider)
  const configured = !!current?.configured
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [inserting, setInserting] = useState<string | null>(null)

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

  const insert = async (r: AiResult): Promise<void> => {
    if (inserting) return
    setInserting(r.id)
    try {
      await insertImage(await downscaleImage(r.dataUrl), { name: aiLayerName(r.prompt), ai: r.info })
    } finally {
      setInserting(null)
    }
  }

  const showForm = !configured || editing
  return (
    <>
      <section>
        <h3>{t('ai.title')}</h3>
        <p className="hint">{t('ai.intro')}</p>
        <label>
          {t('ai.provider')}
          <select data-field="aiProvider" value={provider} onChange={(e) => useAi.getState().set({ provider: e.target.value as typeof provider })}>
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="hint" data-ai-cost>{t(info.costNote)}</p>

        {showForm ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <strong>{t('ai.connect', { service: info.name })}</strong>
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
            <div className="row">
              <button type="submit" className="primary" data-action="ai-save" disabled={info.fields.some((f) => !(form[f.id] ?? (f.secret ? '' : current?.values[f.id] ?? '')).trim())}>
                {t('ai.save')}
              </button>
              {editing && <button type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button>}
            </div>
          </form>
        ) : (
          <div className="stack" data-ai-connected>
            <span>✓ {t('ai.connected', { service: info.name })}</span>
            <div className="row">
              <button data-action="ai-edit" onClick={() => setEditing(true)}>{t('ai.edit')}</button>
              <button className="danger" data-action="ai-forget" onClick={() => void forget()}>{t('ai.forget')}</button>
            </div>
          </div>
        )}
        {status && <p className="hint">{status.persistent ? t('ai.storage.persistent') : t('ai.storage.session')}</p>}
      </section>

      {configured && !editing && (
        <section>
          <label>
            {t('ai.prompt')}
            <textarea
              className="text-field"
              data-field="aiPrompt"
              rows={4}
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
            <div className="row">
              <span className="seg-label">{t('ai.size')}</span>
              <div className="seg three" role="group" aria-label={t('ai.size')}>
                {SIZES.filter((s) => info.sizes.includes(s)).map((s) => (
                  <button key={s} data-ai-size={s} aria-pressed={size === s} className={size === s ? 'active' : ''} disabled={busy !== null} onClick={() => useAi.getState().set({ size: s })}>
                    {t(`ai.size.${s}`)}
                  </button>
                ))}
              </div>
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
          <p className="hint">{t('ai.sent', { service: info.name })}</p>
          {error && (
            <div className="warn" role="status" data-ai-error={error.kind}>
              {aiErrorMessage(error.kind, provider)}
              {error.detail && <small className="detail" data-ai-detail>{t('ai.detail', { detail: error.detail })}</small>}
            </div>
          )}
        </section>
      )}

      {results.length > 0 && (
        <section>
          <h3>{t('ai.results')}</h3>
          <p className="hint">{t('ai.results.hint')}</p>
          <div className="grid photos">
            {results.map((r) => (
              <button key={r.id} className="photo ai-result" data-ai-result={r.id} disabled={inserting !== null} title={t('ai.insert.title', { prompt: r.prompt })} onClick={() => void insert(r)}>
                <img src={r.dataUrl} alt={r.prompt} draggable={false} />
                {inserting === r.id && <span className="photo-busy">…</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
