import { useCallback, useEffect, useRef, useState } from 'react'
import { LaserPointer } from '@/components/LaserPointer'
import { InkLayer } from '@/components/InkLayer'
import { addStroke, INK_COLORS, type InkTool, type Stroke } from '@/annotation'
import { renderPage } from '@/exportPages'
import { usePresentation } from '@/store/presentation'
import { DEFAULT_TRANSITION, TRANSITIONS, TRANSITION_MS, pageTransition, transitionBetween, transitionDirection, transitionLabel, type PageTransition } from '@/transition'
import { useT } from '@/i18n'

const AUTO_CHOICES = [0, 3, 5, 10, 15]
/** Plus grand côté d'une image de présentation : au-delà, rien de visible sur un écran, mais beaucoup de mémoire. */
const MAX_SIDE = 4096

/**
 * Mode présentation : les pages en plein écran, une par une. Chaque page est rendue comme à l'export (mêmes polices, effets, ombres),
 * à la résolution de l'écran ; la suivante et la précédente sont préparées d'avance pour que le changement soit immédiat.
 */
export function PresentationMode(): React.JSX.Element | null {
  const t = useT()
  const active = usePresentation((s) => s.active)
  const doc = usePresentation((s) => s.doc)
  const index = usePresentation((s) => s.index)
  const [image, setImage] = useState<{ index: number; url: string; kind: PageTransition } | null>(null)
  /** page qui s'efface pendant la transition (retirée au bout de la durée de l'animation) */
  const [leaving, setLeaving] = useState<{ index: number; url: string; dir: 1 | -1; n: number; kind: PageTransition } | null>(null)
  const shown = useRef<{ index: number; url: string; kind: PageTransition } | null>(null)
  const moves = useRef(0)
  const [controls, setControls] = useState(true)
  const [auto, setAuto] = useState(0)
  const [paused, setPaused] = useState(false)
  const [black, setBlack] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [laser, setLaser] = useState(false)
  const [onBar, setOnBar] = useState(false)
  /** annotations à l'écran : traits par page (le temps de la présentation seulement) et réglages du stylo */
  const [draw, setDraw] = useState(false)
  const [ink, setInk] = useState<Record<string, Stroke[]>>({})
  const [tool, setTool] = useState<InkTool>('pen')
  const [color, setColor] = useState<string>(INK_COLORS[0])
  const startedAt = usePresentation((s) => s.startedAt)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const cache = useRef(new Map<number, Promise<string>>())
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  /** la barre est utilisée (souris dessus ou focus dedans, menu déroulant ouvert compris) : elle ne se masque pas */
  /** dernière cible d'un mouvement de souris : dans la barre ou non (plus fiable que `:hover`, qui dépend du dernier rendu) */
  const overBar = useRef(false)
  const inUse = (): boolean => !!bar.current && (overBar.current || bar.current.contains(document.activeElement))

  const kind = doc?.transition ?? DEFAULT_TRANSITION
  const drawRef = useRef(false)
  drawRef.current = draw

  // Écran de l'orateur : seconde fenêtre (voir main/speakerProtocol.ts), synchronisée dans les deux sens
  const toggleSpeaker = (): void => {
    if (speaker) {
      window.trame.speakerClose()
      return
    }
    const s = usePresentation.getState()
    if (!s.doc) return
    void window.trame.speakerOpen({ doc: JSON.stringify(s.doc), index: s.index, black, startedAt: s.startedAt }).then((r) => r && setSpeaker(true))
  }
  const toggleSpeakerRef = useRef(toggleSpeaker)
  toggleSpeakerRef.current = toggleSpeaker
  useEffect(() => {
    if (active && speaker) window.trame.speakerSync({ doc: null, index, black, startedAt })
  }, [active, speaker, index, black, startedAt])
  useEffect(() => {
    if (!active) return
    const offCommand = window.trame.onSpeakerCommand((cmd) => {
      if (cmd.type === 'go') usePresentation.getState().go(cmd.index)
      else if (cmd.type === 'black') setBlack((b) => !b)
      else if (cmd.type === 'exit') usePresentation.getState().stop()
    })
    const offClosed = window.trame.onSpeakerClosed(() => {
      setSpeaker(false)
      // un seul écran : la présentation avait laissé le plein écran à l'écran de l'orateur, elle le reprend
      if (usePresentation.getState().active) void window.trame.setFullScreen(true)
    })
    return () => {
      offCommand()
      offClosed()
    }
  }, [active])
  // la présentation se termine : l'écran de l'orateur se ferme avec elle
  useEffect(() => {
    if (!active && speaker) {
      window.trame.speakerClose()
      setSpeaker(false)
    }
  }, [active, speaker])
  const exit = useCallback(() => usePresentation.getState().stop(), [])

  // plein écran à l'ouverture, retour à la fenêtre à la fermeture ; sortie du plein écran par le système = fin de la présentation
  useEffect(() => {
    if (!active) return
    void window.trame.setFullScreen(true)
    const off = window.trame.onLeaveFullScreen(exit)
    return () => {
      off()
      void window.trame.setFullScreen(false)
    }
  }, [active, exit])

  useEffect(() => {
    if (!active) return
    cache.current.clear()
    shown.current = null
    setImage(null)
    setLeaving(null)
    setBlack(false)
    setShowNotes(false)
    setSpeaker(false)
    setLaser(false)
    setDraw(false)
    setInk({})
    setTool('pen')
    setColor(INK_COLORS[0])
    setOnBar(false)
    setAuto(0)
    setPaused(false)
    setControls(true)
  }, [active])

  // changement de taille de fenêtre : les images en cache n'ont plus la bonne résolution
  useEffect(() => {
    if (!active) return
    const onResize = (): void => {
      cache.current.clear()
      setSize({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  const ensure = useCallback(
    (i: number): Promise<string> => {
      if (!doc) return Promise.reject(new Error('aucun document'))
      let p = cache.current.get(i)
      if (!p) {
        const fit = Math.min(size.w / doc.width, size.h / doc.height)
        const scale = Math.min(fit * Math.min(window.devicePixelRatio || 1, 2), MAX_SIDE / Math.max(doc.width, doc.height))
        p = renderPage(doc, doc.pages[i], 'image/jpeg', undefined, { scale, quality: 0.92 })
        cache.current.set(i, p)
        p.catch(() => cache.current.delete(i))
      }
      return p
    },
    [doc, size]
  )

  // page affichée + préparation des voisines
  useEffect(() => {
    if (!active || !doc) return
    let live = true
    void ensure(index).then(
      (url) => {
        if (!live) return
        const prev = shown.current
        // une page d'arrivée différente de celle qui est affichée : la précédente reste en dessous le temps de la transition
        // transition de la page d'arrivée (en reculant : celle de la page quittée), voir transitionBetween
        const move = prev && prev.index !== index ? transitionBetween(doc, prev.index, index) : null
        if (prev && move && move !== 'none') setLeaving({ ...prev, dir: transitionDirection(prev.index, index, doc.pages.length, auto > 0), n: ++moves.current, kind: move })
        // la classe de l'image arrivante ne change plus ensuite (un changement relancerait l'animation)
        const entry = { index, url, kind: move ?? (prev?.index === index ? prev.kind : pageTransition(doc, index)) }
        shown.current = entry
        setImage(entry)
      },
      () => {}
    )
    for (const n of [index + 1, index - 1]) if (n >= 0 && n < doc.pages.length) void ensure(n).catch(() => {})
    return () => {
      live = false
    }
  }, [active, doc, index, ensure, auto])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(null), TRANSITION_MS + 60)
    return () => clearTimeout(t)
  }, [leaving])

  // lecture automatique (boucle)
  useEffect(() => {
    if (!active || !doc || auto === 0 || paused) return
    const t = setTimeout(() => usePresentation.getState().go(index + 1 >= doc.pages.length ? 0 : index + 1), auto * 1000)
    return () => clearTimeout(t)
  }, [active, doc, auto, paused, index])

  const wake = useCallback(() => {
    setControls(true)
    if (idle.current) clearTimeout(idle.current)
    const hideLater = (): void => {
      idle.current = setTimeout(() => (inUse() ? hideLater() : setControls(false)), 3500)
    }
    hideLater()
  }, [])

  // clavier : tout est capturé, les raccourcis de l'éditeur ne doivent pas agir pendant la présentation
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      const s = usePresentation.getState()
      const last = (s.doc?.pages.length ?? 1) - 1
      const k = e.key
      let handled = true
      const pageId = s.doc?.pages[s.index]?.id
      if (k === 'Escape') {
        if (drawRef.current) setDraw(false)
        else exit()
      }
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) s.go(s.index + 1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) s.go(s.index - 1)
      else if (k === 'Home') s.go(0)
      else if (k === 'End') s.go(last)
      else if (k.toLowerCase() === 'b') setBlack((b) => !b)
      else if (k.toLowerCase() === 'p') setPaused((p) => !p)
      else if (k.toLowerCase() === 'n') setShowNotes((n) => !n)
      else if (k.toLowerCase() === 'l') {
        setDraw(false)
        setLaser((l) => !l)
      } else if (k.toLowerCase() === 'd') {
        setLaser(false)
        setDraw((d) => !d)
      } else if (k.toLowerCase() === 'h' && drawRef.current) setTool((x) => (x === 'pen' ? 'highlighter' : 'pen'))
      else if (k.toLowerCase() === 'z' && !(e.metaKey || e.ctrlKey) && pageId) setInk((m) => (m[pageId]?.length ? { ...m, [pageId]: m[pageId].slice(0, -1) } : m))
      else if (k.toLowerCase() === 'c' && !(e.metaKey || e.ctrlKey) && pageId) setInk((m) => (m[pageId]?.length ? { ...m, [pageId]: [] } : m))
      else if (drawRef.current && /^[1-5]$/.test(k)) setColor(INK_COLORS[Number(k) - 1])
      else if (k.toLowerCase() === 's') toggleSpeakerRef.current()
      else handled = false
      if (handled || !(e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
      }
      wake()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, exit, wake])

  // les commandes et le curseur se masquent quand la souris ne bouge plus
  useEffect(() => {
    if (active) wake()
    return () => {
      if (idle.current) clearTimeout(idle.current)
    }
  }, [active, index, wake])

  if (!active || !doc) return null
  const last = doc.pages.length - 1
  return (
    <div className={`presentation${controls ? '' : ' idle'}${laser ? ' laser' : ''}${draw ? ' drawing' : ''}`} data-presentation data-pres-index={index} data-pres-laser={laser || undefined} data-pres-draw={draw || undefined} role="dialog" aria-modal="true" aria-label={t('pres.dialog')} onMouseMove={(e) => {
        overBar.current = !!bar.current?.contains(e.target as Node)
        if (laser) setOnBar(overBar.current)
        wake()
      }} onClick={() => usePresentation.getState().go(index + 1)}>
      {!black && leaving && <img key={`out-${leaving.n}`} className={`presentation-page leaving t-${leaving.kind}`} style={{ '--dir': leaving.dir } as React.CSSProperties} src={leaving.url} alt="" aria-hidden draggable={false} data-pres-leaving={leaving.index} />}
      {!black && image && <img key={image.index} className={`presentation-page entering t-${image.kind}`} style={{ '--dir': leaving?.dir ?? 1 } as React.CSSProperties} src={image.url} alt={t('pres.page', { page: image.index + 1 })} draggable={false} data-pres-shown={image.index} />}
      {!black && !image && <div className="presentation-loading" role="status">{t('pres.preparing')}</div>}
      {showNotes && (
        <div className={`presentation-notes${doc.pages[index].notes ? '' : ' empty'}`} data-pres="notes" onClick={(e) => e.stopPropagation()}>
          {doc.pages[index].notes ?? t('pres.notes.none')}
        </div>
      )}
      {!black && <InkLayer strokes={ink[doc.pages[index].id] ?? []} drawing={draw} tool={tool} color={color} docWidth={doc.width} docHeight={doc.height} onStroke={(st) => setInk((m) => ({ ...m, [doc.pages[index].id]: addStroke(m[doc.pages[index].id] ?? [], st) }))} />}
      {laser && <LaserPointer hidden={onBar} />}
      <div
        ref={bar}
        className="presentation-bar"
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => {
          overBar.current = false
          wake()
        }}
        onBlur={wake}
      >
        <button data-pres="prev" disabled={index === 0} onClick={() => usePresentation.getState().go(index - 1)} aria-label={t('pres.prev')}>‹</button>
        <span data-pres="counter">{index + 1} / {doc.pages.length}</span>
        <button data-pres="next" disabled={index === last} onClick={() => usePresentation.getState().go(index + 1)} aria-label={t('pres.next')}>›</button>
        {doc.pages.length > 1 && (
          <label className="pres-auto" title={t('pres.auto.title')}>
            {t('pres.auto')}
            <select data-pres="auto" value={auto} onChange={(e) => { setAuto(Number(e.target.value)); setPaused(false); e.currentTarget.blur() }}>
              {AUTO_CHOICES.map((s) => (
                <option key={s} value={s}>{s === 0 ? t('pres.auto.none') : t('pres.auto.seconds', { s })}</option>
              ))}
            </select>
          </label>
        )}
        <label className="pres-auto" title={t('pres.transition.title')}>
          {t('pres.transition')}
          <select data-pres="transition" value={kind} onChange={(e) => { usePresentation.getState().setTransition(e.target.value as typeof kind); e.currentTarget.blur() }}>
            {TRANSITIONS.map((x) => (
              <option key={x.id} value={x.id}>{transitionLabel(x.id)}</option>
            ))}
          </select>
        </label>
        <button data-pres="laser" aria-pressed={laser} onClick={() => { setDraw(false); setLaser((l) => !l) }} title={t('pres.laser.title')}>{t('pres.laser')}</button>
        <button data-pres="draw" aria-pressed={draw} onClick={() => { setLaser(false); setDraw((d) => !d) }} title={t('pres.draw.title')}>{t('pres.draw')}</button>
        <button data-pres="speaker" aria-pressed={speaker} onClick={toggleSpeaker} title={t('pres.speaker.title')}>{t('pres.speaker')}</button>
        {draw && (
          <div className="presentation-ink" data-pres="ink-tools" role="toolbar" aria-label={t('pres.ink.tools')}>
            {INK_COLORS.map((c, i) => (
              <button key={c} className="ink-swatch" data-pres-color={c} aria-pressed={color === c} aria-label={t('pres.ink.color', { n: i + 1 })} title={t('pres.ink.color', { n: i + 1 })} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
            <button data-pres="highlighter" aria-pressed={tool === 'highlighter'} onClick={() => setTool((x) => (x === 'pen' ? 'highlighter' : 'pen'))} title={t('pres.ink.highlighter.title')}>{t('pres.ink.highlighter')}</button>
            <button data-pres="ink-undo" disabled={!(ink[doc.pages[index].id]?.length)} onClick={() => setInk((m) => ({ ...m, [doc.pages[index].id]: (m[doc.pages[index].id] ?? []).slice(0, -1) }))} title={t('pres.ink.undo.title')}>{t('pres.ink.undo')}</button>
            <button data-pres="ink-clear" disabled={!(ink[doc.pages[index].id]?.length)} onClick={() => setInk((m) => ({ ...m, [doc.pages[index].id]: [] }))} title={t('pres.ink.clear.title')}>{t('pres.ink.clear')}</button>
          </div>
        )}
        <button data-pres="notes-toggle" aria-pressed={showNotes} onClick={() => setShowNotes((n) => !n)} title={t('pres.notes.title')}>{t('pres.notes')}</button>
        <button data-pres="exit" onClick={exit} title={t('pres.exit.title')}>{t('pres.exit')}</button>
      </div>
    </div>
  )
}
