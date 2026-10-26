import { useState } from 'react'
import type { PhotoError, PhotoView } from '../../../preload'
import { insertImage } from '@/clipboardActions'
import { documentCredits, downscaleImage } from '@/photoImport'
import { useEditor } from '@/store/editor'

const MESSAGES: Record<PhotoError, string> = {
  offline: 'Impossible de joindre le service de photos. Vérifiez votre connexion : Trame continue de fonctionner hors ligne.',
  'rate-limit': 'Trop de recherches pour le moment : réessayez dans quelques minutes.',
  unavailable: 'Le service de photos ne répond pas correctement. Réessayez plus tard.'
}

/** Recherche de photos libres de droits (Openverse). Seule fonction en ligne de Trame : elle ne s'active que sur demande. */
export function PhotosPanel(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [photos, setPhotos] = useState<PhotoView[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PhotoError | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const doc = useEditor((s) => s.doc)
  const credits = documentCredits(doc)

  const search = async (q: string, p: number): Promise<void> => {
    if (!q.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await window.trame.searchPhotos(q, p)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setAsked(q)
    setPage(res.page)
    setPageCount(res.pageCount)
    setPhotos((prev) => (p === 1 ? res.photos : [...prev, ...res.photos.filter((n) => !prev.some((o) => o.id === n.id))]))
  }

  const insert = async (photo: PhotoView): Promise<void> => {
    if (importing) return
    setImporting(photo.id)
    setError(null)
    const res = await window.trame.importPhoto(photo.id)
    if (!res.ok) {
      setImporting(null)
      return setError(res.error)
    }
    try {
      await insertImage(await downscaleImage(res.dataUrl), { credit: res.credit, name: (res.title || photo.title || 'Photo').slice(0, 80) })
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
        <h3>Photos libres de droits</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void search(query, 1)
          }}
        >
          <input data-field="photoQuery" type="search" placeholder="Rechercher (ex. : montagne)" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
          <button type="submit" data-action="photo-search" disabled={busy || !query.trim()}>
            {busy && page === 1 ? '…' : 'Chercher'}
          </button>
        </form>
        <p className="hint">
          Recherche en ligne via Openverse (openverse.org) : votre requête est envoyée à ce service, et à lui seul. Photos réutilisables, y compris à titre commercial. La photo choisie est copiée dans le document, qui reste utilisable hors ligne.
        </p>
        {error && (
          <div className="warn" role="status" data-photo-error={error}>
            {MESSAGES[error]}
          </div>
        )}
      </section>

      {photos.length > 0 && (
        <section>
          <h3>Résultats pour « {asked} »</h3>
          <div className="grid photos">
            {photos.map((p) => (
              <button
                key={p.id}
                className="photo"
                data-photo={p.id}
                disabled={importing !== null}
                title={`${p.title || 'Sans titre'}${p.creator ? ' — ' + p.creator : ''} · ${p.license}\nCliquer pour insérer`}
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
              {busy ? 'Chargement…' : 'Plus de résultats'}
            </button>
          )}
        </section>
      )}

      {photos.length === 0 && asked && !busy && !error && <p className="hint">Aucun résultat pour « {asked} ».</p>}

      {credits.length > 0 && (
        <section>
          <h3>Crédits</h3>
          <p className="hint">{credits.length} photo{credits.length > 1 ? 's' : ''} de ce document demande{credits.length > 1 ? 'nt' : ''} d'être créditée{credits.length > 1 ? 's' : ''} ou le recommande{credits.length > 1 ? 'nt' : ''}.</p>
          <button data-action="photo-credits" onClick={() => void copyCredits()}>
            {copied ? 'Copié !' : 'Copier les crédits'}
          </button>
        </section>
      )}
    </>
  )
}
