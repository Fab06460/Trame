import { useEffect } from 'react'
import { useT, useLocale } from '@/i18n'
import { pendingNews, useNews } from '@/store/news'
import { newsLines } from '@shared/news'

/**
 * Fenêtre « Nouveautés » : proposée une fois après une mise à jour (ce qui a changé depuis la dernière version lancée sur cet ordinateur),
 * et à la demande depuis le menu Fichier (tout l'historique). Elle attend qu'aucune autre fenêtre ne soit ouverte et ne s'ouvre jamais
 * pendant les tests automatiques.
 */
export function NewsDialog(): React.JSX.Element | null {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const entries = useNews((s) => s.entries)
  const auto = useNews((s) => s.auto)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = (entries: ReturnType<typeof pendingNews>, version: string, tries = 0): void => {
      if (cancelled) return
      if (document.querySelector('.modal-backdrop, .presentation, .tour-layer') && tries < 20) {
        timer = setTimeout(() => wait(entries, version, tries + 1), 1000)
        return
      }
      useNews.getState().show(entries, version, true)
    }
    void window.trame
      .getSystemInfo()
      .then((info) => {
        if (cancelled || info.automated) return
        const entries = pendingNews(info.version)
        if (entries.length) timer = setTimeout(() => wait(entries, info.version), 2500)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!entries) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useNews.getState().close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries])

  if (!entries) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('news.title')} data-news-dialog>
      <div className="modal wide news-dialog">
        <h3>{t('news.title')}</h3>
        <p className="hint">{t(auto ? 'news.intro.update' : 'news.intro.all')}</p>
        <div className="news-list" tabIndex={0}>
          {entries.map((n) => (
            <section key={n.version} data-news-version={n.version}>
              <h4>{t('news.version', { version: n.version })}</h4>
              <ul>
                {newsLines(n, locale).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="row end">
          <button className="primary" data-action="news-close" autoFocus onClick={() => useNews.getState().close()}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
