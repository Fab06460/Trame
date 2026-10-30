import { useMemo, useState } from 'react'
import { TRANSLATE_LANGUAGES, providerInfo } from '@shared/ai'
import { imagesMissingAlt } from '@/altCheck'
import { useLocale, useT } from '@/i18n'
import { useEditor } from '@/store/editor'
import { aiErrorMessage, useAi } from '@/store/ai'
import { useAltBatch } from '@/store/altBatch'

/**
 * Images sans description : le nombre, un accès à chacune et, si un service d'IA est connecté, « Décrire toutes ». Les descriptions
 * proposées sont appliquées telles quelles (un seul « Annuler » les retire) ; les relire reste à la personne qui édite.
 */
export function AltAudit(): React.JSX.Element | null {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const missing = useMemo(() => imagesMissingAlt(doc), [doc])
  const status = useAi((s) => s.status)
  const provider = useAi((s) => s.provider)
  const { progress, error, lastApplied } = useAltBatch()
  const uiLocale = useLocale((s) => s.locale)
  const [language, setLanguage] = useState(TRANSLATE_LANGUAGES.some((l) => l.code === uiLocale) ? uiLocale : 'en')
  const via = status?.providers.find((p) => p.configured && p.id === provider)?.id ?? status?.providers.find((p) => p.configured)?.id
  const hasImages = doc.pages.some((p) => p.elements.some((e) => e.type === 'image'))
  if (!hasImages && lastApplied === null) return null

  const reveal = (): void => {
    const state = useEditor.getState()
    // l'image suivante après la sélection (dans l'ordre du document), sinon la première
    const here = missing.findIndex((m) => m.pageId === state.pageId && m.elementId === state.selectedIds[0])
    const next = missing[(here + 1) % missing.length]
    if (next) state.revealElement(next.pageId, next.elementId)
  }

  return (
    <section data-alt-audit>
      <h3>{t('altAudit.title')}</h3>
      {missing.length === 0 ? (
        <p className="hint" data-alt-audit-ok>{t('altAudit.ok')}</p>
      ) : (
        <p className="warn" role="status" data-alt-audit-count={missing.length}>{t('altAudit.missing', { count: missing.length })}</p>
      )}
      {lastApplied !== null && lastApplied > 0 && <p className="hint" data-alt-audit-done>{t('altAudit.done', { count: lastApplied })}</p>}
      {missing.length > 0 && !progress && (
        <div className="row wrap">
          <button data-action="alt-audit-next" onClick={reveal}>{t('altAudit.next')}</button>
        </div>
      )}
      {missing.length > 0 &&
        (via ? (
          <>
            <div className="row wrap">
              <select data-field="altAuditLanguage" aria-label={t('alt.language')} title={t('alt.language')} value={language} disabled={!!progress} onChange={(e) => setLanguage(e.target.value)}>
                {TRANSLATE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
              {progress ? (
                <>
                  <button disabled data-alt-audit-busy>{t('altAudit.progress', { done: progress.done, total: progress.total })}</button>
                  <button data-action="alt-audit-cancel" onClick={() => useAltBatch.getState().cancel()}>{t('common.cancel')}</button>
                </>
              ) : (
                <button className="primary" data-action="alt-audit-all" onClick={() => void useAltBatch.getState().run(via, language)}>
                  {t('altAudit.all', { count: missing.length })}
                </button>
              )}
            </div>
            <p className="hint">{t('altAudit.sent', { service: providerInfo(via).name, count: missing.length })} {t(providerInfo(via).vision.costNote)}</p>
          </>
        ) : (
          <p className="hint" data-alt-audit-connect>{t('altAudit.connect')}</p>
        ))}
      {error && (
        <div className="warn" role="status" data-alt-audit-error={error.kind}>
          {aiErrorMessage(error.kind, via ?? provider)}
          {error.detail && <small className="detail">{t('ai.detail', { detail: error.detail })}</small>}
        </div>
      )}
    </section>
  )
}
