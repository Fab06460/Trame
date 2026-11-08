import { useEffect, useRef, useState } from 'react'
import { fileSafeName } from '@/docName'
import { chooseCodec, exportVideo, VideoCancelled, videoSupported, type VideoFormat, type VideoResult } from '@/videoExport'
import { DEFAULT_MUSIC, decodeAudio, MAX_AUDIO_SECONDS, type DecodedAudio, type MusicOptions } from '@/audioTrack'
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
  /** musique de fond choisie (fichier décodé) et ses réglages */
  const [music, setMusic] = useState<{ name: string; audio: DecodedAudio } | null>(null)
  const [musicOptions, setMusicOptions] = useState<MusicOptions>(DEFAULT_MUSIC)
  const [musicProblem, setMusicProblem] = useState<MessageKey | null>(null)

  const size = videoSize(doc, options.longSide)
  const hasClips = doc.pages.some((p) => p.elements.some((e) => e.video && !e.hidden))
  const hasVoices = doc.pages.some((p) => !!p.voice && !!doc.voices?.[p.voice.id])
  const clipsSound = doc.pages.some((p) => p.elements.some((e) => e.video && !e.hidden && !e.video.muted && (e.video.volume ?? 1) > 0))
  const problem = videoProblem(doc, options)
  const soundParts: MessageKey[] = [...(music ? (['video.withMusic'] as const) : []), ...(hasVoices ? (['video.withVoice'] as const) : []), ...(clipsSound ? (['video.withClipSound'] as const) : [])]
  const customPages = doc.pages.filter((p) => p.seconds !== undefined).length
  // le format réellement disponible sur cet ordinateur pour cette taille
  useEffect(() => {
    let live = true
    setFormat(undefined)
    void chooseCodec(size.width, size.height, options.fps, !!music).then((c) => live && setFormat(c ? c.format : null))
    return () => {
      live = false
    }
  }, [size.width, size.height, options.fps, music])

  const chooseMusic = async (): Promise<void> => {
    setMusicProblem(null)
    const picked = await window.trame.pickAudio()
    if (!picked) return
    if ('error' in picked) return setMusicProblem(picked.error === 'tooBig' ? 'video.music.tooBig' : 'video.music.unreadable')
    try {
      const audio = await decodeAudio(picked.bytes)
      if (audio.seconds > MAX_AUDIO_SECONDS) return setMusicProblem('video.music.tooLong')
      setMusic({ name: picked.name, audio })
    } catch {
      setMusicProblem('video.music.unreadable')
    }
  }

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
      const r = await exportVideo(doc, options, (done, total) => setProgress({ done, total }), controller.signal, music ? { audio: music.audio, options: musicOptions } : undefined)
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
          {hasClips && (
            <label className="check">
              <input type="checkbox" data-field="videoFitClips" disabled={busy} checked={options.fitClips} onChange={(e) => patch({ fitClips: e.target.checked })} /> {t('video.fitClips')}
            </label>
          )}
          {hasVoices && (
            <label className="check">
              <input type="checkbox" data-field="videoFitVoices" disabled={busy} checked={options.fitVoices} onChange={(e) => patch({ fitVoices: e.target.checked })} /> {t('video.fitVoices')}
            </label>
          )}
          <label className="check">
            <input type="checkbox" data-field="videoEffects" disabled={busy} checked={options.effects} onChange={(e) => patch({ effects: e.target.checked })} /> {t('video.effects')}
          </label>
        </div>
        {customPages > 0 && <p className="hint" data-video-custom>{t('video.customSeconds', { count: customPages })}</p>}

        <fieldset className="video-music" data-video-music disabled={busy}>
          <legend>{t('video.music')}</legend>
          {music ? (
            <>
              <p className="hint" data-video-music-name>{t('video.music.info', { name: music.name, duration: clock(music.audio.seconds) })}</p>
              <div className="row">
                <label>
                  {t('video.music.volume')}
                  <input type="range" data-field="videoVolume" min={0} max={1} step={0.05} value={musicOptions.volume} onChange={(e) => setMusicOptions({ ...musicOptions, volume: Number(e.target.value) })} />
                  <span className="hint">{Math.round(musicOptions.volume * 100)} %</span>
                </label>
                <label className="check">
                  <input type="checkbox" data-field="videoFade" checked={musicOptions.fade} onChange={(e) => setMusicOptions({ ...musicOptions, fade: e.target.checked })} /> {t('video.music.fade')}
                </label>
              </div>
              <div className="row">
                <button data-action="video-music-pick" onClick={() => void chooseMusic()}>{t('video.music.change')}</button>
                <button data-action="video-music-remove" onClick={() => setMusic(null)}>{t('video.music.remove')}</button>
              </div>
              {hasVoices && (
                <label className="check">
                  <input type="checkbox" data-field="videoDuck" checked={options.duckMusic} onChange={(e) => patch({ duckMusic: e.target.checked })} /> {t('video.music.duck')}
                </label>
              )}
              <p className="hint">{t('video.music.hint')}</p>
            </>
          ) : (
            <button data-action="video-music-pick" onClick={() => void chooseMusic()}>{t('video.music.pick')}</button>
          )}
          {musicProblem && <p className="warn" role="alert" data-video-music-problem>{t(musicProblem, { max: Math.round(MAX_AUDIO_SECONDS / 60) })}</p>}
        </fieldset>

        {!videoSupported() || format === null ? (
          <p className="warn" role="alert" data-video-unsupported>{t('video.noEncoder')}</p>
        ) : problem ? (
          <p className="warn" role="alert" data-video-problem={problem}>{t(`video.problem.${problem}` as MessageKey, { max: MAX_SECONDS })}</p>
        ) : (
          <p className="hint" data-video-summary>
            {format ? t('video.summary', { format: t(`video.format.${format}` as MessageKey), w: size.width, h: size.height, duration: clock(totalSeconds(doc, options)) }) : t('video.probing')}
            {' · '}
            {soundParts.length ? soundParts.map((k) => t(k)).join(', ') : t('video.noSound')}
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
