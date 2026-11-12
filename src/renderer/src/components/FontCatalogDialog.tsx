import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogFont, FontsFailure } from '../../../preload'
import { bytesOfBase64, extraFonts, registerExtraFont, unregisterExtraFont } from '@/fonts'
import { importFontFiles, type FontImportReport } from '@/fontImport'
import { useFonts } from '@/store/fonts'
import { t, useT } from '@/i18n'
import { InfoTip } from './InfoTip'
import type { MessageKey } from '@shared/i18n'

const CATEGORIES: Array<[string, MessageKey]> = [
  ['', 'font.cat.all'],
  ['sans-serif', 'font.cat.sans'],
  ['serif', 'font.cat.serif'],
  ['display', 'font.cat.display'],
  ['handwriting', 'font.cat.handwriting'],
  ['monospace', 'font.cat.mono']
]
const MAX_ROWS = 80
const VARIANT_KEY: Record<string, MessageKey> = { '400': 'font.v.400', '700': 'font.v.700', '400-italic': 'font.v.400-italic', '700-italic': 'font.v.700-italic' }

const messageOf = (f: FontsFailure): string => (f.error === 'offline' ? t('font.err.offline') : f.error === 'rate-limit' ? t('font.err.rateLimit') : t('font.err.unavailable'))

