import { useEffect, useRef, useState } from 'react'
import { clipUrl } from '@/clipActions'
import { useClipBounds } from '@/clipPlayback'
import { clipAutoplay, clipLoops, clipVolume } from '@/videoClips'
import type { TrameDocument, TrameElement } from '@/types'

/**
 * Un clip vidéo joué par-dessus la page en présentation : à la place et à la taille de son image d'aperçu (déjà dans l'image de la
 * page), avec ses réglages (lecture automatique ou au clic, boucle, son). Il disparaît avec la page. Les éléments placés au-dessus du
 * clip dans la pile des calques passent donc derrière lui pendant la lecture.
 */
export function PresentationClip({ doc, el, rect }: { doc: TrameDocument; el: TrameElement; rect: { x: number; y: number; k: number } }): React.JSX.Element | null {
  const ref = useRef<HTMLVideoElement>(null)
  const [node, setNode] = useState<HTMLVideoElement | null>(null)
  const clip = el.video
  const url = clip ? clipUrl(doc, clip.id) : null
  useEffect(() => {
    const v = ref.current
    if (!v || !clip) return
    v.volume = clipVolume(clip)
    v.muted = !!clip.muted
    if (clipAutoplay(clip)) void v.play().catch(() => {})
  }, [clip, url])
  // le montage (début, fin, vitesse) et la boucle sont gérés ici plutôt que par l'attribut `loop`, qui ignorerait le début et la fin choisis
  useClipBounds(node, clip, !!clip && clipLoops(clip))
  if (!clip || !url) return null
  const auto = clipAutoplay(clip)
  return (
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
        left: rect.x + el.x * rect.k,
        top: rect.y + el.y * rect.k,
        width: el.width * rect.k,
        height: el.height * rect.k,
        opacity: el.opacity,
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: '0 0',
        cursor: auto ? undefined : 'pointer'
      }}
      // à lancer soi-même : un clic démarre ou arrête le clip au lieu de passer à la page suivante
      onClick={(e) => {
        if (auto) return
        e.stopPropagation()
        const v = e.currentTarget
        if (v.paused) void v.play().catch(() => {})
        else v.pause()
      }}
    />
  )
}
