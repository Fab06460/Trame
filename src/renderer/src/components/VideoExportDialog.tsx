import { useEffect, useRef, useState } from 'react'
import { fileSafeName } from '@/docName'
import { chooseCodec, exportVideo, VideoCancelled, videoSupported, type VideoFormat, type VideoResult } from '@/videoExport'
import { DEFAULT_VIDEO, FPS_CHOICES, MAX_SECONDS, MIN_SECONDS, SIZE_CHOICES, totalSeconds, videoProblem, videoSize, type VideoOptions } from '@/videoTimeline'
import { useEditor } from '@/store/editor'
import { useVideoExport } from '@/store/videoExport'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

export function VideoExportDialog(): React.JSX.Element | null {
  const open = useVideoExport((s) => s.open)
  return open ? <Dialog onClose={() => useVideoExport.getState().setOpen(false)} /> : null
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

type Status = 'idle' | 'working' | 'ready'

function Dialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const [options, setOptions] = useState<VideoOptions>(DEFAULT_VIDEO)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 1 })
  const [result, setResult] = useState<VideoResult | null>(null)
  const [note, setNote] = useState('')
  const [format, setFormat] = useState<VideoFormat | null | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)

  const size = videoSize(doc, options.longSide)
  const problem = videoProblem(doc, options)
  // le format réellement disponible sur cet ordinateur pour cette taille
  useEffect(() => {
    let live = true
    setFormat(undefined)
    void chooseCodec(size.width, size.height, options.fps).then((c) => live && setFormat(c ? c.format : null))
    return () => {
      live = false
    }
  }, [size.width, size.height, options.fps])

  const patch = (p: Partial<VideoOptions>): void => setOptions((o) => ({ ...o, ...p }))
  const busy = status === 'working'

  const save = async (r: VideoResult): Promise<void> => {
    const path = await window.trame.saveExportBytes(r.bytes, `${fileSafeName(doc.name)}.${r.format}`)
    if (path) onClose()
    else setNote(t('video.saveCancelled'))
  }

  const start = async (): Promise<void> => {
    setNote('')
    setResult(null)
    setStatus('working')
    setProgress({ done: 0, total: 1 })
    const controller = new AbortController()
    abort.current = controller
    try {
      const r = await exportVideo(doc, options, (done, total) => setProgress({ done, total }), controller.signal)
      setResult(r)
      setStatus('ready')
      await save(r)
    } catch (err) {
      setStatus('idle')
      if (!(err instanceof VideoCancelled)) setNote(t('video.error', { detail: err instanceof Error ? err.message : String(err) }))
    } finally {
      abort.current = null
    }
  }

  const close = (): void => {
    abort.current?.abort()
    onClose()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('video.title')} data-video-dialog onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close() }}>
      <div className="modal wide video-dialog">
        <h3>{t('video.title')}</h3>
        <p className="hint">{t('video.hint')}</p>
        <div className="video-fields">
          <label>
            {t('video.seconds')}
            <input type="number" data-field="videoSeconds" min={MIN_SECONDS} max={MAX_SECONDS} step={1} disabled={busy} value={options.secondsPerPage} onChange={(e) => patch({ secondsPerPage: Number(e.target.value) })} />
          </label>
          <label>
            {t('video.size')}
            <select data-field="videoSize" disabled={busy} value={options.longSide} onChange={(e) => patch({ longSide: Number(e.target.value) as VideoOptions['longSide'] })}>
              {SIZE_CHOICES.map((s) => {
                const v = videoSize(doc, s)
                return <option key={s} value={s}>{t(`video.size.${s}` as MessageKey)} — {v.width} × {v.height}</option>
              })}
            </select>
          </label>
          <label>
            {t('video.fps')}
            <select data-field="videoFps" disabled={busy} value={options.fps} onChange={(e) => patch({ fps: Number(e.target.value) as VideoOptions['fps'] })}>
              {FPS_CHOICES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" data-field="videoEffects" disabled={busy} checked={options.effects} onChange={(e) => patch({ effects: e.target.checked })} /> {t('video.effects')}
          </label>
        </div>

        {!videoSupported() || format === null ? (
          <p className="warn" role="alert" data-video-unsupported>{t('video.noEncoder')}</p>
        ) : problem ? (
          <p className="warn" role="alert" data-video-problem={problem}>{t(`video.problem.${problem}` as MessageKey, { max: MAX_SECONDS })}</p>
        ) : (
          <p className="hint" data-video-summary>
            {format ? t('video.summary', { format: t(`video.format.${format}` as MessageKey), w: size.width, h: size.height, duration: clock(totalSeconds(doc, options)) }) : t('video.probing')}
            {' · '}
            {t('video.noSound')}
          </p>
        )}

        {busy && (
          <div className="video-progress" role="status" data-video-progress>
            <progress value={progress.done} max={progress.total} />
            <span>{t('video.progress', { done: progress.done, total: progress.total })}</span>
          </div>
        )}
        {note && <p className="hint" role="status" data-video-note>{note}</p>}

        <div className="row video-footer">
          <button data-action="video-cancel" onClick={close}>{busy ? t('video.stop') : t('common.cancel')}</button>
          {status === 'ready' && result ? (
            <button className="primary" data-action="video-save" onClick={() => void save(result)}>{t('video.save')}</button>
          ) : (
            <button className="primary" data-action="video-start" disabled={busy || !!problem || !format} onClick={() => void start()}>{t('video.start')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
