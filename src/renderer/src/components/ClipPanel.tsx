import { useEffect, useState } from 'react'
import { captureFrame, clipUrl } from '@/clipActions'
import { clipAutoplay, clipLoops, clipVolume } from '@/videoClips'
import { useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import type { TrameElement, VideoClip } from '@/types'
import { MAX_ALT } from '@shared/ai'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

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
  const [altDraft, setAltDraft] = useState(el.alt ?? '')
  useEffect(() => setAltDraft(el.alt ?? ''), [el.id, el.alt])
  if (!clip) return null
  const url = clipUrl(doc, clip.id)

  /** Enregistre les réglages en ne gardant que ce qui s'écarte des valeurs par défaut (comme à la lecture d'un fichier). */
  const setClip = (patch: Partial<Record<'loop' | 'muted' | 'manual', boolean>> & { volume?: number }): void => {
    const next: VideoClip = { id: clip.id, duration: clip.duration }
    const loop = patch.loop ?? clipLoops(clip)
    const muted = patch.muted ?? !!clip.muted
    const manual = patch.manual ?? !!clip.manual
    const volume = patch.volume ?? clipVolume(clip)
    if (loop) next.loop = true
    if (muted) next.muted = true
    if (manual) next.manual = true
    if (volume < 1) next.volume = volume
    useEditor.getState().updateElement(el.id, { video: next })
  }

  return (
    <div data-clip-panel>
      <h3>{t('clip.title')}</h3>
      {url ? <video ref={setPlayer} className="clip-player" data-clip-player src={url} controls preload="metadata" /> : <p className="warn" role="alert">{t('clip.missing')}</p>}
      <p className="hint" data-clip-duration>{t('clip.duration', { duration: clock(clip.duration) })}</p>
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
