import { useEffect, useRef, useState } from 'react'
import { InfoTip } from './InfoTip'
import { useT } from '@/i18n'
import { insertImage } from '@/clipboardActions'
import { clipResultMessage, insertClipBytes } from '@/clipActions'
import { useCapture } from '@/store/capture'
import { CAPTURE_MAX_BYTES, clockLabel, cropImage, startScreenRecording, zoneBetween, type Rect, type RecordProblem, type ScreenRecorder } from '@/screenCapture'
import type { CaptureSource, CaptureStill } from '@shared/capture'
import type { MessageKey } from '@shared/i18n'

const KEY = 'trame.capture'
const COUNTDOWN = 3

interface Saved {
  hide: boolean
  mic: boolean
}
function saved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { hide: v.hide !== false, mic: v.mic === true }
  } catch {
    return { hide: true, mic: false }
  }
}

type Stage =
  | { name: 'list' }
  | { name: 'busy' }
  | { name: 'zone'; still: CaptureStill }
  | { name: 'countdown'; left: number }
  | { name: 'recording' }
  | { name: 'saving' }

const PROBLEMS: Record<RecordProblem, MessageKey> = {
  denied: 'capture.err.denied',
  unsupported: 'capture.err.unsupported',
  micDenied: 'capture.err.micDenied',
  noMic: 'capture.err.noMic',
  failed: 'capture.err.failed'
}

/** Fenêtre « Capture d'écran » : choisir un écran ou une fenêtre, puis en faire une image (avec une zone facultative) ou une vidéo. */
export function CaptureDialog(): React.JSX.Element | null {
  const mode = useCapture((s) => s.mode)
  return mode ? <Dialog initial={mode} /> : null
}

