import { useEffect, useMemo, useRef, useState } from 'react'
import { contrastRatio, parseHex } from '@/accessibility'
import { PALETTES } from '@/chart'
import { allFonts, FONTS } from '@/fonts'
import { useEditor, selectPage } from '@/store/editor'
import { useWordCloud } from '@/store/wordCloud'
import { cloudElements, DEFAULT_CLOUD_WORDS, layoutCloud, MAX_CLOUD_INPUT, MAX_CLOUD_WORDS, parseCloudInput, readableColors, type PlacedWord } from '@/wordCloud'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import type { ChartSpec } from '@/types'

/** Largeur de l'espace où la disposition est calculée : l'aperçu et la page en sont des mises à l'échelle (même disposition). */
const SPACE = 1000
const PREVIEW_WIDTH = 560

const contrast = (a: string, b: string): number | null => {
  const x = parseHex(a)
  const y = parseHex(b)
  return x && y ? contrastRatio(x, y) : null
}

/** Largeur d'un mot : mesurée une fois à 100 px puis mise à l'échelle (la largeur d'un texte est proportionnelle à sa taille). */
function makeMeasure(family: string): (text: string, size: number) => number {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.font = `bold 100px ${family}`
  const cache = new Map<string, number>()
  return (text, size) => {
    let w = cache.get(text)
    if (w === undefined) cache.set(text, (w = ctx.measureText(text).width))
    return (w * size) / 100
  }
}

/**
 * Nuage de mots : on colle un texte ou une liste, on règle l'aspect avec un aperçu, et « Insérer » pose sur la page un groupe de textes
 * ordinaires (un par mot), modifiables ensuite comme n'importe quel texte.
 */
export function WordCloudDialog(): React.JSX.Element | null {
  const open = useWordCloud((s) => s.open)
  return open ? <Cloud onClose={() => useWordCloud.getState().setOpen(false)} /> : null
}

function Cloud({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT()
  const doc = useEditor((s) => s.doc)
  const background = useEditor((s) => selectPage(s).background)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [input, setInput] = useState('')
  const [exclude, setExclude] = useState('')
  const [max, setMax] = useState(DEFAULT_CLOUD_WORDS)
  const [palette, setPalette] = useState<ChartSpec['palette']>('safe')
  const [family, setFamily] = useState(FONTS[1].family)
  const [vertical, setVertical] = useState(false)
  const [seed, setSeed] = useState(1)
  const [placed, setPlaced] = useState<PlacedWord[]>([])

  const parsed = useMemo(() => parseCloudInput(input, { exclude: exclude.split(/[,;\n]/), max }), [input, exclude, max])
  const height = Math.round((SPACE * doc.height) / doc.width)
  const colors = useMemo(() => readableColors(PALETTES[palette], background, contrast), [palette, background])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // disposition : la police doit être prête pour que les largeurs mesurées soient les bonnes
  useEffect(() => {
    let live = true
    void document.fonts.load(`bold 32px ${family}`, 'Aa Éé').catch(() => []).then(() => {
      if (live) setPlaced(layoutCloud(parsed.words, { width: SPACE, height }, makeMeasure(family), { seed, vertical }))
    })
    return () => {
      live = false
    }
  }, [parsed, family, vertical, seed, height])

  // aperçu : la page (son fond) avec les mots, chacun centré sur son rectangle
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const k = PREVIEW_WIDTH / SPACE
    c.width = PREVIEW_WIDTH
    c.height = Math.round(height * k)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of placed) {
      ctx.save()
      ctx.translate((p.x + p.width / 2) * k, (p.y + p.height / 2) * k)
      if (p.vertical) ctx.rotate(Math.PI / 2)
      ctx.font = `bold ${p.size * k}px ${family}`
      ctx.fillStyle = colors[p.rank % colors.length]
      ctx.fillText(p.text, 0, 0)
      ctx.restore()
    }
  }, [placed, family, colors, background, height])

  const insert = (): void => {
    if (!placed.length) return
    useEditor.getState().insertChart(cloudElements(placed, { x: 0, y: 0, scale: doc.width / SPACE }, family, colors))
    onClose()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('cloud.title')} data-cloud-dialog onKeyDown={(e) => e.stopPropagation()}>
      <div className="modal wide cloud-dialog">
        <h3>{t('cloud.title')}</h3>
        <p className="hint">{t('cloud.hint')}</p>
        <textarea
          className="text-field"
          data-field="cloudText"
          rows={6}
          maxLength={MAX_CLOUD_INPUT}
          placeholder={t('cloud.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <p className="hint" data-cloud-info>
          {input.trim() ? t(`cloud.mode.${parsed.mode}` as MessageKey) : ''} {parsed.words.length ? t('cloud.count', { n: placed.length, total: parsed.distinct }) : ''}
        </p>
        <canvas ref={canvas} className="cloud-preview" data-cloud-preview aria-label={t('cloud.preview')} />
        <div className="row">
          <label>
            {t('cloud.max')}
            <input type="range" data-field="cloudMax" min={10} max={MAX_CLOUD_WORDS} value={max} onChange={(e) => setMax(Number(e.target.value))} />
            <span className="hint">{max}</span>
          </label>
          <label className="check">
            <input type="checkbox" data-field="cloudVertical" checked={vertical} onChange={(e) => setVertical(e.target.checked)} /> {t('cloud.vertical')}
          </label>
        </div>
        <div className="row">
          <label>
            {t('cloud.font')}
            <select data-field="cloudFont" value={family} onChange={(e) => setFamily(e.target.value)}>
              {allFonts().map((f) => (
                <option key={f.family} value={f.family}>{f.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('chart.palette')}
            <select data-field="cloudPalette" value={palette} onChange={(e) => setPalette(e.target.value as ChartSpec['palette'])}>
              <option value="safe">{t('chart.palette.safe')}</option>
              <option value="violet">{t('chart.palette.violet')}</option>
              <option value="gray">{t('chart.palette.gray')}</option>
            </select>
          </label>
          <button data-action="cloud-shuffle" title={t('cloud.shuffle.title')} onClick={() => setSeed((s) => s + 1)}>{t('cloud.shuffle')}</button>
        </div>
        <label>
          {t('cloud.exclude')}
          <input type="text" className="text-field" data-field="cloudExclude" placeholder={t('cloud.exclude.placeholder')} value={exclude} onChange={(e) => setExclude(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        <div className="row">
          <button data-action="cloud-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" data-action="cloud-insert" disabled={!placed.length} onClick={insert}>{t('cloud.insert')}</button>
        </div>
      </div>
    </div>
  )
}
