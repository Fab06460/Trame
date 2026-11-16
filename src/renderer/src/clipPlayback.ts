import { useEffect } from 'react'
import { clipUrl } from '@/clipActions'
import { clipCrosses, clipElapsedAt, clipFade, clipGainAt, clipOverlaps, clipParts, clipRange, clipSpeed, clipVolume } from '@/videoClips'
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
    if (!video || !clip?.then?.length || clipCrosses(clip)) return
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
    const fading = clipFade(clip) > 0
    const watch = (): void => {
      if (!video.paused && video.seeking === false && video.currentTime >= parts[index].end - 0.02) next()
      if (fading) {
        // fondu au noir aux raccords : l'image s'assombrit et le son baisse avec elle
        const gain = clipGainAt({ ...clip, loop: undefined }, clipElapsedAt(clip, index, video.currentTime))
        video.style.filter = gain < 1 ? `brightness(${gain})` : ''
        video.volume = clipVolume(clip) * gain
      }
      raf = requestAnimationFrame(watch)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', next)
    raf = requestAnimationFrame(watch)
    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', next)
      if (fading) {
        video.style.filter = ''
        video.volume = clipVolume(clip)
      }
      if (index !== 0) enter(0, false)
    }
  }, [video, doc, clip, loop])
}

/** Ce que le lecteur d'un enchaîné laisse à son appelant : lancer ou arrêter la lecture (les deux lecteurs à la fois). */
export interface CrossControl {
  toggle: () => void
}

/** Ce que l'on sait d'un lecteur de l'enchaîné : le morceau qu'il porte, s'il est prêt (placé sur son début) et s'il doit jouer dès qu'il l'est. */
interface Slot {
  part: number
  ready: boolean
  play: boolean
}

/**
 * Joue une séquence à raccords enchaînés avec deux lecteurs qui se relaient : le morceau suivant est préchargé dans l'autre lecteur, démarre
 * `recouvrement` secondes avant la fin du morceau en cours et apparaît en fondu par-dessus (l'image comme le son : l'un monte pendant que
 * l'autre descend). Au raccord suivant les rôles s'échangent. Le premier lecteur commence sur la vidéo du premier morceau ; l'autre est
 * invisible tant qu'il ne joue pas.
 */
export function useClipCrossfade(a: HTMLVideoElement | null, b: HTMLVideoElement | null, doc: Pick<TrameDocument, 'clips'>, clip: VideoClip | undefined, loop: boolean, autoplay: boolean, control: { current: CrossControl | null }): void {
  useEffect(() => {
    if (!a || !b || !clip?.then?.length || !clipCrosses(clip)) return
    const parts = clipParts(clip)
    const overlaps = clipOverlaps(clip)
    const volume = clipVolume(clip)
    const slots = new Map<HTMLVideoElement, Slot>()
    let cur = a
    let nxt = b
    let index = 0
    /** le suivant a commencé de jouer (le recouvrement est en cours) */
    let started = false
    const following = (): number => (index < parts.length - 1 ? index + 1 : loop ? 0 : -1)
    /** Charge le morceau `i` dans le lecteur `v` et le place sur son début ; il joue tout de suite si `play`. */
    const prime = (v: HTMLVideoElement, i: number, play: boolean): void => {
      const p = parts[i]
      const slot: Slot = { part: i, ready: false, play }
      slots.set(v, slot)
      const apply = (): void => {
        if (slots.get(v) !== slot) return
        v.playbackRate = p.speed
        v.currentTime = p.start
        slot.ready = true
        if (slot.play) void v.play().catch(() => {})
      }
      const url = clipUrl(doc, p.id)
      if (url && v.src !== url) {
        v.addEventListener('loadedmetadata', apply, { once: true })
        v.src = url
        v.load()
      } else apply()
    }
    const preload = (): void => {
      const f = following()
      if (f >= 0 && slots.get(nxt)?.part !== f) prime(nxt, f, false)
    }
    const begin = (): void => {
      const f = following()
      if (f < 0 || started) return
      started = true
      nxt.style.zIndex = '2'
      cur.style.zIndex = '1'
      nxt.style.opacity = (overlaps[index] ?? 0) > 0 ? '0' : '1'
      const slot = slots.get(nxt)
      if (slot?.part === f) {
        slot.play = true
        if (slot.ready) void nxt.play().catch(() => {})
      } else prime(nxt, f, true)
    }
    const swap = (): void => {
      const f = following()
      const gone = cur
      gone.pause()
      cur = nxt
      nxt = gone
      index = f
      started = false
      slots.delete(gone)
      cur.style.opacity = '1'
      cur.volume = volume
      gone.style.opacity = '0'
      gone.volume = volume
      preload()
    }
    const home = (): void => {
      a.pause()
      b.pause()
      cur = a
      nxt = b
      index = 0
      started = false
      slots.clear()
      a.style.opacity = '1'
      a.style.zIndex = ''
      b.style.opacity = '0'
      b.style.zIndex = ''
      a.volume = b.volume = volume
      slots.set(a, { part: 0, ready: true, play: false })
      const url = clipUrl(doc, parts[0].id)
      const apply = (): void => {
        a.playbackRate = parts[0].speed
        a.currentTime = parts[0].start
      }
      if (url && a.src !== url) {
        a.addEventListener('loadedmetadata', apply, { once: true })
        a.src = url
        a.load()
      } else apply()
      preload()
    }
    home()
    a.preservesPitch = b.preservesPitch = false
    control.current = {
      toggle: () => {
        if (!cur.paused || (started && !nxt.paused)) {
          cur.pause()
          nxt.pause()
        } else if (index === parts.length - 1 && !loop && cur.currentTime >= parts[index].end - 0.05) {
          home()
          void a.play().catch(() => {})
        } else void cur.play().catch(() => {})
      }
    }
    if (autoplay) void a.play().catch(() => {})
    let raf = 0
    const watch = (): void => {
      if (!cur.paused && !cur.seeking) {
        const p = parts[index]
        const f = following()
        // un retour au premier morceau (boucle) se fait en coupe franche
        const lead = f > index ? (overlaps[index] ?? 0) : 0
        // le suivant démarre `lead` secondes (de lecture) avant la fin du morceau en cours
        if (!started && f >= 0 && cur.currentTime >= p.end - lead * p.speed - 0.02) begin()
        if (started && lead > 0) {
          const q = parts[f]
          const progress = Math.min(1, Math.max(0, (nxt.currentTime - q.start) / q.speed / lead))
          nxt.style.opacity = String(progress)
          cur.volume = volume * (1 - progress)
          nxt.volume = volume * progress
        }
        if (cur.currentTime >= p.end - 0.02) {
          if (f >= 0) {
            begin()
            swap()
          } else {
            cur.pause()
            cur.currentTime = Math.max(p.start, p.end - 0.05)
          }
        }
      }
      raf = requestAnimationFrame(watch)
    }
    raf = requestAnimationFrame(watch)
    return () => {
      cancelAnimationFrame(raf)
      control.current = null
      home()
      b.removeAttribute('src')
      b.load()
    }
  }, [a, b, doc, clip, loop, autoplay, control])
}
