import { useEffect, useMemo, useState } from 'react'
import { useEditor, selectPage } from '@/store/editor'
import { useBrand } from '@/store/brand'
import { useStyleMatch } from '@/store/styleMatch'
import { extractPalette, type Swatch } from '@/palette'
import { samplePixels } from '@/paletteImage'
import { buildMapping, collectColors, recolorDoc } from '@/recolor'
import { isEnforced } from '@/protection'
import { MAX_COLORS } from '@/brandKit'
import { PageThumb } from './PageThumb'
import { useT } from '@/i18n'

const COUNT = { min: 3, max: 8, initial: 5 }

/**
 * Style d'après une image : on en extrait les couleurs dominantes, on peut les garder dans le kit de marque, et on recolore le design
 * (la page ou toutes) avec elles. Le clair reste clair et le sombre reste sombre (voir `recolor.ts`) ; un texte lisible le reste.
 */
export function StyleMatchDialog(): React.JSX.Element | null {
  const open = useStyleMatch((s) => s.open)
  return open ? <StyleMatch /> : null
}

function StyleMatch(): React.JSX.Element {
  const t = useT()
  const source = useStyleMatch((s) => s.source)
  const doc = useEditor((s) => s.doc)
  const page = useEditor(selectPage)
  const unlocked = useEditor((s) => s.templateUnlocked)
  const kit = useBrand((s) => s.kit)
  const [count, setCount] = useState(COUNT.initial)
  const [swatches, setSwatches] = useState<Swatch[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)
  const [scope, setScope] = useState<'page' | 'all'>('page')
  const [keepNeutrals, setKeepNeutrals] = useState(true)
  const [background, setBackground] = useState(true)

  const onClose = (): void => useStyleMatch.getState().close()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // les pixels de l'image ne sont lus qu'une fois ; le nombre de couleurs ne refait que le regroupement
  const [pixels, setPixels] = useState<Uint8ClampedArray | null>(null)
  useEffect(() => {
    setFailed(false)
    setPixels(null)
    if (!source) return setSwatches([])
    let live = true
    samplePixels(source).then(
      (p) => live && setPixels(p),
      () => live && setFailed(true)
    )
    return () => {
      live = false
    }
  }, [source])
  useEffect(() => {
    setSwatches(pixels ? extractPalette(pixels, count) : [])
    setOff(new Set())
  }, [pixels, count])

  const chosen = swatches.map((s) => s.color).filter((c) => !off.has(c))
  const pageIds = useMemo(() => new Set(scope === 'all' ? doc.pages.map((p) => p.id) : [page.id]), [scope, doc.pages, page.id])
  const enforced = isEnforced(doc, unlocked)
  const mapping = useMemo(() => buildMapping(collectColors(doc, pageIds), chosen, keepNeutrals), [doc, pageIds, chosen.join(), keepNeutrals])
  const result = useMemo(() => recolorDoc(doc, mapping, { pageIds, enforced, background }), [doc, mapping, pageIds, enforced, background])
  const after = result.doc.pages.find((p) => p.id === page.id) ?? page
  const changes = result.doc === doc ? 0 : Math.max(result.changed, 1)

  const choose = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src) useStyleMatch.getState().show(src)
  }
  const apply = (): void => {
    useEditor.getState().editDocument((d) => recolorDoc(d, mapping, { pageIds, enforced, background }).doc)
    onClose()
  }
  const addToKit = (): void => {
    const brand = useBrand.getState()
    for (const c of chosen) if (!kit.colors.includes(c) && useBrand.getState().kit.colors.length < MAX_COLORS) brand.addColor(c)
  }
  const inKit = chosen.length > 0 && chosen.every((c) => kit.colors.includes(c))

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('style.title')} data-style-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide style-dialog">
        <h3>{t('style.title')}</h3>
        <p className="hint">{t('style.hint')}</p>
        <div className="row style-source">
          {source && <img src={source} alt="" className="style-image" draggable={false} />}
          <button data-action="style-choose" onClick={() => void choose()}>{t('style.choose')}</button>
          {source && !failed && (
            <label>
              {t('style.count')}
              <input type="range" data-field="styleCount" min={COUNT.min} max={COUNT.max} value={count} onChange={(e) => setCount(Number(e.target.value))} />
              <span className="hint">{count}</span>
            </label>
          )}
        </div>
        {failed && <div className="warn" role="status">{t('imp.imageUnreadable')}</div>}
        {source && !failed && pixels && swatches.length === 0 && <p className="hint">{t('style.empty')}</p>}
        {swatches.length > 0 && (
          <div className="row style-swatches" data-style-swatches>
            {swatches.map((s) => (
              <button
                key={s.color}
                type="button"
                className={`style-swatch${off.has(s.color) ? ' off' : ''}`}
                data-style-color={s.color}
                aria-pressed={!off.has(s.color)}
                style={{ background: s.color }}
                title={t('style.swatch', { color: s.color, share: Math.round(s.share * 100) })}
                aria-label={t('style.swatch', { color: s.color, share: Math.round(s.share * 100) })}
                onClick={() => setOff((o) => (o.has(s.color) ? new Set([...o].filter((c) => c !== s.color)) : new Set([...o, s.color])))}
              />
            ))}
            <button data-action="style-kit" disabled={chosen.length === 0 || inKit} onClick={addToKit}>{inKit ? t('style.inKit') : t('style.addKit')}</button>
          </div>
        )}
        {swatches.length > 0 && (
          <>
            <div className="row">
              <label>
                {t('style.scope')}
                <select data-field="styleScope" value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'all')}>
                  <option value="page">{t('style.scope.page')}</option>
                  <option value="all">{t('style.scope.all')}</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" data-field="styleNeutrals" checked={keepNeutrals} onChange={(e) => setKeepNeutrals(e.target.checked)} /> {t('style.neutrals')}
              </label>
              <label className="check">
                <input type="checkbox" data-field="styleBackground" checked={background} onChange={(e) => setBackground(e.target.checked)} /> {t('style.background')}
              </label>
            </div>
            <div className="row style-preview">
              <figure>
                <PageThumb page={page} width={doc.width} height={doc.height} maxW={200} maxH={140} />
                <figcaption>{t('style.before')}</figcaption>
              </figure>
              <span aria-hidden="true">→</span>
              <figure data-style-after>
                <PageThumb page={after} width={doc.width} height={doc.height} maxW={200} maxH={140} />
                <figcaption>{t('style.after')}</figcaption>
              </figure>
            </div>
            <p className="hint" data-style-summary={changes}>{changes === 0 ? t('style.nothing') : t('style.summary', { count: result.changed })}</p>
          </>
        )}
        <div className="row">
          <button data-action="style-close" onClick={onClose}>{t('common.close')}</button>
          <button className="primary" data-action="style-apply" disabled={changes === 0} onClick={apply}>{t('style.apply')}</button>
        </div>
      </div>
    </div>
  )
}
