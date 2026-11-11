import { useEffect, useMemo, useState } from 'react'
import { applyDocumentImport } from '@/outlineImport/actions'
import { MAX_PAGES, outlineToDocument, suggestLevel, type CutLevel, type ImportTheme } from '@/outlineImport/layout'
import { outlineStats } from '@/outlineImport/outline'
import { useOutlineImport } from '@/store/outlineImport'
import { useT } from '@/i18n'
import { InfoTip } from './InfoTip'

/** Titre d'une page importée : son premier texte, abrégé. */
const pageLabel = (elements: { type: string; text?: string }[]): string => {
  const first = elements.find((e) => e.type === 'text')?.text?.split('\n')[0] ?? ''
  return first.length > 70 ? `${first.slice(0, 69)}…` : first
}

function Dialog(): React.JSX.Element | null {
  const t = useT()
  const pending = useOutlineImport((s) => s.pending)!
  const close = (): void => useOutlineImport.getState().close()
  const stats = useMemo(() => outlineStats(pending.outline), [pending])
  const [level, setLevel] = useState<CutLevel>(() => suggestLevel(pending.outline))
  const [theme, setTheme] = useState<ImportTheme>('light')
  const [images, setImages] = useState(true)
  const [busy, setBusy] = useState(false)
  const result = useMemo(() => outlineToDocument(pending.outline, { level, theme, images, name: pending.name, continued: t('outlineImport.continued') }), [pending, level, theme, images, t])
  // rien à importer : ni texte, ni image, ni titre de document
  const empty = !pending.outline.title && !pending.outline.blocks.some((b) => b.kind !== 'break')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  const run = async (): Promise<void> => {
    setBusy(true)
    const done = await applyDocumentImport(pending.outline, pending.name, { level, theme, images })
    setBusy(false)
    if (done) close()
  }
  const notes = pending.outline.notes

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('outlineImport.title')} data-outline-import onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="modal wide outline-import">
        <h3>{t('outlineImport.title')}<InfoTip>{t('outlineImport.hint')}</InfoTip></h3>
        <p className="hint" data-outline-name>
          <strong>{pending.name}</strong> · {t('outlineImport.headings', { count: stats.headings })} · {t('outlineImport.items', { count: stats.items })} · {t('outlineImport.images', { count: stats.images })}
        </p>
        {empty ? (
          <div className="warn" role="status" data-outline-empty>{t('outlineImport.empty')}</div>
        ) : (
          <>
            <label className="settings-line">
              <span>{t('outlineImport.level')}</span>
              <select data-field="outlineLevel" value={level} onChange={(e) => setLevel(Number(e.target.value) as CutLevel)}>
                {([1, 2, 3] as const).map((l) => (
                  <option key={l} value={l}>{t(`outlineImport.level.${l}`)}</option>
                ))}
              </select>
            </label>
            <label className="settings-line">
              <span>{t('outlineImport.theme')}</span>
              <select data-field="outlineTheme" value={theme} onChange={(e) => setTheme(e.target.value as ImportTheme)}>
                <option value="light">{t('outlineImport.theme.light')}</option>
                <option value="dark">{t('outlineImport.theme.dark')}</option>
              </select>
            </label>
            {stats.images > 0 && (
              <label className="check">
                <input type="checkbox" data-field="outlineImages" checked={images} onChange={(e) => setImages(e.target.checked)} /> {t('outlineImport.useImages')}
              </label>
            )}
            <div data-outline-result={result.pages}>
              <strong>{t('outlineImport.result', { count: result.pages })}</strong>
              <ol className="outline-pages">
                {result.doc.pages.slice(0, 8).map((p, i) => (
                  <li key={p.id}>{pageLabel(p.elements) || '·'}</li>
                ))}
              </ol>
              {result.pages > 8 && <div className="hint">… {result.pages - 8}</div>}
            </div>
            {result.truncated && <div className="warn" role="status">{t('outlineImport.truncated', { max: MAX_PAGES })}</div>}
            {notes.tables > 0 && <div className="hint" data-outline-note="tables">{t('outlineImport.note.tables', { count: notes.tables })}</div>}
            {notes.skippedImages > 0 && <div className="hint" data-outline-note="images">{t('outlineImport.note.images', { count: notes.skippedImages })}</div>}
          </>
        )}
        <div className="row end">
          <button data-action="outline-cancel" disabled={busy} onClick={close}>{t('common.cancel')}</button>
          <button className="primary" data-action="outline-import" disabled={busy || empty} onClick={() => void run()}>{t('outlineImport.import')}</button>
        </div>
      </div>
    </div>
  )
}

export function OutlineImportDialog(): React.JSX.Element | null {
  const pending = useOutlineImport((s) => s.pending)
  return pending ? <Dialog key={pending.name} /> : null
}
