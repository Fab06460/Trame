import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import { insertIcon, loadIcons } from '@/iconLibrary'
import { CATEGORY_KEYS, searchIcons, type IconLibrary, type IconWeight } from '@/iconSearch'

/** Icônes affichées d'un coup : le reste s'obtient par « Afficher plus » (1 400 dessins dans la liste la ralentiraient). */
const PAGE = 120

/** Bibliothèque d'icônes embarquée (Phosphor) : recherche en français ou en anglais, catégories, contour ou plein. */
export function IconsPanel(): React.JSX.Element {
  const t = useT()
  const [lib, setLib] = useState<IconLibrary | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const [weight, setWeight] = useState<IconWeight>('regular')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    loadIcons().then(setLib, () => setFailed(true))
  }, [])

  const labels = useMemo(() => (lib ? lib.categories.map((c) => t(`icons.cat.${CATEGORY_KEYS[c]}` as MessageKey)) : []), [lib, t])
  const results = useMemo(() => (lib ? searchIcons(lib, query, category, labels) : []), [lib, query, category, labels])
  useEffect(() => setShown(PAGE), [query, category])

  return (
    <section>
      <h3>{t('icons.title')}</h3>
      <input
        data-field="iconQuery"
        type="search"
        placeholder={t('icons.search.placeholder')}
        aria-label={t('icons.search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={60}
      />
      <label className="row">
        <span>{t('icons.category')}</span>
        <select data-field="iconCategory" value={category ?? ''} onChange={(e) => setCategory(e.target.value === '' ? null : Number(e.target.value))} disabled={!lib}>
          <option value="">{t('icons.category.all')}</option>
          {lib?.categories
            .map((c, i) => ({ i, label: labels[i], c }))
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((x) => (
              <option key={x.c} value={x.i}>
                {x.label}
              </option>
            ))}
        </select>
      </label>
      <div className="seg" role="group" aria-label={t('icons.weight')}>
        {(['regular', 'fill'] as const).map((w) => (
          <button key={w} type="button" className={weight === w ? 'active' : ''} aria-pressed={weight === w} data-icon-weight={w} onClick={() => setWeight(w)}>
            {t(w === 'regular' ? 'icons.weight.regular' : 'icons.weight.fill')}
          </button>
        ))}
      </div>

      {failed && <div className="warn" role="status">{t('icons.err')}</div>}
      {!lib && !failed && <p className="hint">{t('icons.loading')}</p>}
      {lib && (
        <>
          <p className="hint" data-icon-count={results.length}>
            {results.length === 0 ? t('icons.none') : t('icons.count', { count: results.length })}
          </p>
          <div className="grid icons" data-icon-grid>
            {results.slice(0, shown).map((icon) => (
              <button key={icon.name} className="icon-cell" data-icon={icon.name} title={icon.name} aria-label={icon.name} onClick={() => insertIcon(icon, weight)}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <path d={icon[weight]} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          {results.length > shown && (
            <button className="link" data-action="icons-more" onClick={() => setShown(shown + PAGE)}>
              {t('icons.more')}
            </button>
          )}
          <p className="hint">{t('icons.credit')}</p>
        </>
      )}
    </section>
  )
}
