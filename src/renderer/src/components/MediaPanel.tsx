import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { allTags, normalizeTag, searchMedia, type MediaItem } from '@shared/mediaLibrary'
import { insertImage } from '@/clipboardActions'
import { mediaThumb } from '@/mediaThumbs'
import { downscaleImage } from '@/photoImport'
import { useT } from '@/i18n'

interface Listing {
  folder: string | null
  items: MediaItem[]
  truncated: boolean
  missing: boolean
}

/** Vignette chargée quand elle devient visible (la liste peut compter des milliers d'images). */
function Thumb({ item }: { item: MediaItem }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      void mediaThumb(item.path, String(item.size)).then((url) => alive && setSrc(url))
    })
    observer.observe(el)
    return () => {
      alive = false
      observer.disconnect()
    }
  }, [item.path, item.size])
  return <span ref={ref} className="media-thumb">{src && <img src={src} alt="" draggable={false} />}</span>
}

/** « Ma bibliothèque » : les images d'un dossier choisi (rien n'est copié), avec recherche et étiquettes. Un clic insère l'image. */
export function MediaPanel(): React.JSX.Element {
  const t = useT()
  const [listing, setListing] = useState<Listing | null>(null)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [failed, setFailed] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => setListing(await window.trame.listMedia()), [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const items = listing?.items ?? []
  const shown = useMemo(() => searchMedia(items, query, tag), [items, query, tag])
  const tags = useMemo(() => allTags(items), [items])
  const folderName = listing?.folder ? listing.folder.split(/[\\/]/).filter(Boolean).pop() : ''

  const choose = async (): Promise<void> => {
    if (await window.trame.chooseMediaFolder()) {
      setTag(null)
      setQuery('')
      setEditing(null)
      await refresh()
    }
  }
  const forget = async (): Promise<void> => {
    await window.trame.forgetMediaFolder()
    setEditing(null)
    await refresh()
  }
  const insert = async (item: MediaItem): Promise<void> => {
    setFailed(null)
    const data = await window.trame.readMedia(item.path)
    if (!data) return setFailed(item.name)
    try {
      await insertImage(await downscaleImage(data))
    } catch {
      setFailed(item.name)
    }
  }
  const saveTags = async (item: MediaItem, next: string[]): Promise<void> => {
    const saved = await window.trame.setMediaTags(item.path, next)
    setListing((l) => l && { ...l, items: l.items.map((m) => (m.path === item.path ? { ...m, tags: saved } : m)) })
    if (tag && !saved.some((s) => s.toLowerCase() === tag.toLowerCase()) && !allTags(items.map((m) => (m.path === item.path ? { ...m, tags: saved } : m))).some((a) => a.tag.toLowerCase() === tag.toLowerCase())) setTag(null)
  }
  const editedItem = items.find((m) => m.path === editing)

  if (!listing) return <section />
  if (!listing.folder)
    return (
      <section data-media="empty">
        <h3>{t('media.mode.library')}</h3>
        <p className="hint">{t('media.intro')}</p>
        <button className="wide" data-media-choose onClick={() => void choose()}>{t('media.choose')}</button>
      </section>
    )
  return (
    <section data-media="folder">
      <h3 title={listing.folder}>{folderName}</h3>
      <div className="row">
        <button type="button" data-media-choose onClick={() => void choose()}>{t('media.change')}</button>
        <button type="button" data-media-refresh onClick={() => void refresh()}>{t('media.refresh')}</button>
        <button type="button" data-media-forget onClick={() => void forget()}>{t('media.forget')}</button>
      </div>
      {listing.missing ? (
        <p className="hint" data-media-missing>{t('media.missing')}</p>
      ) : (
        <>
          <input type="search" className="text-field" data-field="mediaQuery" placeholder={t('media.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {tags.length > 0 && (
            <div className="media-tags" data-media-tags>
              <button type="button" className={`tag${tag === null ? ' active' : ''}`} onClick={() => setTag(null)}>{t('media.tags.all')}</button>
              {tags.map((x) => (
                <button key={x.tag} type="button" className={`tag${tag?.toLowerCase() === x.tag.toLowerCase() ? ' active' : ''}`} data-media-tag={x.tag} onClick={() => setTag(x.tag)}>
                  {x.tag} <small>{x.count}</small>
                </button>
              ))}
            </div>
          )}
          <p className="hint" data-media-count={shown.length}>
            {t('media.count', { count: shown.length })}
            {listing.truncated ? ` — ${t('media.truncated', { count: items.length })}` : ''}
          </p>
          {failed && <p className="warn" role="status">{t('media.err', { name: failed })}</p>}
          {items.length === 0 ? (
            <p className="empty">{t('media.empty')}</p>
          ) : shown.length === 0 ? (
            <p className="empty">{t('media.none')}</p>
          ) : (
            <div className="grid media-grid" data-media-grid>
              {shown.map((m) => (
                <div key={m.path} className={`card media-cell${editing === m.path ? ' editing' : ''}`} data-media-item={m.path}>
                  <button type="button" className="media-open" title={`${t('media.insert')} — ${m.path}`} onClick={() => void insert(m)}>
                    <Thumb item={m} />
                    <span className="media-name">{m.name}</span>
                  </button>
                  <button type="button" className="media-edit" data-media-edit title={t('media.tags.title', { name: m.name })} aria-pressed={editing === m.path} onClick={() => { setEditing(editing === m.path ? null : m.path); setNewTag('') }}>
                    #{m.tags.length > 0 ? m.tags.length : ''}
                  </button>
                </div>
              ))}
            </div>
          )}
          {editedItem && (
            <div className="media-tag-editor" data-media-editor>
              <strong>{t('media.tags.title', { name: editedItem.name })}</strong>
              <div className="media-tags">
                {editedItem.tags.map((x) => (
                  <button key={x} type="button" className="tag" data-media-untag={x} title={t('media.tags.remove', { tag: x })} onClick={() => void saveTags(editedItem, editedItem.tags.filter((y) => y !== x))}>
                    {x} ✕
                  </button>
                ))}
              </div>
              <input
                className="text-field"
                autoFocus
                data-field="mediaNewTag"
                placeholder={t('media.tags.add')}
                value={newTag}
                maxLength={40}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation() // pas de raccourcis de l'éditeur pendant la saisie
                  if (e.key === 'Enter' && normalizeTag(newTag)) {
                    void saveTags(editedItem, [...editedItem.tags, newTag])
                    setNewTag('')
                  } else if (e.key === 'Escape') setEditing(null)
                }}
              />
              <button type="button" onClick={() => setEditing(null)}>{t('media.tags.done')}</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
