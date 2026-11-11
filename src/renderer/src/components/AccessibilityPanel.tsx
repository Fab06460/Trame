import { useMemo, useState } from 'react'
import { InfoTip } from './InfoTip'
import { SpeechSection } from './SpeechSection'
import { accessibilityIssues, contrastFix, unverifiedTexts, type A11yIssue } from '@/accessibility'
import { imagesMissingAlt } from '@/altCheck'
import { COLOR_VISIONS, easyReadingPatch, type ColorVision } from '@/readability'
import { FONTS } from '@/fonts'
import { useT } from '@/i18n'
import { useAi } from '@/store/ai'
import { useColorVision } from '@/store/colorVision'
import { useEditor } from '@/store/editor'
import { openSidebarTab } from '@/store/sidebar'
import type { MessageKey } from '@shared/i18n'
import type { TrameElement } from '@/types'

const READABLE = FONTS.filter((f) => f.group === 'readable')

/** Début d'un texte, pour reconnaître l'élément dans la liste. */
const excerpt = (e: TrameElement | undefined): string => {
  const s = (e?.text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > 28 ? `${s.slice(0, 27)}…` : s
}

/**
 * Onglet « Accessibilité » : contraste, taille et ordre de lecture des textes, images sans description, mise en forme de lecture
 * facilitée (police lisible, interligne, interlettrage) et simulation de la vision des couleurs. Rien n'est modifié sans clic.
 */
export function AccessibilityPanel(): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const pageId = useEditor((s) => s.pageId)
  const vision = useColorVision((s) => s.vision)
  const issues = useMemo(() => accessibilityIssues(doc), [doc])
  const missingAlt = useMemo(() => imagesMissingAlt(doc).length, [doc])
  const unverified = useMemo(() => unverifiedTexts(doc), [doc])
  const [font, setFont] = useState(READABLE[0].family)
  const [scope, setScope] = useState<'selection' | 'page' | 'all'>('page')
  const [easyNote, setEasyNote] = useState('')

  const elementOf = (id: string): TrameElement | undefined => doc.pages.flatMap((p) => p.elements).find((e) => e.id === id)
  const show = (i: A11yIssue): void => {
    const id = i.kind === 'order' ? i.elementIds[0] : i.elementId
    useEditor.getState().revealElement(i.pageId, id)
  }
  const fixContrast = (i: Extract<A11yIssue, { kind: 'contrast' }>): { elementId: string; patch: Partial<TrameElement> } | null => contrastFix(doc, i)
  const patchAll = (changes: Array<{ elementId: string; patch: Partial<TrameElement> }>): void => {
    if (changes.length) useEditor.getState().patchElements(changes)
  }

  const contrast = issues.filter((i): i is Extract<A11yIssue, { kind: 'contrast' }> => i.kind === 'contrast')
  const small = issues.filter((i): i is Extract<A11yIssue, { kind: 'small' }> => i.kind === 'small')
  const order = issues.filter((i): i is Extract<A11yIssue, { kind: 'order' }> => i.kind === 'order')
  const total = issues.length + (missingAlt > 0 ? 1 : 0)

  const applyEasy = (): void => {
    const texts = doc.pages
      .filter((p) => scope === 'all' || (scope === 'page' && p.id === pageId) || scope === 'selection')
      .flatMap((p) => p.elements)
      .filter((e) => e.type === 'text' && !e.hidden && (scope !== 'selection' || selectedIds.includes(e.id)))
    const changes = texts.flatMap((e) => {
      const patch = easyReadingPatch(e, font)
      return patch ? [{ elementId: e.id, patch }] : []
    })
    if (!changes.length) {
      setEasyNote(t('a11y.easy.none'))
      return
    }
    const res = useEditor.getState().patchElements(changes)
    setEasyNote(t('a11y.easy.done', { count: res.changed }))
  }

  return (
    <>
      <h3>{t('a11y.title')}<InfoTip>{t('a11y.intro')}</InfoTip></h3>
      <p data-a11y-summary={total} role="status" className={total > 0 ? 'warn' : 'hint'}>{total > 0 ? t('a11y.summary', { count: total }) : t('a11y.ok')}</p>

      {contrast.length > 0 && (
        <section data-a11y="contrast">
          <h4>{t('a11y.contrast.h')}<InfoTip>{t('a11y.contrast.hint')}</InfoTip></h4>
          <ul className="a11y-list">
            {contrast.map((i) => (
              <li key={i.elementId}>
                <span>{t('a11y.contrast.item', { page: t('a11y.page', { page: i.pageIndex + 1 }), text: excerpt(elementOf(i.elementId)), ratio: String(i.ratio).replace('.', ','), required: String(i.required).replace('.', ',') })}</span>
                <span className="row">
                  <button data-a11y-show onClick={() => show(i)}>{t('a11y.show')}</button>
                  <button data-a11y-fix="contrast" onClick={() => patchAll([fixContrast(i)].filter((c): c is NonNullable<typeof c> => !!c))}>{t('a11y.fix')}</button>
                </span>
              </li>
            ))}
          </ul>
          {contrast.length > 1 && (
            <button data-a11y-fix-all="contrast" onClick={() => patchAll(contrast.map(fixContrast).filter((c): c is NonNullable<typeof c> => !!c))}>{t('a11y.fixAll', { count: contrast.length })}</button>
          )}
        </section>
      )}
      {unverified > 0 && <p className="hint" data-a11y-unverified={unverified}>{t('a11y.unverified', { count: unverified })}</p>}

      {small.length > 0 && (
        <section data-a11y="small">
          <h4>{t('a11y.small.h')}</h4>
          <ul className="a11y-list">
            {small.map((i) => (
              <li key={i.elementId}>
                <span>{t('a11y.small.item', { page: t('a11y.page', { page: i.pageIndex + 1 }), text: excerpt(elementOf(i.elementId)), size: Math.round(i.size), min: i.min })}</span>
                <span className="row">
                  <button data-a11y-show onClick={() => show(i)}>{t('a11y.show')}</button>
                  <button data-a11y-fix="small" onClick={() => patchAll([{ elementId: i.elementId, patch: { fontSize: i.min } }])}>{t('a11y.small.fix')}</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.length > 0 && (
        <section data-a11y="order">
          <h4>{t('a11y.order.h')}<InfoTip>{t('a11y.order.hint')}</InfoTip></h4>
          <ul className="a11y-list">
            {order.map((i) => (
              <li key={i.pageId}>
                <span>{t('a11y.order.item', { page: t('a11y.page', { page: i.pageIndex + 1 }) })}</span>
                <span className="row">
                  <button data-a11y-show onClick={() => show(i)}>{t('a11y.show')}</button>
                  <button data-a11y-fix="order" onClick={() => useEditor.getState().setTextOrder(i.pageId, i.elementIds)}>{t('a11y.order.fix')}</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missingAlt > 0 && (
        <section data-a11y="alt">
          <h4>{t('a11y.alt.h')}</h4>
          <div className="row wrap">
            <span>{t('a11y.alt.item', { count: missingAlt })}</span>
            <button
              data-a11y-open-alt
              onClick={() => {
                useAi.getState().set({ mode: 'alt' })
                openSidebarTab('ai')
              }}
            >
              {t('a11y.alt.open')}
            </button>
          </div>
        </section>
      )}

      <section data-a11y="easy">
        <h4>{t('a11y.easy.h')}<InfoTip>{t('a11y.easy.hint')}</InfoTip></h4>
        <label>
          {t('a11y.easy.font')}
          <select data-field="a11yFont" value={font} onChange={(e) => setFont(e.target.value)}>
            {READABLE.map((f) => (
              <option key={f.name} value={f.family}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          <select data-field="a11yScope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label={t('a11y.easy.h')}>
            <option value="selection">{t('a11y.easy.selection')}</option>
            <option value="page">{t('a11y.easy.page')}</option>
            <option value="all">{t('a11y.easy.all')}</option>
          </select>
        </label>
        <button data-a11y-easy onClick={applyEasy}>{t('a11y.easy.apply')}</button>
        {easyNote && <p className="hint" role="status" data-a11y-easy-note>{easyNote}</p>}
      </section>

      <SpeechSection />

      <section data-a11y="vision">
        <h4>{t('a11y.vision.h')}<InfoTip>{t('a11y.vision.hint')}</InfoTip></h4>
        <select data-field="a11yVision" value={vision} onChange={(e) => useColorVision.getState().setVision(e.target.value as ColorVision)} aria-label={t('a11y.vision.h')}>
          {COLOR_VISIONS.map((v) => (
            <option key={v} value={v}>{t(`a11y.vision.${v}` as MessageKey)}</option>
          ))}
        </select>
      </section>
    </>
  )
}
