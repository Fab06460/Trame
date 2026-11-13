import { useEffect } from 'react'
import { clipUrl } from '@/clipActions'
import { clipParts, clipRange, clipSpeed } from '@/videoClips'
import type { TrameDocument, VideoClip } from '@/types'

/**
 * Fait respecter à un lecteur vidéo le montage du clip : il démarre au début choisi, s'arrête (ou recommence, en boucle) à la fin choisie
 * et joue à la vitesse réglée. La hauteur du son suit la vitesse, comme dans la vidéo exportée.
 */
export function useClipBounds(video: HTMLVideoElement | null, clip: VideoClip | undefined, loop: boolean): void {
  useEffect(() => {
    if (!video || !clip) return
    const { start, end } = clipRange(clip)
    video.playbackRate = clipSpeed(clip)
    video.preservesPitch = false
    if (video.currentTime < start - 0.01 || video.currentTime > end) video.currentTime = start
    const restart = (): void => {
      video.currentTime = start
    }
    const onPlay = (): void => {
      if (video.currentTime < start - 0.01 || video.currentTime >= end - 0.05) restart()
    }
    const onEnded = (): void => {
      if (!loop) return
      restart()
      void video.play().catch(() => {})
    }
    let raf = 0
    const watch = (): void => {
      if (!video.paused && video.currentTime >= end - 0.02) {
        if (loop) restart()
        else {
          video.pause()
          video.currentTime = Math.max(start, end - 0.05)
        }
      }
      raf = requestAnimationFrame(watch)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', onEnded)
    raf = requestAnimationFrame(watch)
    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', onEnded)
    }
  }, [video, clip, loop])
}

/**
 * Joue une séquence de clips dans un seul lecteur : à la fin de chaque morceau (son `end`) la vidéo du suivant est chargée et jouée, avec
 * sa vitesse ; après le dernier la séquence s'arrête, ou recommence en boucle. Le lecteur commence sur la vidéo du premier morceau.
 */
export function useClipSequence(video: HTMLVideoElement | null, doc: Pick<TrameDocument, 'clips'>, clip: VideoClip | undefined, loop: boolean): void {
  useEffect(() => {
    if (!video || !clip?.then?.length) return
    const parts = clipParts(clip)
    let index = 0
    video.preservesPitch = false
    const enter = (i: number, play: boolean): void => {
      const p = parts[i]
      index = i
      const apply = (): void => {
        video.playbackRate = p.speed
        video.currentTime = p.start
        if (play) void video.play().catch(() => {})
      }
      const url = clipUrl(doc, p.id)
      if (url && video.src !== url) {
        video.addEventListener('loadedmetadata', apply, { once: true })
        video.src = url
        video.load()
      } else apply()
    }
    const next = (): void => {
      if (index < parts.length - 1) enter(index + 1, true)
      else if (loop) enter(0, true)
      else {
        video.pause()
        video.currentTime = Math.max(parts[index].start, parts[index].end - 0.05)
      }
    }
    video.playbackRate = parts[0].speed
    if (video.currentTime < parts[0].start - 0.01 || video.currentTime > parts[0].end) video.currentTime = parts[0].start
    const onPlay = (): void => {
      // relancée après la fin : depuis le début de la séquence
      if (index === parts.length - 1 && video.currentTime >= parts[index].end - 0.05) enter(0, true)
      else if (video.currentTime < parts[index].start - 0.01) video.currentTime = parts[index].start
    }
    let raf = 0
    const watch = (): void => {
      if (!video.paused && video.seeking === false && video.currentTime >= parts[index].end - 0.02) next()
      raf = requestAnimationFrame(watch)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', next)
    raf = requestAnimationFrame(watch)
    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', next)
      if (index !== 0) enter(0, false)
    }
  }, [video, doc, clip, loop])
}
