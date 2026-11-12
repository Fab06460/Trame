import { KitSwatches } from './KitSwatches'
import { NumberField } from './NumberField'
import { defaultGradient } from '@/gradient'
import { useBrand } from '@/store/brand'
import { selectPage, useEditor } from '@/store/editor'
import { useT } from '@/i18n'

/** Fond de la page : couleur unie ou dégradé (linéaire ou radial, deux couleurs), et « appliquer à toutes les pages ». */
export function PageBackground(): React.JSX.Element {
  const t = useT()
  const page = useEditor((s) => selectPage(s))
  const pages = useEditor((s) => s.doc.pages.length)
  const { setBackground, setBackgroundGradient, applyBackgroundToAll } = useEditor.getState()
  const g = page.backgroundGradient
  const note = (c: string): void => useBrand.getState().noteColor(c)

  return (
    <>
      <h3>{t('prop.background')}</h3>
      <div className="seg" role="group" aria-label={t('prop.background')} data-page-background>
        <button data-page-fill="solid" aria-pressed={!g} className={!g ? 'active' : ''} onClick={() => g && setBackground(g.from)}>
          {t('prop.fill.solid')}
        </button>
        <button data-page-fill="gradient" aria-pressed={!!g} className={g ? 'active' : ''} onClick={() => !g && setBackgroundGradient(defaultGradient(page.background))}>
          {t('prop.fill.gradient')}
        </button>
      </div>
      {g ? (
        <>
          <label>
            {t('prop.gradient.type')}
            <select data-field="pageGradType" value={g.type} onChange={(e) => setBackgroundGradient({ ...g, type: e.target.value as 'linear' | 'radial' })}>
              <option value="linear">{t('prop.gradient.linear')}</option>
              <option value="radial">{t('prop.gradient.radial')}</option>
            </select>
          </label>
          <div className="stroke-row">
            <input type="color" data-field="pageGradFrom" title={t('prop.gradient.from')} aria-label={t('prop.gradient.from')} value={g.from} onChange={(e) => setBackgroundGradient({ ...g, from: e.target.value })} onBlur={(e) => note(e.target.value)} />
            <button data-flag="pageGradSwap" title={t('prop.gradient.swap')} aria-label={t('prop.gradient.swap')} onClick={() => setBackgroundGradient({ ...g, from: g.to, to: g.from })}>
              ⇄
            </button>
            <input type="color" data-field="pageGradTo" title={t('prop.gradient.to')} aria-label={t('prop.gradient.to')} value={g.to} onChange={(e) => setBackgroundGradient({ ...g, to: e.target.value })} onBlur={(e) => note(e.target.value)} />
          </div>
          {g.type === 'linear' && (
            <NumberField
              label={t('prop.gradient.angle')}
              field="pageGradAngle"
              value={g.angle}
              min={0}
              max={360}
              step={5}
              suffix="°"
              onCommit={(v) => setBackgroundGradient({ ...g, angle: ((v % 360) + 360) % 360 })}
            />
          )}
        </>
      ) : (
        <>
          <label>
            {t('prop.background')}
            <input type="color" value={page.background} onChange={(e) => setBackground(e.target.value)} onBlur={(e) => note(e.target.value)} />
          </label>
          <KitSwatches current={page.background} onPick={setBackground} />
        </>
      )}
      {pages > 1 && (
        <button data-action="background-all" title={t('prop.background.all.title')} onClick={applyBackgroundToAll}>
          {t('prop.background.all')}
        </button>
      )}
    </>
  )
}
