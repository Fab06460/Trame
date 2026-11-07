import { useEffect, useRef } from 'react'
import { embeddedUrl } from '@/clipActions'
import { pageVoice, VOICE_DELAY } from '@/voiceOver'
import type { TrameDocument } from '@/types'

/**
 * La voix off de la page affichée en présentation : elle démarre peu après l'arrivée sur la page (le même délai que dans la vidéo exportée)
 * et s'arrête quand on change de page, car l'élément est recréé pour chaque page. Les étapes d'apparition d'une même page ne la relancent
 * pas. L'écran noir la met en pause.
 */
export function PresentationVoice({ doc, index, paused }: { doc: TrameDocument; index: number; paused: boolean }): React.JSX.Element | null {
  const ref = useRef<HTMLAudioElement>(null)
  const voice = pageVoice(doc, doc.pages[index])
  const url = voice ? embeddedUrl(voice.data, voice.id) : null

  useEffect(() => {
    const a = ref.current
    if (!a || paused) return
    if (a.currentTime > 0) {
      if (!a.ended) void a.play().catch(() => {})
      return
    }
    const timer = setTimeout(() => void a.play().catch(() => {}), VOICE_DELAY * 1000)
    return () => clearTimeout(timer)
  }, [url, paused])

  useEffect(() => {
    if (paused) ref.current?.pause()
  }, [paused])

  if (!voice || !url) return null
  return <audio key={`${index}:${voice.id}`} ref={ref} src={url} preload="auto" data-pres-voice={voice.id} />
}
