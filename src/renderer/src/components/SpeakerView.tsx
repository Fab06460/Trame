import { useCallback, useEffect, useRef, useState } from 'react'
import { renderPage } from '@/exportPages'
import { registerEmbeddedFonts } from '@/fonts'
import { clampNotesSize, formatElapsed, NOTES_SIZE, nextIndex } from '@/speakerFormat'
import { parseDocument } from '@/store/editor'
import type { TrameDocument } from '@/types'
import { useLocale, useT } from '@/i18n'

const NOTES_KEY = 'trame.speakerNotesSize'
const readSize = (): number => {
  try {
    return clampNotesSize(Number(localStorage.getItem(NOTES_KEY)))
  } catch {
    return NOTES_SIZE.def
  }
}

interface View {
  doc: TrameDocument
  index: number
  black: boolean
  startedAt: number
}

/** Image d'une page, rendue comme à l'export (mêmes polices, effets, ombres) puis mise en cache. */
function usePageImage(doc: TrameDocument | null, index: number | null, maxSide: number): string | null {
  const cache = useRef(new Map<string, Promise<string>>())
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    cache.current.clear()
  }, [doc])
  useEffect(() => {
    let live = true
    if (!doc || index === null || !doc.pages[index]) {
      setUrl(null)
      return
    }
    const key = `${index}@${maxSide}`
    let p = cache.current.get(key)
    if (!p) {
      p = renderPage(doc, doc.pages[index], 'image/jpeg', undefined, { scale: Math.min(2, maxSide / Math.max(doc.width, doc.height)), quality: 0.9 })
      cache.current.set(key, p)
      p.catch(() => cache.current.delete(key))
    }
    void p.then((u) => live && setUrl(u), () => {})
    return () => {
      live = false
    }
  }, [doc, index, maxSide])
  return url
}

/**
 * Écran de l'orateur : seconde fenêtre, affichée sur l'écran de l'orateur pendant la présentation. Page courante, page suivante, notes,
 * chronomètre et heure ; elle pilote la présentation (page suivante / précédente, écran noir, fin). L'état vient de la fenêtre principale
 * par le processus principal (voir main/speakerProtocol.ts).
 */
