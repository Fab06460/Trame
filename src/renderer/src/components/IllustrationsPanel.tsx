import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n'
import { DEFAULT_ACCENT, DEFAULT_INK, illustrationName, insertIllustration, loadIllustrations } from '@/illustrationLibrary'
import { searchIllustrations, type Illustration } from '@/illustrations'

/** Illustrations embarquées (Open Doodles, CC0) : recherche, couleurs d'encre et d'accent choisies avant l'insertion. */
export function IllustrationsPanel(): React.JSX.Element {
  const t = useT()
  const [all, setAll] = useState<Illustration[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [ink, setInk] = useState(DEFAULT_INK)
  const [accent, setAccent] = useState(DEFAULT_ACCENT)

  useEffect(() => {
    loadIllustrations().then(setAll, () => setFailed(true))
  }, [])

  // `t` change avec la langue : la recherche porte sur les noms affichés
  const results = useMemo(() => (all ? searchIllustrations(all, query, illustrationName) : []), [all, query, t])

  return (
    <section>
      <h3>{t('illus.title')}</h3>
      <input
        data-field="illustrationQuery"
        type="search"
        placeholder={t('illus.search.placeholder')}
        aria-label={t('illus.search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={60}
      />
      <div className="row">
        <label className="row">
          <span>{t('illus.ink')}</span>
          <input type="color" data-field="illustrationInk" value={ink} onChange={(e) => setInk(e.target.value)} />
        </label>
        <label className="row">
          <span>{t('illus.accent')}</span>
          <input type="color" data-field="illustrationAccent" value={accent} onChange={(e) => setAccent(e.target.value)} />
        </label>
      </div>

      {failed && <div className="warn" role="status">{t('illus.err')}</div>}
      {!all && !failed && <p className="hint">{t('illus.loading')}</p>}
      {all && (
        <>
          <p className="hint" data-illustration-count={results.length}>
            {results.length === 0 ? t('illus.none') : t('illus.count', { count: results.length })}
          </p>
          <div className="grid illustrations" data-illustration-grid>
            {results.map((ill) => (
              <button
                key={ill.id}
                className="illustration-cell"
                data-illustration={ill.id}
                title={illustrationName(ill.id)}
                aria-label={illustrationName(ill.id)}
                onClick={() => insertIllustration(ill, { ink, accent })}
              >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ aspectRatio: String(ill.ratio) }} aria-hidden="true">
                  {ill.layers.map((l, i) => (
                    <path key={i} d={l.d} fillRule="evenodd" fill={l.color === 0 ? accent : ink} />
                  ))}
                </svg>
              </button>
            ))}
          </div>
          <p className="hint">{t('illus.credit')}</p>
        </>
      )}
    </section>
  )
}
