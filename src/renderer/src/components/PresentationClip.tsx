import { useEffect, useRef, useState } from 'react'
import { clipUrl } from '@/clipActions'
import { useClipBounds, useClipCrossfade, useClipSequence, type CrossControl } from '@/clipPlayback'
import { clipAutoplay, clipCrosses, clipLoops, clipVolume } from '@/videoClips'
import type { TrameDocument, TrameElement } from '@/types'

/**
 * Un clip vidéo joué par-dessus la page en présentation : à la place et à la taille de son image d'aperçu (déjà dans l'image de la
 * page), avec ses réglages (lecture automatique ou au clic, boucle, son). Il disparaît avec la page. Les éléments placés au-dessus du
 * clip dans la pile des calques passent donc derrière lui pendant la lecture.
 */
export function PresentationClip({ doc, el, rect }: { doc: TrameDocument; el: TrameElement; rect: { x: number; y: number; k: number } }): React.JSX.Element | null {
  const ref = useRef<HTMLVideoElement>(null)
  const [node, setNode] = useState<HTMLVideoElement | null>(null)
  // un enchaîné se joue avec deux lecteurs qui se relaient
  const [second, setSecond] = useState<HTMLVideoElement | null>(null)
  const control = useRef<CrossControl | null>(null)
  const clip = el.video
  const url = clip ? clipUrl(doc, clip.id) : null
  useEffect(() => {
    const v = ref.current
    if (!v || !clip) return
    v.volume = clipVolume(clip)
    v.muted = !!clip.muted
    if (second) second.muted = !!clip.muted
    if (clipAutoplay(clip) && !clipCrosses(clip)) void v.play().catch(() => {})
  }, [clip, url, second])
  // le montage (début, fin, vitesse) et la boucle sont gérés ici plutôt que par l'attribut `loop`, qui ignorerait le début et la fin choisis
  const sequence = !!clip?.then?.length
  useClipBounds(sequence ? null : node, clip, !!clip && clipLoops(clip))
  useClipSequence(node, doc, clip, !!clip && clipLoops(clip))
  useClipCrossfade(node, second, doc, clip, !!clip && clipLoops(clip), !!clip && clipAutoplay(clip), control)
  if (!clip || !url) return null
  const auto = clipAutoplay(clip)
  const crossing = clipCrosses(clip)
  const place = {
    left: rect.x + el.x * rect.k,
    top: rect.y + el.y * rect.k,
    width: el.width * rect.k,
    height: el.height * rect.k,
    opacity: el.opacity,
    transform: `rotate(${el.rotation}deg)`,
    transformOrigin: '0 0'
  }
  return (
    <>
    {crossing && (
      <video ref={setSecond} className="presentation-clip" data-pres-clip-2={el.id} aria-hidden="true" playsInline preload="auto" style={{ ...place, objectFit: 'contain', background: '#000', opacity: 0, pointerEvents: 'none' }} />
    )}
    <video
      ref={(v) => {
        ref.current = v
        setNode(v)
      }}
      className="presentation-clip"
      data-pres-clip={el.id}
      src={url}
      poster={el.src}
      playsInline
      preload="auto"
      style={{
        ...place,
        ...(sequence ? { objectFit: 'contain' as const, background: '#000' } : {}),
        cursor: auto ? undefined : 'pointer'
      }}
      // à lancer soi-même : un clic démarre ou arrête le clip au lieu de passer à la page suivante
      onClick={(e) => {
        if (auto) return
        e.stopPropagation()
        if (control.current) return control.current.toggle()
        const v = e.currentTarget
        if (v.paused) void v.play().catch(() => {})
        else v.pause()
      }}
    />
    </>
  )
}
