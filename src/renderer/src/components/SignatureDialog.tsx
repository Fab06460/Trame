import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  addStroke, extendStroke, inkAspect, inkShape, MAX_IMAGE_CHARS, PAD_HEIGHT, PAD_WIDTH, parseSignatures, serializeSignatures, shapeStroke, SIG_COLORS, SIG_WIDTHS,
  withSignature, type Ink, type SigStroke, type SigWidth, type StoredSignature
} from '@/signature'
import { insertInk, insertSignatureImage, insertStored, paperlessPng, readSourcePixels, type SourcePixels } from '@/signatureActions'
import { useSignature } from '@/store/signature'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

const WIDTH_KEYS = Object.keys(SIG_WIDTHS) as SigWidth[]

/** Dessine les traits sur la zone de tracé (fond transparent : la ligne de signature est un décor CSS). */
function paint(canvas: HTMLCanvasElement, strokes: readonly SigStroke[], color: string, width: number): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(PAD_WIDTH * dpr)
  canvas.height = Math.round(PAD_HEIGHT * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    const pts = shapeStroke(s)
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.stroke()
  }
}

export function SignatureDialog(): React.JSX.Element | null {
  const open = useSignature((s) => s.open)
  return open ? <Dialog onClose={() => useSignature.getState().setOpen(false)} /> : null
}

type Mode = 'draw' | 'import'

function Dialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const pad = useRef<HTMLCanvasElement>(null)
  /** trait en cours : plusieurs relevés peuvent arriver avant le prochain affichage, l'état seul en perdrait */
  const live = useRef<SigStroke | null>(null)
  const [mode, setMode] = useState<Mode>('draw')
  const [strokes, setStrokes] = useState<SigStroke[]>([])
  const [current, setCurrent] = useState<SigStroke | null>(null)
  const [color, setColor] = useState<string>(SIG_COLORS[0])
  const [thickness, setThickness] = useState<SigWidth>('medium')
  const [keep, setKeep] = useState(true)
  const [saved, setSaved] = useState<StoredSignature[]>([])
  const [source, setSource] = useState<SourcePixels | null>(null)
  const [tolerance, setTolerance] = useState(0.5)
  /** couleur imposée à l'image importée ; null = couleurs d'origine */
  const [recolor, setRecolor] = useState<string | null>(SIG_COLORS[0])
  const [problem, setProblem] = useState<MessageKey | null>(null)

  useEffect(() => {
    let alive = true
    void window.trame.loadSignatures().then((json) => alive && setSaved(parseSignatures(json)))
    return () => {
      alive = false
    }
  }, [])

  // Échap ferme la boîte même si rien n'y a le focus (juste après l'ouverture)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const width = SIG_WIDTHS[thickness]
  useEffect(() => {
    if (pad.current) paint(pad.current, current ? [...strokes, current] : strokes, color, width)
  }, [strokes, current, color, width, mode])

  const processed = useMemo(() => (source ? paperlessPng(source, { recolor, tolerance }) : null), [source, recolor, tolerance])
  const ink: Ink = { strokes, width, color }

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) * PAD_WIDTH) / r.width, ((e.clientY - r.top) * PAD_HEIGHT) / r.height]
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    live.current = [point(e)]
    setCurrent(live.current)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!live.current) return
    live.current = extendStroke(live.current, point(e))
    setCurrent(live.current)
  }
  const up = (): void => {
    const stroke = live.current
    live.current = null
    if (!stroke) return
    setStrokes((all) => addStroke(all, stroke))
    setCurrent(null)
  }

  const persist = async (next: StoredSignature[]): Promise<void> => {
    setSaved(next)
    await window.trame.saveSignatures(serializeSignatures(next))
  }

  const choose = async (): Promise<void> => {
    setProblem(null)
    const url = await window.trame.pickImage()
    if (!url) return
    try {
      setSource(await readSourcePixels(url))
    } catch {
      setSource(null)
      setProblem('imp.imageUnreadable')
    }
  }

  const canInsert = mode === 'draw' ? strokes.length > 0 : !!processed
  const insert = async (): Promise<void> => {
    if (mode === 'draw') {
      if (!insertInk(ink)) return
      if (keep) await persist(withSignature(saved, { id: nanoid(8), kind: 'ink', ink }))
    } else if (processed) {
      insertSignatureImage(processed.src, processed.aspect)
      if (keep && processed.src.length <= MAX_IMAGE_CHARS) await persist(withSignature(saved, { id: nanoid(8), kind: 'image', src: processed.src, aspect: processed.aspect }))
    }
    onClose()
  }

  const swatches = (value: string | null, pick: (c: string | null) => void, original: boolean): React.JSX.Element => (
    <div className="sig-swatches" role="group" aria-label={t('sig.ink')}>
      {original && (
        <button type="button" className={value === null ? 'sig-swatch original active' : 'sig-swatch original'} data-sig-ink="original" title={t('sig.ink.original')} onClick={() => pick(null)}>
          {t('sig.ink.original')}
        </button>
      )}
      {SIG_COLORS.map((c, i) => (
        <button
          key={c}
          type="button"
          className={value === c ? 'sig-swatch active' : 'sig-swatch'}
          style={{ background: c }}
          data-sig-ink={c}
          title={t(`sig.ink.${i}` as MessageKey)}
          aria-label={t(`sig.ink.${i}` as MessageKey)}
          onClick={() => pick(c)}
        />
      ))}
      <input type="color" data-field="sigCustom" title={t('sig.ink.custom')} aria-label={t('sig.ink.custom')} value={value ?? SIG_COLORS[0]} onChange={(e) => pick(e.target.value.toLowerCase())} />
    </div>
  )

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('sig.title')} data-signature-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide sig-dialog">
        <h3>{t('sig.title')}</h3>
        <p className="hint">{t('sig.hint')}</p>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'draw'} className={mode === 'draw' ? 'active' : ''} data-sig-mode="draw" onClick={() => setMode('draw')}>{t('sig.tab.draw')}</button>
          <button role="tab" aria-selected={mode === 'import'} className={mode === 'import' ? 'active' : ''} data-sig-mode="import" onClick={() => setMode('import')}>{t('sig.tab.import')}</button>
        </div>

        {mode === 'draw' ? (
          <>
            <div className="sig-pad">
              <canvas
                ref={pad}
                data-sig-pad
                aria-label={t('sig.pad')}
                style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              />
              {strokes.length === 0 && !current && <span className="sig-placeholder">{t('sig.pad.placeholder')}</span>}
            </div>
            <div className="row sig-tools">
              {swatches(color, (c) => c && setColor(c), false)}
              <div className="seg three sig-widths" role="group" aria-label={t('sig.width')}>
                {WIDTH_KEYS.map((k) => (
                  <button key={k} className={thickness === k ? 'active' : ''} data-sig-width={k} onClick={() => setThickness(k)}>{t(`sig.width.${k}` as MessageKey)}</button>
                ))}
              </div>
              <button data-action="sig-undo" disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>{t('sig.undo')}</button>
              <button data-action="sig-clear" disabled={!strokes.length} onClick={() => setStrokes([])}>{t('sig.clear')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="sig-preview" data-sig-preview>
              {processed ? <img src={processed.src} alt={t('sig.alt')} /> : <span className="sig-placeholder">{source ? t('sig.import.empty') : t('sig.import.hint')}</span>}
            </div>
            <div className="row sig-tools">
              <button data-action="sig-pick" onClick={() => void choose()}>{source ? t('sig.pick.other') : t('sig.pick')}</button>
              {swatches(recolor, setRecolor, true)}
              <label>
                {t('sig.tolerance')}
                <input type="range" data-field="sigTolerance" min={0} max={1} step={0.05} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
              </label>
            </div>
            {problem && <p className="hint warn" role="alert">{t(problem)}</p>}
          </>
        )}

        {saved.length > 0 && (
          <div className="sig-saved" data-sig-saved-list>
            <h4>{t('sig.saved')}</h4>
            <div className="sig-saved-row">
              {saved.map((s) => (
                <div key={s.id} className="sig-saved-item">
                  <button className="sig-saved-use" data-sig-saved={s.id} title={t('sig.saved.insert')} aria-label={t('sig.saved.insert')} onClick={() => { insertStored(s); onClose() }}>
                    <SavedThumb s={s} />
                  </button>
                  <button className="sig-saved-remove" data-sig-remove={s.id} title={t('sig.saved.remove')} aria-label={t('sig.saved.remove')} onClick={() => void persist(saved.filter((x) => x.id !== s.id))}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row sig-footer">
          <label className="check">
            <input type="checkbox" data-field="sigKeep" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('sig.keep')}
          </label>
          <span className="sig-grow" />
          <button data-action="sig-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" data-action="sig-insert" disabled={!canInsert} onClick={() => void insert()}>{t('sig.insert')}</button>
        </div>
      </div>
    </div>
  )
}

function SavedThumb({ s }: { s: StoredSignature }): React.JSX.Element {
  if (s.kind === 'image') return <img src={s.src} alt="" style={{ aspectRatio: String(s.aspect) }} />
  const shape = inkShape(s.ink, 160)
  const aspect = inkAspect(s.ink) ?? 1
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ aspectRatio: String(aspect) }} aria-hidden="true">
      {shape && <path d={shape.path} fill={s.ink.color} />}
    </svg>
  )
}
