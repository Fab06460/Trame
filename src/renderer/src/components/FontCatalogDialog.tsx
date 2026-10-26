import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogFont, FontsFailure } from '../../../preload'
import { bytesOfBase64, extraFonts, registerExtraFont, unregisterExtraFont } from '@/fonts'
import { useFonts } from '@/store/fonts'

const CATEGORIES: Array<[string, string]> = [
  ['', 'Toutes'],
  ['sans-serif', 'Sans'],
  ['serif', 'Serif'],
  ['display', 'Titre'],
  ['handwriting', 'Manuscrite'],
  ['monospace', 'Mono']
]
const SAMPLE = 'Portez ce vieux whisky au juge blond qui fume — 0123456789'
const MAX_ROWS = 80

const messageOf = (f: FontsFailure): string =>
  f.error === 'offline' ? 'Impossible de joindre le catalogue de polices. Vérifiez votre connexion : Trame continue de fonctionner hors ligne avec les polices déjà installées.' : f.error === 'rate-limit' ? 'Trop de requêtes : réessayez dans quelques minutes.' : 'Le catalogue de polices ne répond pas correctement. Réessayez plus tard.'

/** Catalogue de polices en ligne (Google Fonts via Fontsource) : recherche, aperçu, installation. Une police installée reste utilisable hors ligne. */
export function FontCatalogDialog(): React.JSX.Element | null {
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
    setNote(`« ${f.name} » est installée : elle apparaît dans la liste des polices et fonctionne hors ligne.`)
  }

  const remove = async (id: string): Promise<void> => {
    await window.trame.removeFont(id)
    unregisterExtraFont(id)
    setNote('Police retirée. Les textes qui l\'utilisent encore s\'affichent avec une police de remplacement.')
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Polices en ligne" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal wide">
        <h3>Polices en ligne</h3>
        <p className="hint">Catalogue Google Fonts (via Fontsource), polices libres. La recherche n'envoie que ce service ; une police installée est copiée sur ce poste et dans les documents qui l'utilisent.</p>
        {error && (
          <div className="warn" role="status" data-fonts-error={error.error}>
            {messageOf(error)}
            {error.detail && <small className="detail">Détail technique : {error.detail}</small>}
          </div>
        )}
        {fonts && (
          <>
            {stale && <p className="hint">Catalogue enregistré lors d'une précédente connexion (hors ligne : l'installation de nouvelles polices est impossible).</p>}
            <div className="row">
              <input data-field="fontQuery" type="search" placeholder="Rechercher une police (ex. : roboto)" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            <div className="chips" role="group" aria-label="Catégorie">
              {CATEGORIES.map(([value, label]) => (
                <button key={value || 'all'} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="font-list" data-font-list>
              {shown.map((f) => (
                <button key={f.id} className={`font-row ${selected?.id === f.id ? 'active' : ''}`} data-font={f.id} onClick={() => void preview(f)}>
                  <span>{f.name}</span>
                  <em>{installedIds.has(f.id) ? 'installée ✓' : f.variants.length > 2 ? 'gras, italique' : f.variants.includes('700') ? 'gras' : f.variants.some((v) => v.endsWith('italic')) ? 'italique' : ''}</em>
                </button>
              ))}
              {shown.length === 0 && <p className="hint">Aucune police ne correspond.</p>}
              {shown.length === MAX_ROWS && <p className="hint">Affinez la recherche pour voir d'autres polices.</p>}
            </div>
            {selected && (
              <div className="font-preview" data-font-preview={selected.id}>
                <div style={{ fontFamily: previewFamily ? `"${previewFamily}", ${selected.category === 'serif' ? 'serif' : 'sans-serif'}` : undefined }}>
                  <div className="sample big">{selected.name}</div>
                  <div className="sample">{SAMPLE}</div>
                </div>
                <div className="row">
                  {installedIds.has(selected.id) ? (
                    <button data-action="font-remove" onClick={() => void remove(selected.id)}>Retirer cette police</button>
                  ) : (
                    <button className="primary" data-action="font-install" disabled={busy !== null || stale} onClick={() => void install(selected)}>
                      {busy === selected.id ? 'Installation…' : 'Installer'}
                    </button>
                  )}
                  <span className="hint">{selected.license}</span>
                </div>
              </div>
            )}
          </>
        )}
        {!fonts && !error && <p className="hint" role="status">Chargement du catalogue…</p>}
        {note && <p className="hint" role="status" data-font-note>{note}</p>}
        <div className="row end">
          <button data-action="fonts-close" onClick={close}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