function Dialog({ initial }: { initial: 'image' | 'video' }): React.JSX.Element {
  const t = useT()
  const [mode, setMode] = useState(initial)
  const [sources, setSources] = useState<CaptureSource[] | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [denied, setDenied] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [options, setOptions] = useState(saved)
  const [stage, setStage] = useState<Stage>({ name: 'list' })
  const [seconds, setSeconds] = useState(0)
  const [zone, setZone] = useState<Rect | null>(null)
  const recorder = useRef<ScreenRecorder | null>(null)
  const alive = useRef(true)
  const stopping = useRef(false)

  const busy = stage.name === 'countdown' || stage.name === 'recording' || stage.name === 'saving'
  const close = (): void => useCapture.getState().close()

  const load = async (): Promise<void> => {
    setSources(null)
    setError(null)
    const res = await window.trame.captureSources()
    if (!alive.current) return
    if ('error' in res) {
      setDenied(res.error === 'denied')
      setError(res.error === 'denied' ? 'capture.err.denied' : 'capture.err.failed')
      setSources([])
      return
    }
    setDenied(false)
    setSources(res.sources)
    setPicked((p) => (p && res.sources.some((s) => s.id === p) ? p : (res.sources[0]?.id ?? null)))
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      recorder.current?.cancel()
      recorder.current = null
    }
  }, [])

  const remember = (next: Saved): void => {
    setOptions(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* le choix vaut pour cette fenêtre */
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!busy) close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy])

  // arrêt demandé de l'extérieur (témoin de la barre de menus, raccourci) pendant l'enregistrement
  useEffect(() => window.trame.onCaptureStop(() => void finish()), [])

  // minuteur : le temps écoulé, dans la fenêtre et dans le témoin de la barre de menus
  useEffect(() => {
    if (stage.name !== 'recording') return
    const timer = setInterval(() => {
      const s = recorder.current?.elapsed() ?? 0
      setSeconds(s)
      window.trame.captureTick(clockLabel(s))
    }, 500)
    return () => clearInterval(timer)
  }, [stage.name])

  const fail = (key: MessageKey): void => {
    setError(key)
    setStage({ name: 'list' })
  }

  const shoot = async (): Promise<void> => {
    if (!picked) return
    setError(null)
    setStage({ name: 'busy' })
    const isScreen = sources?.find((s) => s.id === picked)?.kind === 'screen'
    const res = await window.trame.captureStill(picked, options.hide && isScreen)
    if (!alive.current) return
    if ('error' in res) {
      setDenied(res.error === 'denied')
      return fail(res.error === 'denied' ? 'capture.err.denied' : 'capture.err.failed')
    }
    setZone(null)
    setStage({ name: 'zone', still: res })
  }

  const insertStill = async (still: CaptureStill): Promise<void> => {
    try {
      const src = await cropImage(still.dataUrl, zone)
      await insertImage(src, { name: t('capture.image.name') })
      close()
    } catch {
      fail('capture.err.failed')
    }
  }

  const record = async (): Promise<void> => {
    if (!picked) return
    setError(null)
    // compte à rebours : le temps de se préparer (et de changer de fenêtre si la fenêtre de Trame ne se réduit pas)
    for (let left = COUNTDOWN; left > 0; left--) {
      setStage({ name: 'countdown', left })
      await new Promise((r) => setTimeout(r, 1000))
      if (!alive.current) return
    }
    if (!(await window.trame.captureArm(picked))) return fail('capture.err.failed')
    const isScreen = sources?.find((s) => s.id === picked)?.kind === 'screen'
    const res = await startScreenRecording(options.mic, () => void finish())
    if (!alive.current) return
    if ('error' in res) {
      setDenied(res.error === 'denied')
      return fail(PROBLEMS[res.error])
    }
    recorder.current = res
    stopping.current = false
    setSeconds(0)
    setStage({ name: 'recording' })
    await window.trame.captureStarted(options.hide && isScreen)
  }

  const finish = async (): Promise<void> => {
    const rec = recorder.current
    if (!rec || stopping.current) return
    stopping.current = true
    recorder.current = null
    setStage({ name: 'saving' })
    const out = await rec.stop()
    await window.trame.captureEnded()
    if (!alive.current) return
    if ('error' in out) return fail('capture.err.failed')
    const result = await insertClipBytes(out.bytes, 'video/webm')
    if (!alive.current) return
    const message = clipResultMessage(result)
    if (message) return fail(message)
    close()
    if (out.full) void window.trame.showInfo(t('capture.title'), t('capture.full', { mb: Math.round(CAPTURE_MAX_BYTES / 1_000_000) }))
  }

  const go = (): void => void (mode === 'image' ? shoot() : record())
  const kinds: Array<CaptureSource['kind']> = ['screen', 'window']

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('capture.title')} data-capture-dialog data-capture-state={stage.name} onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide capture-dialog">
        <h3>{t('capture.title')}<InfoTip>{t('capture.hint')}</InfoTip></h3>

        {stage.name === 'zone' ? (
          <ZonePicker still={stage.still} zone={zone} onZone={setZone} />
        ) : stage.name === 'recording' || stage.name === 'saving' || stage.name === 'countdown' ? (
          <div className="capture-status" role="status" data-capture-status>
            {stage.name === 'countdown' && <p className="capture-big" data-capture-countdown>{stage.left}</p>}
            {stage.name === 'recording' && (
              <>
                <p className="capture-big"><span className="rec-dot" aria-hidden="true" /> <span data-capture-elapsed>{clockLabel(seconds)}</span></p>
                <p className="hint">{t('capture.recording.hint')}</p>
              </>
            )}
            {stage.name === 'saving' && <p className="hint">{t('capture.saving')}</p>}
          </div>
        ) : (
          <>
            <div className="row" role="radiogroup" aria-label={t('capture.mode')}>
              {(['image', 'video'] as const).map((m) => (
                <label key={m} className="check">
                  <input type="radio" name="captureMode" data-field="captureMode" value={m} checked={mode === m} onChange={() => setMode(m)} /> {t(m === 'image' ? 'capture.mode.image' : 'capture.mode.video')}
                </label>
              ))}
              <button data-action="capture-refresh" onClick={() => void load()} disabled={stage.name === 'busy'}>{t('capture.refresh')}</button>
            </div>
            {sources === null && <p className="hint" role="status">{t('capture.loading')}</p>}
            {sources?.length === 0 && !error && <p className="hint" data-capture-empty>{t('capture.none')}</p>}
            {sources && sources.length > 0 &&
              kinds.map((kind) => {
                const list = sources.filter((s) => s.kind === kind)
                return list.length ? (
                  <fieldset key={kind} className="capture-group">
                    <legend>{t(kind === 'screen' ? 'capture.screens' : 'capture.windows')}</legend>
                    <div className="capture-grid">
                      {list.map((s) => (
                        <button key={s.id} className={`capture-source${picked === s.id ? ' on' : ''}`} data-capture-source={s.id} aria-pressed={picked === s.id} onClick={() => setPicked(s.id)} title={s.name}>
                          <img src={s.thumb} alt="" draggable={false} />
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null
              })}
            <div className="row">
              <label className="check">
                <input type="checkbox" data-field="captureHide" checked={options.hide} onChange={(e) => remember({ ...options, hide: e.target.checked })} /> {t('capture.hide')}
              </label>
              {mode === 'video' && (
                <label className="check">
                  <input type="checkbox" data-field="captureMic" checked={options.mic} onChange={(e) => remember({ ...options, mic: e.target.checked })} /> {t('capture.mic')}
                </label>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="warn" role="alert" data-capture-error>
            {t(error)}
            {denied && (
              <>
                {' '}
                <button data-action="capture-settings" onClick={() => void window.trame.captureOpenSettings()}>{t('capture.openSettings')}</button>
              </>
            )}
          </div>
        )}

        <div className="row end">
          {stage.name === 'recording' ? (
            <button className="primary" data-action="capture-stop" onClick={() => void finish()}>{t('capture.stop')}</button>
          ) : stage.name === 'zone' ? (
            <>
              <button data-action="capture-retake" onClick={() => setStage({ name: 'list' })}>{t('capture.retake')}</button>
              <button className="primary" data-action="capture-insert" onClick={() => void insertStill(stage.still)}>{t(zone ? 'capture.insert.zone' : 'capture.insert')}</button>
            </>
          ) : (
            <>
              <button data-action="capture-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</button>
              <button className="primary" data-action="capture-go" onClick={go} disabled={busy || stage.name === 'busy' || !picked}>
                {t(mode === 'image' ? 'capture.go.image' : 'capture.go.video')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** L'image prise, sur laquelle on trace à la souris la zone à garder (sans zone : toute l'image). */
function ZonePicker({ still, zone, onZone }: { still: CaptureStill; zone: Rect | null; onZone: (z: Rect | null) => void }): React.JSX.Element {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const toImage = (e: React.PointerEvent): { x: number; y: number } => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * still.width, y: ((e.clientY - r.top) / r.height) * still.height }
  }
  const pct = (v: number, of: number): string => `${(v / of) * 100}%`
  return (
    <>
      <p className="hint">{t('capture.zone.hint', { width: zone?.width ?? still.width, height: zone?.height ?? still.height })}</p>
      <div
        ref={box}
        className="capture-zone"
        data-capture-zone={zone ? `${zone.x},${zone.y},${zone.width},${zone.height}` : ''}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = toImage(e)
          onZone(null)
        }}
        onPointerMove={(e) => start.current && onZone(zoneBetween(start.current, toImage(e), still.width, still.height))}
        onPointerUp={(e) => {
          if (start.current) onZone(zoneBetween(start.current, toImage(e), still.width, still.height))
          start.current = null
        }}
      >
        <img src={still.dataUrl} alt={t('capture.zone.alt')} draggable={false} />
        {zone && <div className="capture-zone-rect" style={{ left: pct(zone.x, still.width), top: pct(zone.y, still.height), width: pct(zone.width, still.width), height: pct(zone.height, still.height) }} />}
      </div>
      {zone && <button data-action="capture-whole" onClick={() => onZone(null)}>{t('capture.zone.clear')}</button>}
    </>
  )
}
