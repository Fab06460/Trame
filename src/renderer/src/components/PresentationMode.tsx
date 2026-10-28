import { useCallback, useEffect, useRef, useState } from 'react'
import { renderPage } from '@/exportPages'
import { usePresentation } from '@/store/presentation'
import { DEFAULT_TRANSITION, TRANSITIONS, TRANSITION_MS, transitionDirection } from '@/transition'

const AUTO_CHOICES = [0, 3, 5, 10, 15]
/** Plus grand côté d'une image de présentation : au-delà, rien de visible sur un écran, mais beaucoup de mémoire. */
const MAX_SIDE = 4096

/**
 * Mode présentation : les pages en plein écran, une par une. Chaque page est rendue comme à l'export (mêmes polices, effets, ombres),
 * à la résolution de l'écran ; la suivante et la précédente sont préparées d'avance pour que le changement soit immédiat.
 */
export function PresentationMode(): React.JSX.Element | null {
  const active = usePresentation((s) => s.active)
  const doc = usePresentation((s) => s.doc)
  const index = usePresentation((s) => s.index)
  const [image, setImage] = useState<{ index: number; url: string } | null>(null)
  /** page qui s'efface pendant la transition (retirée au bout de la durée de l'animation) */
  const [leaving, setLeaving] = useState<{ index: number; url: string; dir: 1 | -1; n: number } | null>(null)
  const shown = useRef<{ index: number; url: string } | null>(null)
  const moves = useRef(0)
  const [controls, setControls] = useState(true)
  const [auto, setAuto] = useState(0)
  const [paused, setPaused] = useState(false)
  const [black, setBlack] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const cache = useRef(new Map<number, Promise<string>>())
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  /** la barre est utilisée (souris dessus ou focus dedans, menu déroulant ouvert compris) : elle ne se masque pas */
  /** dernière cible d'un mouvement de souris : dans la barre ou non (plus fiable que `:hover`, qui dépend du dernier rendu) */
  const overBar = useRef(false)
  const inUse = (): boolean => !!bar.current && (overBar.current || bar.current.contains(document.activeElement))

  const kind = doc?.transition ?? DEFAULT_TRANSITION
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
        if (prev && prev.index !== index && kind !== 'none') setLeaving({ ...prev, dir: transitionDirection(prev.index, index, doc.pages.length, auto > 0), n: ++moves.current })
        shown.current = { index, url }
        setImage({ index, url })
      },
      () => {}
    )
    for (const n of [index + 1, index - 1]) if (n >= 0 && n < doc.pages.length) void ensure(n).catch(() => {})
    return () => {
      live = false
    }
  }, [active, doc, index, ensure, kind, auto])

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
      if (k === 'Escape') exit()
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) s.go(s.index + 1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) s.go(s.index - 1)
      else if (k === 'Home') s.go(0)
      else if (k === 'End') s.go(last)
      else if (k.toLowerCase() === 'b') setBlack((b) => !b)
      else if (k.toLowerCase() === 'p') setPaused((p) => !p)
      else if (k.toLowerCase() === 'n') setShowNotes((n) => !n)
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
    <div className={`presentation${controls ? '' : ' idle'}`} data-presentation data-pres-index={index} role="dialog" aria-modal="true" aria-label="Présentation" onMouseMove={(e) => {
        overBar.current = !!bar.current?.contains(e.target as Node)
        wake()
      }} onClick={() => usePresentation.getState().go(index + 1)}>
      {!black && leaving && <img key={`out-${leaving.n}`} className={`presentation-page leaving t-${kind}`} style={{ '--dir': leaving.dir } as React.CSSProperties} src={leaving.url} alt="" aria-hidden draggable={false} data-pres-leaving={leaving.index} />}
      {!black && image && <img key={image.index} className={`presentation-page entering t-${kind}`} style={{ '--dir': leaving?.dir ?? 1 } as React.CSSProperties} src={image.url} alt={`Page ${image.index + 1}`} draggable={false} data-pres-shown={image.index} />}
      {!black && !image && <div className="presentation-loading" role="status">Préparation…</div>}
      {showNotes && (
        <div className={`presentation-notes${doc.pages[index].notes ? '' : ' empty'}`} data-pres="notes" onClick={(e) => e.stopPropagation()}>
          {doc.pages[index].notes ?? 'Aucune note pour cette page.'}
        </div>
      )}
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
        <button data-pres="prev" disabled={index === 0} onClick={() => usePresentation.getState().go(index - 1)} aria-label="Page précédente">‹</button>
        <span data-pres="counter">{index + 1} / {doc.pages.length}</span>
        <button data-pres="next" disabled={index === last} onClick={() => usePresentation.getState().go(index + 1)} aria-label="Page suivante">›</button>
        {doc.pages.length > 1 && (
          <label className="pres-auto" title="Lecture automatique en boucle (P : pause)">
            Auto
            <select data-pres="auto" value={auto} onChange={(e) => { setAuto(Number(e.target.value)); setPaused(false); e.currentTarget.blur() }}>
              {AUTO_CHOICES.map((s) => (
                <option key={s} value={s}>{s === 0 ? 'Non' : `${s} s`}</option>
              ))}
            </select>
          </label>
        )}
        <label className="pres-auto" title="Transition entre les pages (enregistrée avec le document)">
          Transition
          <select data-pres="transition" value={kind} onChange={(e) => { usePresentation.getState().setTransition(e.target.value as typeof kind); e.currentTarget.blur() }}>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <button data-pres="notes-toggle" aria-pressed={showNotes} onClick={() => setShowNotes((n) => !n)} title="Afficher les notes (N)">Notes</button>
        <button data-pres="exit" onClick={exit} title="Quitter (Échap)">✕ Quitter</button>
      </div>
    </div>
  )
}
