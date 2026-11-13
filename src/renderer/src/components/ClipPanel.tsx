import { useEffect, useState } from 'react'
import { captureFrame, clipPosterAt, clipUrl } from '@/clipActions'
import { useClipBounds } from '@/clipPlayback'
import { clipAutoplay, clipLength, clipLoops, clipParts, clipRange, clipSpeed, clipVolume, MAX_SPEED, MIN_SPEED, moveClipPart, partAsClip, removeClipPart, splitClipAt, splitPartAt, withClipSettings, withPartSettings } from '@/videoClips'
import { useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import type { TrameElement, VideoClip } from '@/types'
import { MAX_ALT } from '@shared/ai'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
/** Minutes, secondes et dixièmes : pour placer un début ou une fin avec précision. */
const clockTenths = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/**
 * Réglages d'un clip vidéo (une image d'aperçu liée à un clip du document) : lecteur pour le regarder, lecture automatique, boucle, son,
 * choix de l'image d'aperçu (ce que montrent le PDF, les images, le SVG et PowerPoint) et description. Le recadrage et les filtres
 * d'image ne s'appliquent pas à un clip.
 */
export function ClipPanel({ el }: { el: TrameElement }): React.JSX.Element | null {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const clip = el.video
  const [player, setPlayer] = useState<HTMLVideoElement | null>(null)
  const [partIndex, setPartIndex] = useState(0)
  const [altDraft, setAltDraft] = useState(el.alt ?? '')
  useEffect(() => setAltDraft(el.alt ?? ''), [el.id, el.alt])
  const parts = clip ? clipParts(clip) : []
  const index = Math.min(partIndex, Math.max(0, parts.length - 1))
  const view = clip ? partAsClip(clip, index) : null // le morceau choisi, avec les réglages de son et de lecture du clip
  useClipBounds(player, view ?? undefined, false)
  // l'instant affiché dans le lecteur : l'état des boutons « ici » suit la lecture et les déplacements
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!player) return
    const update = (): void => setNow(player.currentTime)
    const events = ['timeupdate', 'seeked', 'loadedmetadata'] as const
    events.forEach((e) => player.addEventListener(e, update))
    update()
    return () => events.forEach((e) => player.removeEventListener(e, update))
  }, [player])
  if (!clip || !view) return null
  const sequence = parts.length > 1
  const url = clipUrl(doc, view.id)

  /** Enregistre les réglages en ne gardant que ce qui s'écarte des valeurs par défaut (comme à la lecture d'un fichier). */
  const setClip = (patch: Parameters<typeof withClipSettings>[1]): void => {
    const { start, end, speed, ...rest } = patch
    let next = withClipSettings(clip, rest)
    if (start !== undefined || end !== undefined || speed !== undefined) next = withPartSettings(next, index, { start, end, speed })
    useEditor.getState().updateElement(el.id, { video: next })
  }
  const { start, end } = clipRange(view)
  const trimmed = start > 0 || end < view.duration
  const showAt = (time: number): void => {
    if (player) player.currentTime = time
  }

  return (
    <div data-clip-panel>
      <h3>{t('clip.title')}</h3>
      {url ? <video ref={setPlayer} className="clip-player" data-clip-player src={url} controls preload="metadata" /> : <p className="warn" role="alert">{t('clip.missing')}</p>}
      <p className="hint" data-clip-duration>{t('clip.duration', { duration: clock(view.duration) })}</p>
      {sequence && (
        <ol className="clip-parts" data-clip-parts>
          {parts.map((p, i) => (
            <li key={`${i}:${p.id}`} className={i === index ? 'on' : undefined}>
              <button data-clip-part={i} aria-pressed={i === index} onClick={() => setPartIndex(i)}>
                {t('clip.part', { n: i + 1, from: clockTenths(p.start), to: clockTenths(p.end) })}
              </button>
              <button data-action="clip-part-up" aria-label={t('clip.part.up')} title={t('clip.part.up')} disabled={i === 0} onClick={() => (useEditor.getState().updateElement(el.id, { video: moveClipPart(clip, i, -1) }), setPartIndex(i - 1))}>↑</button>
              <button data-action="clip-part-down" aria-label={t('clip.part.down')} title={t('clip.part.down')} disabled={i === parts.length - 1} onClick={() => (useEditor.getState().updateElement(el.id, { video: moveClipPart(clip, i, 1) }), setPartIndex(i + 1))}>↓</button>
              <button
                data-action="clip-part-separate"
                title={t('clip.part.separate.title')}
                onClick={async () => {
                  const poster = await clipPosterAt(doc, p.id, p.start + 0.1)
                  useEditor.getState().separateClipPart(el.id, i, poster ?? undefined)
                  setPartIndex(0)
                }}
              >
                {t('clip.part.separate')}
              </button>
              <button
                data-action="clip-part-remove"
                aria-label={t('clip.part.remove')}
                title={t('clip.part.remove')}
                onClick={() => {
                  useEditor.getState().updateElement(el.id, { video: removeClipPart(clip, i) })
                  setPartIndex(0)
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <label>
        {t('clip.start')} <span data-clip-start-label>{clockTenths(start)}</span>
        <input type="range" data-field="clipStart" min={0} max={view.duration} step={0.05} value={start} onChange={(e) => (setClip({ start: Number(e.target.value) }), showAt(Number(e.target.value)))} />
      </label>
      <label>
        {t('clip.end')} <span data-clip-end-label>{clockTenths(end)}</span>
        <input type="range" data-field="clipEnd" min={0} max={view.duration} step={0.05} value={end} onChange={(e) => (setClip({ end: Number(e.target.value) }), showAt(Math.max(0, Number(e.target.value) - 0.05)))} />
      </label>
      <div className="row">
        <button data-action="clip-start-here" disabled={!player} title={t('clip.startHere.title')} onClick={() => player && setClip({ start: player.currentTime })}>
          {t('clip.startHere')}
        </button>
        <button data-action="clip-end-here" disabled={!player} title={t('clip.endHere.title')} onClick={() => player && setClip({ end: player.currentTime })}>
          {t('clip.endHere')}
        </button>
        <button data-action="clip-range-reset" disabled={!trimmed} onClick={() => setClip({ start: 0, end: view.duration })}>
          {t('clip.rangeReset')}
        </button>
      </div>
      <div className="row">
        <button
          data-action="clip-split"
          disabled={!player || !(sequence ? splitPartAt(clip, index, now) : splitClipAt(clip, now))}
          title={t('clip.split.title')}
          onClick={() => player && (sequence ? useEditor.getState().splitClipPart(el.id, index, player.currentTime) : useEditor.getState().splitClip(el.id, player.currentTime))}
        >
          {t('clip.split')}
        </button>
      </div>
      <label>
        {t('clip.speed')}
        <select data-field="clipSpeed" value={clipSpeed(view)} onChange={(e) => setClip({ speed: Number(e.target.value) })}>
          {(SPEEDS.includes(clipSpeed(view)) ? SPEEDS : [...SPEEDS, clipSpeed(view)].sort((x, y) => x - y)).filter((x) => x >= MIN_SPEED && x <= MAX_SPEED).map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
      </label>
      <p className="hint" data-clip-length>{t('clip.length', { length: clockTenths(clipLength(clip)) })}</p>
      <label className="check">
        <input type="checkbox" data-field="clipAutoplay" checked={clipAutoplay(clip)} onChange={(e) => setClip({ manual: !e.target.checked })} /> {t('clip.autoplay')}
      </label>
      <label className="check">
        <input type="checkbox" data-field="clipLoop" checked={clipLoops(clip)} onChange={(e) => setClip({ loop: e.target.checked })} /> {t('clip.loop')}
      </label>
      <label className="check">
        <input type="checkbox" data-field="clipMuted" checked={!!clip.muted} onChange={(e) => setClip({ muted: e.target.checked })} /> {t('clip.muted')}
      </label>
      <label>
        {t('clip.volume')}
        <input type="range" data-field="clipVolume" min={0} max={1} step={0.05} disabled={!!clip.muted} value={clipVolume(clip)} onChange={(e) => setClip({ volume: Number(e.target.value) })} />
      </label>
      <button
        data-action="clip-poster"
        title={t('clip.poster.title')}
        disabled={!player || !player.videoWidth}
        onClick={() => player && useEditor.getState().updateElement(el.id, { src: captureFrame(player) })}
      >
        {t('clip.poster')}
      </button>
      <label>
        {t('clip.alt')}
        <input
          type="text"
          className="text-field"
          data-field="clipAlt"
          maxLength={MAX_ALT}
          value={altDraft}
          onChange={(e) => setAltDraft(e.target.value)}
          onBlur={() => altDraft !== (el.alt ?? '') && useEditor.getState().updateElement(el.id, { alt: altDraft })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <p className="hint">{t('clip.hint')}</p>
    </div>
  )
}
