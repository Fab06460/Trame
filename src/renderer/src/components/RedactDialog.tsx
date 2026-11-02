import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCached } from '@/imageRender'
import { applyZones, DEFAULT_REDACT, REDACT_LEVELS, zoneFromDrag, type RedactSettings, type RedactZone } from '@/redact'
import { redactSource } from '@/redactImage'
import { useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import type { TrameElement } from '@/types'

/** Définition de l'aperçu : assez fine pour juger de l'effet, assez petite pour se recalculer à chaque geste. */
const PREVIEW = { width: 640, height: 400 }

type Point = { x: number; y: number }

/**
 * Flou et pixellisation de zones d'une image : on trace les zones sur l'image entière, on règle l'effet (le même pour toutes), puis
 * « Appliquer » REMPLACE l'image de l'élément par une version dont ces zones sont réellement masquées (un seul pas d'historique).
 */
export function RedactDialog({ el, onClose }: { el: TrameElement; onClose: () => void }): React.JSX.Element {
  const t = useT()
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useRef<ImageData | null>(null)
  const [ready, setReady] = useState(false)
  const [zones, setZones] = useState<RedactZone[]>([])
  const [settings, setSettings] = useState<RedactSettings>(DEFAULT_REDACT)
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // l'image entière, réduite à l'aperçu
  useEffect(() => {
    let live = true
    loadCached(el.src as string).then(
      (img) => {
        if (!live || !canvas.current) return
        const nw = img.naturalWidth || img.width
        const nh = img.naturalHeight || img.height
        const k = Math.min(PREVIEW.width / nw, PREVIEW.height / nh, 1)
        const c = canvas.current
        c.width = Math.max(1, Math.round(nw * k))
        c.height = Math.max(1, Math.round(nh * k))
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, c.width, c.height)
        base.current = ctx.getImageData(0, 0, c.width, c.height)
        setReady(true)
      },
      () => live && setError(t('imp.imageUnreadable'))
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.src])

  const shown = useMemo(() => (drag ? zoneFromDrag(drag.from, drag.to) : null), [drag])

  // aperçu : l'image d'origine, les zones masquées, puis le contour des zones (et du tracé en cours)
  useEffect(() => {
    const c = canvas.current
    if (!ready || !c || !base.current) return
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const px = new ImageData(new Uint8ClampedArray(base.current.data), base.current.width, base.current.height)
    applyZones(px, shown ? [...zones, shown] : zones, settings)
    ctx.putImageData(px, 0, 0)
    ctx.lineWidth = 2
    for (const z of shown ? [...zones, shown] : zones) {
      ctx.strokeStyle = z === shown ? '#ffffff' : '#7c5cff'
      ctx.setLineDash(z === shown ? [6, 4] : [])
      ctx.beginPath()
      if (settings.shape === 'ellipse') ctx.ellipse((z.x + z.width / 2) * c.width, (z.y + z.height / 2) * c.height, (z.width * c.width) / 2, (z.height * c.height) / 2, 0, 0, Math.PI * 2)
      else ctx.rect(z.x * c.width, z.y * c.height, z.width * c.width, z.height * c.height)
      ctx.stroke()
    }
  }, [ready, zones, settings, shown])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onClose])

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const finish = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drag) return
    const z = zoneFromDrag(drag.from, point(e))
    if (z) setZones((zs) => [...zs, z])
    setDrag(null)
  }

  const apply = async (): Promise<void> => {
    if (!zones.length || busy) return
    setBusy(true)
    setError('')
    try {
      const src = await redactSource(el.src as string, zones, settings)
      // l'image de PDF d'origine (refaite en vectoriel à l'export) ne doit plus servir : elle montrerait ce qui est masqué
      useEditor.getState().updateElement(el.id, { src, pdfSource: undefined })
      onClose()
    } catch (err) {
      setError(t('redact.error', { reason: err instanceof Error ? err.message : String(err) }))
      setBusy(false)
    }
  }

  const set = (patch: Partial<RedactSettings>): void => setSettings((s) => ({ ...s, ...patch }))

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('redact.title')} data-redact-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide redact-dialog">
        <h3>{t('redact.title')}</h3>
        <p className="hint">{t('redact.hint')}</p>
        <canvas
          ref={canvas}
          className="redact-canvas"
          data-redact-canvas
          aria-label={t('redact.title')}
          onPointerDown={(e) => {
            if (busy || !ready) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = point(e)
            setDrag({ from: p, to: p })
          }}
          onPointerMove={(e) => drag && setDrag({ from: drag.from, to: point(e) })}
          onPointerUp={finish}
          onPointerCancel={() => setDrag(null)}
        />
        <fieldset className="pages-choice" disabled={busy}>
          <legend>{t('redact.mode')}</legend>
          <label className="choice-row"><input type="radio" name="redact-mode" data-redact-mode="pixelate" checked={settings.mode === 'pixelate'} onChange={() => set({ mode: 'pixelate' })} /> {t('redact.mode.pixelate')}</label>
          <label className="choice-row"><input type="radio" name="redact-mode" data-redact-mode="blur" checked={settings.mode === 'blur'} onChange={() => set({ mode: 'blur' })} /> {t('redact.mode.blur')}</label>
        </fieldset>
        <fieldset className="pages-choice" disabled={busy}>
          <legend>{t('redact.shape')}</legend>
          <label className="choice-row"><input type="radio" name="redact-shape" data-redact-shape="rect" checked={settings.shape === 'rect'} onChange={() => set({ shape: 'rect' })} /> {t('redact.shape.rect')}</label>
          <label className="choice-row"><input type="radio" name="redact-shape" data-redact-shape="ellipse" checked={settings.shape === 'ellipse'} onChange={() => set({ shape: 'ellipse' })} /> {t('redact.shape.ellipse')}</label>
        </fieldset>
        <label>
          {t('redact.level')}
          <input type="range" data-redact-level min={REDACT_LEVELS.min} max={REDACT_LEVELS.max} value={settings.level} disabled={busy} onChange={(e) => set({ level: Number(e.target.value) })} />
        </label>
        <div className="row">
          <span className="hint" data-redact-count>{zones.length ? t('redact.count', { n: zones.length }) : t('redact.none')}</span>
          <button data-action="redact-undo-zone" disabled={busy || !zones.length} onClick={() => setZones((zs) => zs.slice(0, -1))}>{t('redact.removeLast')}</button>
          <button data-action="redact-clear" disabled={busy || !zones.length} onClick={() => setZones([])}>{t('redact.clear')}</button>
        </div>
        <p className="warn" data-redact-warn>{t('redact.warn')}</p>
        {error && <p className="warn" role="alert" data-redact-error>{error}</p>}
        <div className="row">
          <button data-action="redact-cancel" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" data-action="redact-apply" disabled={busy || !zones.length} onClick={() => void apply()}>{busy ? t('redact.applying') : t('redact.apply')}</button>
        </div>
      </div>
    </div>
  )
}