/** Catalogue de polices en ligne (Google Fonts via Fontsource) : recherche, aperçu, installation. Une police installée reste utilisable hors ligne. */
export function FontCatalogDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useFonts((s) => s.dialogOpen)
  const version = useFonts((s) => s.version)
  const [fonts, setFonts] = useState<CatalogFont[] | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<FontsFailure | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<CatalogFont | null>(null)
  const [previewFamily, setPreviewFamily] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const faces = useRef<FontFace[]>([])
  const [importCategory, setImportCategory] = useState('sans-serif')
  const [importReport, setImportReport] = useState<FontImportReport | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open || fonts) return
    setError(null)
    void window.trame.fontCatalog().then((r) => {
      if (r.ok) {
        setFonts(r.fonts)
        setStale(r.stale)
      } else setError(r)
    })
  }, [open, fonts])

  // les aperçus sont des polices temporaires : retirées à la fermeture
  useEffect(() => {
    if (open) return
    for (const f of faces.current) document.fonts.delete(f)
    faces.current = []
    setSelected(null)
    setPreviewFamily(null)
    setNote('')
    setImportReport(null)
  }, [open])

  const installedIds = useMemo(() => new Set(extraFonts().map((f) => f.id)), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (fonts ?? []).filter((f) => (!category || f.category === category) && (!q || f.name.toLowerCase().includes(q))).slice(0, MAX_ROWS)
  }, [fonts, query, category])

  if (!open) return null
  const close = (): void => useFonts.getState().setDialog(false)

  const preview = async (f: CatalogFont): Promise<void> => {
    setSelected(f)
    setPreviewFamily(null)
    setNote('')
    // une police déjà installée s'affiche avec son vrai nom ; sinon on télécharge la graisse normale pour l'aperçu
    if (installedIds.has(f.id)) return setPreviewFamily(f.name)
    const res = await window.trame.previewFont(f.id)
    if (!res.ok) return setNote(messageOf(res))
    const family = `trame-preview-${f.id}`
    const face = new FontFace(family, bytesOfBase64(res.data).buffer as ArrayBuffer)
    await face.load()
    document.fonts.add(face)
    faces.current.push(face)
    setPreviewFamily(family)
  }

  const install = async (f: CatalogFont): Promise<void> => {
    setBusy(f.id)
    setNote('')
    const res = await window.trame.installFont(f.id)
    setBusy(null)
    if (!res.ok) return setNote(`${messageOf(res)}${res.detail ? ` (${res.detail})` : ''}`)
    await registerExtraFont(res.font)
    setPreviewFamily(f.name)
    setNote(t('font.installedNote', { name: f.name }))
  }

  const remove = async (id: string): Promise<void> => {
    await window.trame.removeFont(id)
    unregisterExtraFont(id)
    setNote(t('font.removedNote'))
  }

  const importFiles = async (): Promise<void> => {
    setImporting(true)
    setImportReport(null)
    try {
      const r = await importFontFiles(importCategory)
      if (r) setImportReport(r)
    } finally {
      setImporting(false)
    }
  }
  const mine = extraFonts().filter((f) => f.custom)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('font.dialog')} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal wide">
        <h3>{t('font.title')}</h3>
        <section className="font-import" data-font-import>
          <strong>{t('font.mine')}<InfoTip>{t('font.mine.hint')}</InfoTip></strong>
          <div className="row">
            <select data-field="importCategory" value={importCategory} onChange={(e) => setImportCategory(e.target.value)} aria-label={t('font.fallback.label')} title={t('font.fallback.title')}>
              {CATEGORIES.filter(([v]) => v).map(([v, label]) => (
                <option key={v} value={v}>{t(label)}</option>
              ))}
            </select>
            <button data-action="font-import" disabled={importing} onClick={() => void importFiles()}>
              {importing ? t('font.importing') : t('font.import')}
            </button>
          </div>
          {importReport && (
            <div className="hint" role="status" data-font-import-report>
              {importReport.imported.map((f) => (
                <div key={f.name}>{t('font.imported', { name: f.name, variants: f.variants.map((v) => (v in VARIANT_KEY ? t(VARIANT_KEY[v]) : v)).join(', ') })}</div>
              ))}
              {[...importReport.ignored, ...importReport.notes].map((n, i) => (
                <div key={i}>⚠ {n}</div>
              ))}
            </div>
          )}
          {mine.length > 0 && (
            <div className="catalog-list" data-my-fonts>
              {mine.map((f) => (
                <div key={f.id} className="font-row" data-my-font={f.id}>
                  <span>{f.name}</span>
                  <button className="link" data-action="my-font-remove" onClick={() => void remove(f.id)}>{t('font.remove')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
        <h3>{t('font.online')}<InfoTip>{t('font.online.hint')}</InfoTip></h3>
        {error && (
          <div className="warn" role="status" data-fonts-error={error.error}>
            {messageOf(error)}
            {error.detail && <small className="detail">{t('font.detail', { detail: error.detail })}</small>}
          </div>
        )}
        {fonts && (
          <>
            {stale && <p className="hint">{t('font.stale')}</p>}
            <div className="row">
              <input data-field="fontQuery" type="search" placeholder={t('font.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            <div className="chips" role="group" aria-label={t('font.category')}>
              {CATEGORIES.map(([value, label]) => (
                <button key={value || 'all'} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>
                  {t(label)}
                </button>
              ))}
            </div>
            <div className="catalog-list" data-font-list>
              {shown.map((f) => (
                <button key={f.id} className={`font-row ${selected?.id === f.id ? 'active' : ''}`} data-font={f.id} onClick={() => void preview(f)}>
                  <span>{f.name}</span>
                  <em>{installedIds.has(f.id) ? t('font.installed') : f.variants.length > 2 ? t('font.tag.styles') : f.variants.includes('700') ? t('font.tag.bold') : f.variants.some((v) => v.endsWith('italic')) ? t('font.tag.italic') : ''}</em>
                </button>
              ))}
              {shown.length === 0 && <p className="hint">{t('font.noMatch')}</p>}
              {shown.length === MAX_ROWS && <p className="hint">{t('font.refine')}</p>}
            </div>
            {selected && (
              <div className="font-preview" data-font-preview={selected.id}>
                <div style={{ fontFamily: previewFamily ? `"${previewFamily}", ${selected.category === 'serif' ? 'serif' : 'sans-serif'}` : undefined }}>
                  <div className="sample big">{selected.name}</div>
                  <div className="sample">{t('font.sample')}</div>
                </div>
                <div className="row">
                  {installedIds.has(selected.id) ? (
                    <button data-action="font-remove" onClick={() => void remove(selected.id)}>{t('font.removeThis')}</button>
                  ) : (
                    <button className="primary" data-action="font-install" disabled={busy !== null || stale} onClick={() => void install(selected)}>
                      {busy === selected.id ? t('font.installing') : t('font.install')}
                    </button>
                  )}
                  <span className="hint">{selected.license}</span>
                </div>
              </div>
            )}
          </>
        )}
        {!fonts && !error && <p className="hint" role="status">{t('font.loading')}</p>}
        {note && <p className="hint" role="status" data-font-note>{note}</p>}
        <div className="row end">
          <button data-action="fonts-close" onClick={close}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
