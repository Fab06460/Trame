import { useEffect, useMemo, useState } from 'react'
import { applyChanges, diffDocuments, type Change, type ElementAspect } from '@/compare'
import { mergeComments } from '@/review'
import { useEditor } from '@/store/editor'
import { useCompare } from '@/store/compare'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import { PageThumb } from './PageThumb'

const TYPES = { rect: 'compare.type.rect', ellipse: 'compare.type.ellipse', text: 'compare.type.text', image: 'compare.type.image', path: 'compare.type.path' } as const

/**
 * Comparaison avec un autre fichier (copie corrigée, version de l'historique) : liste des différences page par page, qu'on coche pour les
 * reprendre dans le document ouvert. Rien n'est coché au départ ; tout s'applique en un cran d'historique (annulable).
 */
export function CompareDialog(): React.JSX.Element | null {
  const t = useT()
  const target = useCompare((s) => s.other)
  const mine = useEditor((s) => s.doc)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [withComments, setWithComments] = useState(true)
  const [focus, setFocus] = useState<string | null>(null)

  const other = target?.doc ?? null
  const diff = useMemo(() => (other ? diffDocuments(mine, other) : null), [mine, other])
  const commentsInfo = useMemo(() => (other ? mergeComments(mine, other) : null), [mine, other])

  useEffect(() => {
    setSelected(new Set())
    setFocus(null)
    setWithComments(true)
  }, [other])

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useCompare.getState().close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target])

  if (!target || !other || !diff || !commentsInfo) return null
  const close = (): void => useCompare.getState().close()
  const newComments = commentsInfo.addedComments + commentsInfo.addedReplies + commentsInfo.resolved
  const groups = new Map<string, Change[]>()
  for (const c of diff.changes) groups.set(c.pageId, [...(groups.get(c.pageId) ?? []), c])
  const pageNumber = (id: string): string => {
    const i = mine.pages.findIndex((p) => p.id === id)
    return i >= 0 ? t('compare.page', { n: i + 1 }) : t('compare.page.other', { n: other.pages.findIndex((p) => p.id === id) + 1 })
  }
  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const label = (c: Change): string => {
    const what = `${c.elementType ? t(TYPES[c.elementType] as MessageKey) : ''}${c.excerpt ? ` « ${c.excerpt} »` : ''}`.trim()
    switch (c.kind) {
      case 'page-added': return t('compare.row.pageAdded')
      case 'page-removed': return t('compare.row.pageRemoved')
      case 'page-background': return t('compare.row.background')
      case 'page-notes': return t('compare.row.notes')
      case 'element-added': return t('compare.row.added', { what })
      case 'element-removed': return t('compare.row.removed', { what })
      case 'element-changed': return t('compare.row.changed', { what, aspects: (c.aspects ?? []).map((a: ElementAspect) => t(`compare.aspect.${a}` as MessageKey)).join(', ') })
    }
  }
  const apply = (): void => {
    useEditor.getState().editDocument((d) => {
      const r = applyChanges(d, other, selected)
      return withComments ? mergeComments(r, other).doc : r
    })
    close()
  }
  const focused = diff.changes.find((c) => c.id === focus)
  const minePage = focused ? mine.pages.find((p) => p.id === focused.pageId) : undefined
  const otherPage = focused ? other.pages.find((p) => p.id === focused.pageId) : undefined
  const nothing = diff.changes.length === 0 && newComments === 0

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('compare.title', { name: target.label })} data-compare>
      <div className="modal wide compare-dialog">
        <h3>{t('compare.title', { name: target.label })}</h3>
        {diff.commonPages === 0 && <div className="warn" role="status" data-compare-unrelated>{t('compare.unrelated')}</div>}
        {diff.sizeDiffers && <div className="warn" role="status">{t('compare.sizeDiffers')}</div>}
        {nothing ? (
          <p data-compare-same>{t('compare.same')}</p>
        ) : (
          <>
            <p className="hint">{t('compare.how')}</p>
            {newComments > 0 && (
              <label className="choice-row">
                <input type="checkbox" data-field="compareComments" checked={withComments} onChange={(e) => setWithComments(e.target.checked)} />{' '}
                {t('compare.comments', { comments: commentsInfo.addedComments, replies: commentsInfo.addedReplies, resolved: commentsInfo.resolved })}
              </label>
            )}
            {diff.changes.length > 0 && (
              <div className="compare-body">
                <div className="compare-list" data-compare-list>
                  <div className="row wrap">
                    <button onClick={() => setSelected(new Set(diff.changes.map((c) => c.id)))}>{t('compare.all')}</button>
                    <button onClick={() => setSelected(new Set())}>{t('compare.none')}</button>
                  </div>
                  {[...groups.entries()].map(([pageId, list]) => (
                    <fieldset key={pageId} className="compare-group">
                      <legend>{pageNumber(pageId)}</legend>
                      {list.map((c) => (
                        <label key={c.id} className={`choice-row${focus === c.id ? ' on' : ''}`} onMouseEnter={() => setFocus(c.id)} onFocus={() => setFocus(c.id)}>
                          <input type="checkbox" data-change={c.id} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /> {label(c)}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                <div className="compare-preview" data-compare-preview>
                  {focused && (
                    <>
                      <figure>
                        {minePage ? <PageThumb page={minePage} width={mine.width} height={mine.height} maxW={190} maxH={150} /> : <span className="hint">—</span>}
                        <figcaption className="hint">{t('compare.mine')}</figcaption>
                      </figure>
                      <figure>
                        {otherPage ? <PageThumb page={otherPage} width={other.width} height={other.height} maxW={190} maxH={150} /> : <span className="hint">—</span>}
                        <figcaption className="hint">{t('compare.theirs')}</figcaption>
                      </figure>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div className="row end">
          <button data-action="compare-close" onClick={close}>{t('common.close')}</button>
          {!nothing && (
            <button className="primary" data-action="compare-apply" disabled={selected.size === 0 && !(withComments && newComments > 0)} onClick={apply}>
              {t('compare.apply', { count: selected.size + (withComments && newComments > 0 ? 1 : 0) })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
