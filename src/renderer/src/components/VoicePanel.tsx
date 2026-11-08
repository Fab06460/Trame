import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { embeddedUrl } from '@/clipActions'
import { importVoice, startRecording, type Recorder, type VoiceProblem } from '@/voiceActions'
import { MAX_VOICE_SECONDS, pageVoice } from '@/voiceOver'
import { useEditor, selectPage } from '@/store/editor'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const PROBLEM: Record<VoiceProblem, MessageKey> = { denied: 'voice.denied', noMic: 'voice.noMic', tooBig: 'voice.tooBig', error: 'voice.error', fileTooBig: 'voice.file.tooBig', fileTooLong: 'voice.file.tooLong', fileUnreadable: 'voice.file.unreadable' }

/**
 * Voix off de la page : enregistrement au micro (avec témoin de niveau), écoute, refaire, supprimer. L'enregistrement est gardé dans le
 * document ; dans la vidéo exportée il est joué avec la page. Un enregistrement en cours est abandonné si l'on quitte ce panneau.
 */
export function VoicePanel(): React.JSX.Element {
  const t = useT()
  const page = useEditor(selectPage)
  const doc = useEditor((s) => s.doc)
  const voice = pageVoice(doc, page)
  const [recording, setRecording] = useState(false)
  const [time, setTime] = useState(0)
  const [level, setLevel] = useState(0)
  const [problem, setProblem] = useState<{ key: MessageKey; detail?: string } | null>(null)
  const recorder = useRef<Recorder | null>(null)
  /** page sur laquelle l'enregistrement a commencé : c'est elle qui reçoit la voix, même si l'on a changé de page entre-temps */
  const target = useRef(page.id)

  const finish = async (note?: MessageKey): Promise<void> => {
    const r = recorder.current
    if (!r) return
    recorder.current = null
    setRecording(false)
    const result = await r.stop()
    if ('error' in result) return setProblem({ key: PROBLEM[result.error], detail: result.detail })
    useEditor.getState().setPageVoice(target.current, { id: nanoid(10), duration: Math.round(result.duration * 100) / 100, data: result.data })
    setProblem(note ? { key: note } : null)
  }

  const begin = async (): Promise<void> => {
    setProblem(null)
    target.current = page.id
    const r = await startRecording()
    if ('error' in r) return setProblem({ key: PROBLEM[r.error], detail: r.detail })
    recorder.current = r
    setTime(0)
    setLevel(0)
    setRecording(true)
  }

  const importFile = async (): Promise<void> => {
    setProblem(null)
    const pageId = page.id
    const result = await importVoice()
    if (!result) return
    if ('error' in result) return setProblem({ key: PROBLEM[result.error], detail: result.detail })
    useEditor.getState().setPageVoice(pageId, { id: nanoid(10), duration: Math.round(result.duration * 100) / 100, data: result.data })
  }

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      const r = recorder.current
      if (!r) return
      setTime(r.elapsed())
      setLevel(r.level())
      if (r.elapsed() >= MAX_VOICE_SECONDS) void finish('voice.tooLong')
    }, 100)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  // on quitte le panneau (autre sélection, autre onglet) : micro libéré, enregistrement abandonné
  useEffect(
    () => () => {
      recorder.current?.cancel()
      recorder.current = null
    },
    []
  )

  const url = voice ? embeddedUrl(voice.data, voice.id) : null

  return (
    <>
      <h3>{t('voice.section')}</h3>
      {recording ? (
        <div data-voice-recording>
          <p className="hint" role="status" data-voice-time>{t('voice.recording', { time: clock(time) })}</p>
          <meter min={0} max={1} value={level} aria-label={t('voice.level')} data-voice-level />
          <div className="row">
            <button className="primary" data-action="voice-stop" onClick={() => void finish()}>{t('voice.stop')}</button>
            <button data-action="voice-cancel" onClick={() => (recorder.current?.cancel(), (recorder.current = null), setRecording(false))}>{t('voice.cancel')}</button>
          </div>
        </div>
      ) : voice ? (
        <>
          {url && <audio className="clip-player" data-voice-player src={url} controls preload="metadata" />}
          <p className="hint" data-voice-duration>{t('voice.duration', { duration: clock(voice.duration) })}</p>
          <div className="row">
            <button data-action="voice-record" onClick={() => void begin()}>{t('voice.redo')}</button>
            <button data-action="voice-import" onClick={() => void importFile()}>{t('voice.import')}</button>
            <button data-action="voice-remove" onClick={() => useEditor.getState().setPageVoice(page.id, null)}>{t('voice.remove')}</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button data-action="voice-record" onClick={() => void begin()}>{t('voice.record')}</button>
          <button data-action="voice-import" onClick={() => void importFile()}>{t('voice.import')}</button>
        </div>
      )}
      {problem && <p className="warn" role="alert" data-voice-problem>{t(problem.key, { detail: problem.detail ?? '', max: Math.round(MAX_VOICE_SECONDS / 60) })}</p>}
      <p className="hint">{t('voice.hint')}</p>
    </>
  )
}
