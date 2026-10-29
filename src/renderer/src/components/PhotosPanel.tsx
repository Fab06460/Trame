import { useState } from 'react'
import type { PhotoError, PhotoSourceChoice, PhotoView } from '../../../preload'
import { insertImage } from '@/clipboardActions'
import { documentCredits, downscaleImage } from '@/photoImport'
import { useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

const MESSAGES: Record<PhotoError, MessageKey> = {
  offline: 'photo.err.offline',
  'rate-limit': 'photo.err.rateLimit',
  unavailable: 'photo.err.unavailable'
}

/** Recherche de photos libres de droits (Openverse). Seule fonction en ligne de Trame : elle ne s'active que sur demande. */
export function PhotosPanel(): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [photos, setPhotos] = useState<PhotoView[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PhotoError | null>(null)
  const [detail, setDetail] = useState('')
  const [choice, setChoice] = useState<PhotoSourceChoice>('auto')
  /** source qui a réellement répondu (les pages suivantes restent sur elle) et si c'est un repli */
  const [used, setUsed] = useState<{ source: 'openverse' | 'commons'; fallback: boolean } | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const doc = useEditor((s) => s.doc)
  const credits = documentCredits(doc)

  const search = async (q: string, p: number): Promise<void> => {
    if (!q.trim() || busy) return
    setBusy(true)
    setError(null)
    setDetail('')
    const res = await window.trame.searchPhotos(q, p, p > 1 && used ? used.source : choice)
    setBusy(false)
    if (!res.ok) {
      setDetail(res.detail ?? '')
      return setError(res.error)
    }
    setAsked(q)
    setUsed({ source: res.source, fallback: res.fallback })
    setPage(res.page)
    setPageCount(res.pageCount)
    setPhotos((prev) => (p === 1 ? res.photos : [...prev, ...res.photos.filter((n) => !prev.some((o) => o.id === n.id))]))
  }

  const insert = async (photo: PhotoView): Promise<void> => {
    if (importing) return
    setImporting(photo.id)
    setError(null)
    setDetail('')
    const res = await window.trame.importPhoto(photo.id)
    if (!res.ok) {
      setImporting(null)
      setDetail(res.detail ?? '')
      return setError(res.error)
    }
    try {
      await insertImage(await downscaleImage(res.dataUrl), { credit: res.credit, name: (res.title || photo.title || t('photo.default')).slice(0, 80) })
    } finally {
      setImporting(null)
    }
  }

  const copyCredits = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(credits.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* presse-papiers indisponible : rien à faire */
    }
  }

  return (
    <>
      <section>
        <h3>{t('photo.title')}</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void search(query, 1)
          }}
        >
          <input data-field="photoQuery" type="search" placeholder={t('photo.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
          <button type="submit" data-action="photo-search" disabled={busy || !query.trim()}>
            {busy && page === 1 ? '…' : t('photo.search')}
          </button>
        </form>
        <label className="row">
          <span>{t('photo.source')}</span>
          <select data-field="photoSource" value={choice} onChange={(e) => setChoice(e.target.value as PhotoSourceChoice)}>
            <option value="auto">{t('photo.source.auto')}</option>
            <option value="openverse">Openverse</option>
            <option value="commons">Wikimedia Commons</option>
          </select>
        </label>
        <p className="hint">
          {t('photo.hint')}
        </p>
        {error && (
          <div className="warn" role="status" data-photo-error={error}>
            {t(MESSAGES[error])}
            {detail && <small className="detail" data-photo-detail>{t('photo.detail', { detail })}</small>}
          </div>
        )}
      </section>

      {photos.length > 0 && (
        <section>
          <h3>{t('photo.results', { query: asked })}</h3>
          {used && (
            <p className="hint" data-photo-source={used.source}>
              {t('photo.from', { source: used.source === 'openverse' ? 'Openverse' : 'Wikimedia Commons' })}
              {used.fallback ? t('photo.fallback') : ''}
            </p>
          )}
          <div className="grid photos">
            {photos.map((p) => (
              <button
                key={p.id}
                className="photo"
                data-photo={p.id}
                disabled={importing !== null}
                title={t('photo.tooltip', { title: p.title || t('doc.untitled'), creator: p.creator ? ' — ' + p.creator : '', license: p.license })}
                onClick={() => void insert(p)}
              >
                <img src={p.thumb} alt={p.title} draggable={false} />
                <span className="photo-license">{p.license}</span>
                {importing === p.id && <span className="photo-busy">…</span>}
              </button>
            ))}
          </div>
          {page < pageCount && (
            <button data-action="photo-more" disabled={busy} onClick={() => void search(asked, page + 1)}>
              {busy ? t('photo.loading') : t('photo.more')}
            </button>
          )}
        </section>
      )}

      {photos.length === 0 && asked && !busy && !error && <p className="hint">{t('photo.noResults', { query: asked })}</p>}

      {credits.length > 0 && (
        <section>
          <h3>{t('photo.credits')}</h3>
          <p className="hint">{t('photo.credits.hint', { count: credits.length })}</p>
          <button data-action="photo-credits" onClick={() => void copyCredits()}>
            {copied ? t('photo.credits.copied') : t('photo.credits.copy')}
          </button>
        </section>
      )}
    </>
  )
}
