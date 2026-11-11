import { useEffect, useMemo, useRef, useState } from 'react'
import { InfoTip } from './InfoTip'
import { useT, useLocale } from '@/i18n'
import { useEditor } from '@/store/editor'
import { useOcr } from '@/store/ocr'
import { insertRecognizedText } from '@/ocr/actions'
import { release, recognize, type OcrProgress } from '@/ocr/engine'
import { OCR_LANGUAGES, isOcrLanguage, languageForLocale, type OcrLanguage } from '@/ocr/languages'
import { prepareImage } from '@/ocr/prepare'
import { cleanOcrText } from '@/ocr/text'
import type { TrameElement } from '@/types'

const KEY = 'trame.ocr'
/** Le nom de chaque langue dans sa propre langue : un nom propre, jamais traduit. */
const NAMES: Record<OcrLanguage, string> = { fra: 'Français', eng: 'English', deu: 'Deutsch', spa: 'Español' }
/** En dessous, le texte est probablement à relire de près. */
const LOW_CONFIDENCE = 70

function storedLanguage(fallback: OcrLanguage): OcrLanguage {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}').language
    return isOcrLanguage(v) ? v : fallback
  } catch {
    return fallback
  }
}

type Run = { status: 'running'; progress: OcrProgress } | { status: 'done'; raw: string; confidence: number } | { status: 'error'; detail: string }

/** Fenêtre « Texte de l'image » : reconnaît le texte d'une image (hors ligne), le laisse corriger, puis l'insère comme bloc de texte. */
export function OcrDialog(): React.JSX.Element | null {
  const elementId = useOcr((s) => s.elementId)
  const doc = useEditor((s) => s.doc)
  const el = useMemo(() => (elementId ? doc.pages.flatMap((p) => p.elements).find((e) => e.id === elementId) : undefined), [doc, elementId])
  if (!elementId || !el?.src) return null
  return <Dialog image={el} />
}

function Dialog({ image }: { image: TrameElement }): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [language, setLanguage] = useState<OcrLanguage>(() => storedLanguage(languageForLocale(locale)))
  const [keepLines, setKeepLines] = useState(false)
  const [run, setRun] = useState<Run>({ status: 'running', progress: { phase: 'loading', progress: 0 } })
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const token = useRef(0)

  const onClose = (): void => {
    token.current++ // ignore un résultat qui arriverait après la fermeture
    void release() // arrête le moteur en cours de route (il garde de la mémoire)
    useOcr.getState().close()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // la reconnaissance démarre à l'ouverture et à chaque changement de langue
  useEffect(() => {
    const mine = ++token.current
    setRun({ status: 'running', progress: { phase: 'loading', progress: 0 } })
    ;(async () => {
      try {
        const canvas = await prepareImage(image.src!, image.crop)
        const res = await recognize(canvas, language, (progress) => {
          if (mine === token.current) setRun({ status: 'running', progress })
        })
        if (mine === token.current) setRun({ status: 'done', raw: res.text, confidence: res.confidence })
      } catch (e) {
        if (mine === token.current) setRun({ status: 'error', detail: String((e as Error)?.message ?? e).slice(0, 160) })
      }
    })()
  }, [language])

  // le texte proposé suit le résultat et l'option « retours à la ligne » ; ce que l'utilisateur corrige à la main n'est pas écrasé tant qu'il ne les change pas
  useEffect(() => {
    if (run.status === 'done') setText(cleanOcrText(run.raw, keepLines))
  }, [run, keepLines])

  const insert = (): void => {
    if (insertRecognizedText(image, text)) onClose()
  }
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* presse-papiers indisponible : rien à faire */
    }
  }
  const chooseLanguage = (value: string): void => {
    if (!isOcrLanguage(value)) return
    try {
      localStorage.setItem(KEY, JSON.stringify({ language: value }))
    } catch {
      /* le choix vaut pour cette fenêtre */
    }
    setLanguage(value)
  }

  const running = run.status === 'running'
  const percent = running ? Math.round(run.progress.progress * 100) : 100
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('ocr.dialog')} data-ocr-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide ocr-dialog">
        <h3>{t('ocr.title')}<InfoTip>{t('ocr.hint')}</InfoTip></h3>
        <div className="row">
          <img className="ocr-thumb" src={image.src} alt="" draggable={false} />
          <label>
            {t('ocr.language')}
            <select data-field="ocrLanguage" value={language} onChange={(e) => chooseLanguage(e.target.value)}>
              {OCR_LANGUAGES.map((l) => (
                <option key={l} value={l}>{NAMES[l]}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" data-field="ocrKeepLines" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} /> {t('ocr.keepLines')}
          </label>
        </div>

        {running && (
          <div data-ocr-progress={run.progress.phase}>
            <p className="hint" role="status">{run.progress.phase === 'loading' ? t('ocr.progress.loading') : t('ocr.progress.recognizing', { percent })}</p>
            <progress max={100} value={run.progress.phase === 'loading' ? undefined : percent} aria-label={t('ocr.dialog')} />
          </div>
        )}
        {run.status === 'error' && <div className="warn" role="status" data-ocr-error>{t('ocr.error', { detail: run.detail })}</div>}
        {run.status === 'done' && (
          <>
            {!text.trim() ? (
              <div className="warn" role="status" data-ocr-empty>{t('ocr.empty')}</div>
            ) : (
              <p className={run.confidence < LOW_CONFIDENCE ? 'warn' : 'hint'} role="status" data-ocr-confidence={run.confidence}>
                {t('ocr.confidence', { percent: run.confidence })}{run.confidence < LOW_CONFIDENCE ? ` ${t('ocr.lowConfidence')}` : ''}
              </p>
            )}
            <textarea className="text-field" data-field="ocrText" rows={9} aria-label={t('ocr.text')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </>
        )}

        <div className="row end">
          <button onClick={onClose} data-action="ocr-close">{t(running ? 'common.cancel' : 'common.close')}</button>
          <button data-action="ocr-copy" disabled={running || !text.trim()} onClick={() => void copy()}>{copied ? t('ocr.copied') : t('ocr.copy')}</button>
          <button className="primary" data-action="ocr-insert" disabled={running || !text.trim()} onClick={insert}>{t('ocr.insert')}</button>
        </div>
      </div>
    </div>
  )
}
