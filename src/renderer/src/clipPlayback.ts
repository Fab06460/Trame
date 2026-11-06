import { useEffect } from 'react'
import { clipRange, clipSpeed } from '@/videoClips'
import type { VideoClip } from '@/types'

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
