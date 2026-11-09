import { useEffect, useMemo, useState } from 'react'
import { exportHtml } from '@/htmlActions'
import { clipPayloads, voicePayloads } from '@/htmlExport'
import { useEditor } from '@/store/editor'
import { useHtmlDialog } from '@/store/htmlDialog'
import { useT } from '@/i18n'

/** Au-delà, un fichier HTML devient pénible à envoyer et à ouvrir : la fenêtre le signale. */
const BIG = 100_000_000

const megabytes = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1_000_000))} Mo`

/**
 * Export « Présentation web » d'un document qui porte des clips vidéo ou des voix off : ils sont embarqués dans le fichier (qui reste
 * autonome) et jouent dans le navigateur ; décochés, les clips restent leur image d'aperçu et les pages sont muettes.
 */
export function HtmlExportDialog(): React.JSX.Element | null {
  const t = useT()
  const open = useHtmlDialog((s) => s.open)
  const doc = useEditor((s) => s.doc)
  const [withClips, setWithClips] = useState(true)
  const [withVoices, setWithVoices] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const clips = useMemo(() => (open ? Object.values(clipPayloads(doc)) : []), [open, doc])
  const voices = useMemo(() => (open ? Object.values(voicePayloads(doc)) : []), [open, doc])
  const bytes = (withClips ? clips : []).concat(withVoices ? voices : []).reduce((n, c) => n + c.data.length, 0)

  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useHtmlDialog.getState().setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!open) return null
  const close = (): void => useHtmlDialog.getState().setOpen(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    setMessage('')
    try {
      if (await exportHtml(doc, { clips: withClips && clips.length > 0, voices: withVoices && voices.length > 0 })) close()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('export.html')} data-html-dialog>
      <div className="modal">
        <h3>{t('export.html')}</h3>
        <p className="hint">{t('html.clips.hint')}</p>
        {clips.length > 0 && (
          <label className="choice-row">
            <input type="checkbox" data-field="htmlClips" checked={withClips} disabled={busy} onChange={(e) => setWithClips(e.target.checked)} /> {t('html.clips.include', { count: clips.length })}
          </label>
        )}
        {voices.length > 0 && (
          <label className="choice-row">
            <input type="checkbox" data-field="htmlVoices" checked={withVoices} disabled={busy} onChange={(e) => setWithVoices(e.target.checked)} /> {t('html.voices.include', { count: voices.length })}
          </label>
        )}
        <p data-html-size={bytes}>{bytes > 0 ? t('html.clips.size', { size: megabytes(bytes) }) : t('html.clips.without')}</p>
        {bytes > BIG && <div className="warn" role="status" data-html-big>{t('html.clips.big')}</div>}
        {message && <div className="warn" role="status" data-html-message>{message}</div>}
        <div className="row end">
          <button data-action="html-close" onClick={close} disabled={busy}>{t('common.cancel')}</button>
          <button className="primary" data-action="html-export" onClick={() => void run()} disabled={busy}>{t('export.button')}</button>
        </div>
      </div>
    </div>
  )
}
