import { useEffect, useState } from 'react'
import { useEditor, selectPage } from '@/store/editor'
import { suggestedSeconds } from '@/pageDuration'
import { MAX_SECONDS, MIN_SECONDS } from '@/videoTimeline'
import { useT } from '@/i18n'

/** Durée de la page dans la vidéo exportée : propre à la page, ou celle de la boîte d'export quand le champ est vide. */
export function PageDurationPanel(): React.JSX.Element {
  const t = useT()
  const page = useEditor(selectPage)
  const custom = useEditor((s) => s.doc.pages.filter((p) => p.seconds !== undefined).length)
  const [draft, setDraft] = useState(page.seconds === undefined ? '' : String(page.seconds))
  useEffect(() => setDraft(page.seconds === undefined ? '' : String(page.seconds)), [page.id, page.seconds])
  const { setPageSeconds, applyPageSecondsToAll } = useEditor.getState()

  /** Enregistre le champ : vide = durée de l'export, nombre invalide = on revient à la valeur enregistrée. */
  const commit = (): void => {
    const text = draft.trim().replace(',', '.')
    if (text === '') return page.seconds === undefined ? undefined : setPageSeconds(page.id, null)
    const n = Number(text)
    if (!Number.isFinite(n)) return setDraft(page.seconds === undefined ? '' : String(page.seconds))
    const seconds = Math.round(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n)) * 10) / 10
    if (seconds !== page.seconds) setPageSeconds(page.id, seconds)
    else setDraft(String(seconds))
  }

  return (
    <>
      <h3>{t('pageSeconds.section')}</h3>
      <label>
        {t('pageSeconds.label')}
        <input
          type="text"
          inputMode="decimal"
          className="text-field"
          data-field="pageSeconds"
          placeholder={t('pageSeconds.auto')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>
      <div className="row">
        <button data-action="page-seconds-suggest" title={t('pageSeconds.suggest.title')} onClick={() => setPageSeconds(page.id, suggestedSeconds(page))}>
          {t('pageSeconds.suggest')}
        </button>
        <button data-action="page-seconds-all" disabled={page.seconds === undefined} title={t('pageSeconds.all.title')} onClick={() => applyPageSecondsToAll(page.seconds ?? null)}>
          {t('pageSeconds.all')}
        </button>
      </div>
      <p className="hint">{t('pageSeconds.hint')}</p>
      {custom > 0 && <p className="hint" data-page-seconds-count>{t('pageSeconds.custom', { count: custom })}</p>}
    </>
  )
}
