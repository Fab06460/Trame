import { useEffect, useRef, useState } from 'react'
import { clipThumbnails } from '@/clipActions'
import { MIN_TRIM } from '@/videoClips'
import { useT } from '@/i18n'
import type { TrameDocument } from '@/types'

const THUMBS = 12
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/**
 * La frise d'un clip : des vignettes régulières de toute la vidéo, le morceau gardé en clair (le reste assombri), deux poignées pour son
 * début et sa fin et la position du lecteur. Les poignées se glissent à la souris (le réglage est enregistré au lâcher) ou se règlent aux
 * flèches du clavier ; un clic dans la frise place le lecteur.
 */
export function ClipStrip({ doc, id, duration, start, end, now, onSeek, onChange }: { doc: Pick<TrameDocument, 'clips'>; id: string; duration: number; start: number; end: number; now: number; onSeek: (time: number) => void; onChange: (patch: { start?: number; end?: number }) => void }): React.JSX.Element {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [images, setImages] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<{ which: 'start' | 'end'; value: number } | null>(null)
  useEffect(() => {
    let live = true
    setImages(null)
    void clipThumbnails(doc, id, THUMBS).then((r) => live && setImages(r))
    return () => {
      live = false
    }
  }, [doc, id])
  const min = Math.min(MIN_TRIM, duration / 2)
  const from = drag?.which === 'start' ? drag.value : start
  const to = drag?.which === 'end' ? drag.value : end
  const pct = (s: number): string => `${(clamp(s / duration, 0, 1) * 100).toFixed(3)}%`
  const timeAt = (clientX: number): number => {
    const r = box.current?.getBoundingClientRect()
    return r && r.width > 0 ? clamp(((clientX - r.left) / r.width) * duration, 0, duration) : 0
  }
  const limit = (which: 'start' | 'end', v: number): number => (which === 'start' ? clamp(v, 0, to - min) : clamp(v, from + min, duration))

  const press = (which: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ which, value: which === 'start' ? start : end })
  }
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    const value = limit(drag.which, timeAt(e.clientX))
    setDrag({ which: drag.which, value })
    onSeek(drag.which === 'end' ? Math.max(0, value - 0.05) : value)
  }
  const release = (): void => {
    if (!drag) return
    onChange({ [drag.which]: drag.value })
    setDrag(null)
  }
  const key = (which: 'start' | 'end') => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 0.1
    const at = which === 'start' ? start : end
    const next = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? at - step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? at + step : e.key === 'Home' ? 0 : e.key === 'End' ? duration : null
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    const value = limit(which, next)
    onChange({ [which]: value })
    onSeek(which === 'end' ? Math.max(0, value - 0.05) : value)
  }

  return (
    <div className="clip-strip" role="group" aria-label={t('clip.strip')} data-clip-strip>
      <div
        ref={box}
        className="clip-strip-track"
        data-clip-strip-track
        onPointerDown={(e) => onSeek(timeAt(e.clientX))}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="clip-strip-frames" aria-hidden="true">
          {(images ?? Array.from({ length: THUMBS }, () => '')).map((src, i) => (src ? <img key={i} src={src} alt="" draggable={false} /> : <span key={i} />))}
        </div>
        <div className="clip-strip-dim" style={{ left: 0, width: pct(from) }} aria-hidden="true" />
        <div className="clip-strip-dim" style={{ left: pct(to), right: 0 }} aria-hidden="true" />
        <div className="clip-strip-kept" style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }} aria-hidden="true" />
        <div className="clip-strip-now" style={{ left: pct(now) }} aria-hidden="true" />
        {(['start', 'end'] as const).map((which) => (
          <div
            key={which}
            className={`clip-strip-handle ${which}`}
            data-strip-handle={which}
            role="slider"
            tabIndex={0}
            aria-label={t(which === 'start' ? 'clip.strip.start' : 'clip.strip.end')}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Math.round((which === 'start' ? from : to) * 100) / 100}
            style={{ left: pct(which === 'start' ? from : to) }}
            onPointerDown={press(which)}
            onKeyDown={key(which)}
          />
        ))}
      </div>
      <p className="hint">{t('clip.strip.hint')}</p>
    </div>
  )
}
