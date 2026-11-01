import { useCallback, useEffect, useState } from 'react'
import type { VersionInfo } from '../../../preload'
import { useEditor } from '@/store/editor'
import { useVersions } from '@/store/versions'
import { useCompare } from '@/store/compare'
import { compareWithFile } from '@/compareActions'
import { formatDateTime } from '@/formatDate'
import { openVersionAsCopy, readVersionDocument, restoreVersion, saveNamedVersion } from '@/versionActions'
import { useT } from '@/i18n'
import type { TrameDocument } from '@/types'
import { PageThumb } from './PageThumb'

const kb = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`)

/**
 * Historique des versions du fichier ouvert : une version est gardée à chaque enregistrement (et l'état d'avant une
 * écrasure), on peut en nommer. On revient à une version (annulable) ou on l'ouvre comme copie.
 */
export function VersionsDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useVersions((s) => s.open)
  const filePath = useEditor((s) => s.filePath)
  const [list, setList] = useState<VersionInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<TrameDocument | null | 'missing'>(null)
  const [label, setLabel] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<VersionInfo[]> => {
    if (!filePath) return []
    const next = await window.trame.listVersions(filePath).catch(() => [])
    setList(next)
    return next
  }, [filePath])

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setPreview(null)
    setLabel('')
    setRenaming(null)
    void refresh().then((next) => setSelected(next[0]?.id ?? null))
  }, [open, refresh])

  useEffect(() => {
    if (!open || !filePath || !selected) {
      setPreview(null)
      return
    }
    let live = true
    setPreview(null)
    void readVersionDocument(filePath, selected).then((doc) => live && setPreview(doc ?? 'missing'))
    return () => {
      live = false
    }
  }, [open, filePath, selected])

  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useVersions.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!open) return null
  const close = (): void => useVersions.getState().setOpen(false)
  const current = list.find((v) => v.id === selected)
  const doc = preview && preview !== 'missing' ? preview : null

  const guard = async (job: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await job()
    } finally {
      setBusy(false)
    }
  }
  const save = (): Promise<void> =>
    guard(async () => {
      if (await saveNamedVersion(label)) {
        setLabel('')
        const next = await refresh()
        setSelected(next[0]?.id ?? null)
      }
    })
  const restore = (): void => {
    if (!doc) return
    restoreVersion(doc)
    close()
  }
  const asCopy = (): Promise<void> =>
    guard(async () => {
      if (doc && current && (await openVersionAsCopy(doc, current.at))) close()
    })
  const remove = (): Promise<void> =>
    guard(async () => {
      if (!filePath || !current) return
      if (!(await window.trame.confirm(t('versions.delete.confirm'), formatDateTime(current.at), t('versions.delete')))) return
      await window.trame.deleteVersion(filePath, current.id)
      const next = await refresh()
      setSelected(next[0]?.id ?? null)
    })
  const rename = (): Promise<void> =>
    guard(async () => {
      if (!filePath || !renaming) return
      await window.trame.labelVersion(filePath, renaming, renameText)
      setRenaming(null)
      await refresh()
    })

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('versions.title')}>
      <div className="modal wide versions-dialog">
        <h3>{t('versions.title')}</h3>
        {!filePath ? (
          <>
            <p data-versions-unsaved>{t('versions.unsaved')}</p>
            <div className="row end">
              <button data-action="versions-close" onClick={close}>{t('common.close')}</button>
              <button data-action="versions-compare-file" onClick={() => (close(), void compareWithFile())}>{t('compare.menu')}</button>
              <button className="primary" data-action="versions-save-first" onClick={() => void guard(async () => void (await saveNamedVersion('')))}>{t('versions.saveFirst')}</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">{t('versions.how')}</p>
            <div className="row">
              <input
                type="text"
                data-field="versionLabel"
                value={label}
                maxLength={80}
                placeholder={t('versions.label.placeholder')}
                aria-label={t('versions.label')}
                disabled={busy}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void save()}
              />
              <button data-action="versions-snapshot" onClick={() => void save()} disabled={busy}>{t('versions.snapshot')}</button>
            </div>
            {list.length === 0 ? (
              <p className="hint" data-versions-empty>{t('versions.empty')}</p>
            ) : (
              <div className="versions-body">
                <ul className="versions-list" data-versions-list>
                  {list.map((v) => (
                    <li key={v.id}>
                      {renaming === v.id ? (
                        <span className="row">
                          <input
                            type="text"
                            autoFocus
                            data-field="versionRename"
                            value={renameText}
                            maxLength={80}
                            aria-label={t('versions.label')}
                            onChange={(e) => setRenameText(e.target.value)}
                            onKeyDown={(e) => (e.key === 'Enter' ? void rename() : e.key === 'Escape' && (e.stopPropagation(), setRenaming(null)))}
                          />
                          <button onClick={() => void rename()}>{t('common.ok')}</button>
                        </span>
                      ) : (
                        <button className={`version-row${v.id === selected ? ' on' : ''}`} data-version={v.id} aria-pressed={v.id === selected} onClick={() => setSelected(v.id)}>
                          <strong>{v.label ?? formatDateTime(v.at)}</strong>
                          <span className="hint">
                            {v.label ? `${formatDateTime(v.at)} · ` : ''}
                            {t('versions.pages', { count: v.pages })} · {kb(v.bytes)}
                            {v.manual ? '' : ` · ${t('versions.auto')}`}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="versions-preview" data-versions-preview>
                  {doc ? <PageThumb page={doc.pages[0]} width={doc.width} height={doc.height} maxW={240} maxH={200} /> : <span className="hint">{preview === 'missing' ? t('versions.missing') : '…'}</span>}
                  {current && <div className="hint">{t('versions.preview.first')}</div>}
                </div>
              </div>
            )}
            <div className="row end wrap">
              <button data-action="versions-close" onClick={close} disabled={busy}>{t('common.close')}</button>
              <button data-action="versions-compare-file" disabled={busy} onClick={() => (close(), void compareWithFile())}>{t('compare.menu')}</button>
              <button data-action="versions-rename" disabled={busy || !current} onClick={() => current && (setRenaming(current.id), setRenameText(current.label ?? ''))}>{t('versions.rename')}</button>
              <button data-action="versions-delete" disabled={busy || !current} onClick={() => void remove()}>{t('versions.delete')}</button>
              <button data-action="versions-compare" disabled={busy || !doc} onClick={() => doc && current && (useCompare.getState().start({ doc, label: current.label ?? formatDateTime(current.at) }), close())}>{t('versions.compare')}</button>
              <button data-action="versions-copy" disabled={busy || !doc} onClick={() => void asCopy()}>{t('versions.copy')}</button>
              <button className="primary" data-action="versions-restore" disabled={busy || !doc} onClick={restore}>{t('versions.restore')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
