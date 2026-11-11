import { useEffect, useMemo } from 'react'
import { InfoTip } from './InfoTip'
import { useLocale, useT } from '@/i18n'
import { MAX_RATE, MIN_RATE, voiceOptions, type ReadScope } from '@/speech'
import { useSpeech } from '@/store/speech'

const SCOPES: ReadScope[] = ['selection', 'page', 'all']

/** Lecture à voix haute des textes (voix du système, hors ligne) : la sélection, la page ou le document, avec pause, voix et vitesse. */
export function SpeechSection(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const { voices, voiceUri, rate, scope, state, item, total, page, message } = useSpeech()
  const options = useMemo(() => voiceOptions(voices, locale), [voices, locale])

  useEffect(() => useSpeech.getState().loadVoices(), [])

  const s = useSpeech.getState()
  return (
    <section data-a11y="speech">
      <h4>{t('speech.title')}<InfoTip>{t('speech.hint')}</InfoTip></h4>
      {voices.length === 0 ? (
        <p className="hint" data-speech-none>{t('speech.noVoice')}</p>
      ) : (
        <>
          <div className="row">
            <select data-field="speechScope" aria-label={t('speech.scope')} value={scope} disabled={state !== 'idle'} onChange={(e) => s.setScope(e.target.value as ReadScope)}>
              {SCOPES.map((v) => (
                <option key={v} value={v}>{t(`speech.scope.${v}`)}</option>
              ))}
            </select>
            {state === 'idle' ? (
              <button className="primary" data-action="speech-play" onClick={() => s.play()}>{t('speech.play')}</button>
            ) : (
              <>
                <button data-action={state === 'paused' ? 'speech-resume' : 'speech-pause'} onClick={() => (state === 'paused' ? s.resume() : s.pause())}>
                  {t(state === 'paused' ? 'speech.resume' : 'speech.pause')}
                </button>
                <button data-action="speech-stop" onClick={() => s.stop()}>{t('speech.stop')}</button>
              </>
            )}
          </div>
          {state !== 'idle' && (
            <p className="hint" role="status" data-speech-status={state}>{t(state === 'paused' ? 'speech.status.paused' : 'speech.status', { page, n: item + 1, total })}</p>
          )}
          {message && <p className="warn" role="status" data-speech-message={message}>{t(`speech.${message}`)}</p>}
          <label>
            {t('speech.voice')}
            <select data-field="speechVoice" value={voiceUri} onChange={(e) => s.setVoice(e.target.value)}>
              <option value="">{t('speech.voice.auto')}</option>
              {options.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </label>
          <label>
            {t('speech.rate')} <span className="hint">{rate.toFixed(1)}×</span>
            <input type="range" data-field="speechRate" min={MIN_RATE} max={MAX_RATE} step={0.1} value={rate} onChange={(e) => s.setRate(Number(e.target.value))} />
          </label>
        </>
      )}
    </section>
  )
}