export function SpeakerView(): React.JSX.Element {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [view, setView] = useState<View | null>(null)
  const [now, setNow] = useState(Date.now())
  const [resetAt, setResetAt] = useState<number | null>(null)
  const [size, setSize] = useState(readSize)
  const docJson = useRef<string | null>(null)

  useEffect(() => {
    document.title = t('speaker.title')
  }, [t])

  useEffect(() => {
    const apply = (s: { doc: string | null; index: number; black: boolean; startedAt: number }): void => {
      if (s.doc !== null && s.doc !== docJson.current) {
        docJson.current = s.doc
        try {
          const doc = parseDocument(s.doc)
          void registerEmbeddedFonts(doc.fonts)
          setView({ doc, index: s.index, black: s.black, startedAt: s.startedAt })
        } catch {
          /* document illisible : on garde l'état précédent */
        }
        return
      }
      setView((v) => (v ? { ...v, index: s.index, black: s.black, startedAt: s.startedAt } : v))
    }
    void window.trame.speakerHello().then((s) => s && apply(s))
    const off = window.trame.onSpeakerState(apply)
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => {
      off()
      clearInterval(tick)
    }
  }, [])

  const count = view?.doc.pages.length ?? 0
  const go = useCallback(
    (to: number) => {
      if (!view) return
      const index = Math.max(0, Math.min(view.doc.pages.length - 1, to))
      setView({ ...view, index }) // affichage immédiat ; la présentation confirme ensuite
      window.trame.sendSpeakerCommand({ type: 'go', index })
    },
    [view]
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!view) return
      const k = e.key
      let handled = true
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(view.index + 1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(view.index - 1)
      else if (k === 'Home') go(0)
      else if (k === 'End') go(count - 1)
      else if (k.toLowerCase() === 'b') window.trame.sendSpeakerCommand({ type: 'black' })
      else if (k === 'Escape') window.trame.sendSpeakerCommand({ type: 'exit' })
      else handled = false
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, go, count])

  const current = usePageImage(view?.doc ?? null, view?.index ?? null, 1400)
  const upcoming = view ? nextIndex(view.index, count) : null
  const next = usePageImage(view?.doc ?? null, upcoming, 700)

  if (!view) return <div className="speaker speaker-wait" role="status">{t('speaker.waiting')}</div>
  const notes = view.doc.pages[view.index].notes
  const elapsed = now - (resetAt ?? view.startedAt)
  const resize = (delta: number): void => {
    const next = clampNotesSize(size + delta)
    setSize(next)
    try {
      localStorage.setItem(NOTES_KEY, String(next))
    } catch {
      /* préférence seulement */
    }
  }

  return (
    <div className="speaker" data-speaker>
      <header className="speaker-bar">
        <span className="speaker-counter" data-speaker="counter">{view.index + 1} / {count}</span>
        <span className="speaker-timer" data-speaker="timer" title={t('speaker.timer.title')}>⏱ {formatElapsed(elapsed)}</span>
        <button data-speaker="reset" onClick={() => setResetAt(Date.now())} title={t('speaker.reset.title')}>↺</button>
        <span className="speaker-clock" data-speaker="clock">{new Date(now).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="spacer" />
        <button data-speaker="prev" disabled={view.index === 0} onClick={() => go(view.index - 1)}>{t('speaker.prev')}</button>
        <button data-speaker="next" className="primary" disabled={upcoming === null} onClick={() => go(view.index + 1)}>{t('speaker.next')}</button>
        <button data-speaker="black" aria-pressed={view.black} className={view.black ? 'active' : ''} onClick={() => window.trame.sendSpeakerCommand({ type: 'black' })} title={t('speaker.black.title')}>{t('speaker.black')}</button>
        <button data-speaker="swap" onClick={() => window.trame.sendSpeakerCommand({ type: 'swap' })} title={t('speaker.swap.title')}>{t('speaker.swap')}</button>
        <button data-speaker="exit" className="danger" onClick={() => window.trame.sendSpeakerCommand({ type: 'exit' })} title={t('speaker.exit.title')}>{t('speaker.exit')}</button>
      </header>
      <main className="speaker-main">
        <section className="speaker-current" aria-label={t('speaker.current')}>
          {current ? <img src={current} alt={t('pres.page', { page: view.index + 1 })} data-speaker="current" data-speaker-index={view.index} draggable={false} /> : <div className="speaker-loading">{t('pres.preparing')}</div>}
          {view.black && <div className="speaker-black" data-speaker="black-flag">{t('speaker.black')}</div>}
        </section>
        <aside className="speaker-side">
          <section className="speaker-next" aria-label={t('speaker.nextLabel')}>
            <h2>{t('speaker.upNext')}</h2>
            {next ? <img src={next} alt={t('pres.page', { page: (upcoming ?? 0) + 1 })} data-speaker="next-image" data-speaker-index={upcoming ?? -1} draggable={false} /> : <div className="speaker-end" data-speaker="end">{upcoming === null ? t('speaker.end') : t('pres.preparing')}</div>}
          </section>
          <section className="speaker-notes" aria-label={t('speaker.notes')}>
            <h2>
              {t('speaker.notes')}
              <span className="speaker-size">
                <button data-speaker="notes-smaller" onClick={() => resize(-NOTES_SIZE.step)} disabled={size <= NOTES_SIZE.min} aria-label={t('speaker.smaller')}>A−</button>
                <button data-speaker="notes-larger" onClick={() => resize(NOTES_SIZE.step)} disabled={size >= NOTES_SIZE.max} aria-label={t('speaker.larger')}>A+</button>
              </span>
            </h2>
            <div className={`speaker-notes-text${notes ? '' : ' empty'}`} data-speaker="notes" style={{ fontSize: size }}>
              {notes ?? t('pres.notes.none')}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}
