import { nanoid } from 'nanoid'
import { contrastRatio, parseHex, type Rgb } from '@/accessibility'
import type { ChartSpec, TrameElement } from '@/types'

export type { ChartSpec }
export type ChartKind = ChartSpec['kind']

export const CHART_KINDS: ChartKind[] = ['bar', 'hbar', 'line', 'pie', 'table']
export const MAX_CHART_ROWS = 60
export const MAX_CHART_COLUMNS = 12
export const MAX_CHART_SERIES = 8

/** Couleurs des séries. « safe » : palette Okabe-Ito, distinguable par la plupart des daltoniens. */
export const PALETTES: Record<ChartSpec['palette'], string[]> = {
  safe: ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#555555'],
  violet: ['#4c2fd6', '#7c5cff', '#a58bff', '#c9bbff', '#2d1b8f', '#6b4de0', '#8f78ff', '#dcd3ff'],
  gray: ['#222222', '#555555', '#808080', '#a6a6a6', '#c4c4c4', '#3a3a3a', '#6b6b6b', '#999999']
}

interface Theme {
  card: string
  border: string
  text: string
  muted: string
  grid: string
  axis: string
}
const THEMES: Record<ChartSpec['theme'], Theme> = {
  light: { card: '#ffffff', border: '#e1e3ea', text: '#1e1f24', muted: '#4a4b57', grid: '#e1e3ea', axis: '#8a8c99' },
  dark: { card: '#1e1f24', border: '#3a3b45', text: '#ffffff', muted: '#c9cad3', grid: '#3a3b45', axis: '#8a8c99' }
}

/** Nombre lu dans une cellule : « 12,5 », « 1 200 », « 45 % », « 3,50 € », « -2 ». Illisible : null. */
export function parseNumber(cell: string): number | null {
  const s = cell.replace(/[\s  ]/g, '').replace(/[%€$£]/g, '')
  if (!s) return null
  // « 1.234,56 » (milliers en point) ou « 1,234.56 » (milliers en virgule) : le dernier séparateur est la décimale
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let t = s
  if (lastComma >= 0 && lastDot >= 0) t = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (lastComma >= 0) t = s.replace(',', '.')
  return /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : null
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const textWidth = (s: string, fs: number, bold = false): number => s.length * fs * (bold ? 0.6 : 0.56)

/** Texte coupé pour tenir dans une largeur (estimée), avec « … ». */
export function fitLabel(s: string, width: number, fs: number): string {
  const max = Math.max(1, Math.floor(width / (fs * 0.56)))
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/** Valeur affichée : entier sans décimales, sinon deux au plus, dans la langue demandée. */
export const formatValue = (v: number, locale: string): string => v.toLocaleString(locale, { maximumFractionDigits: 2 })

/** Graduations « rondes » (1, 2, 5 × 10ⁿ) couvrant [min, max]. */
export function niceTicks(min: number, max: number, count = 5): { min: number; max: number; step: number; values: number[] } {
  if (!(max > min)) {
    max = min + 1
  }
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const lo = Math.floor(min / step + 1e-9) * step
  const hi = Math.ceil(max / step - 1e-9) * step
  const values: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) values.push(Math.round(v / step) * step)
  return { min: lo, max: hi, step, values }
}

/** Une série par colonne de valeurs ; les cellules illisibles comptent 0 et sont comptées à part. */
export function chartData(spec: ChartSpec): { labels: string[]; series: Array<{ name: string; values: number[] }>; invalid: number } {
  let invalid = 0
  const labels = spec.rows.map((r) => r[spec.labelColumn] ?? '')
  const series = spec.valueColumns.map((c) => ({
    name: spec.columns[c] ?? '',
    values: spec.rows.map((r) => {
      const n = parseNumber(r[c] ?? '')
      if (n === null) invalid++
      return n ?? 0
    })
  }))
  return { labels, series, invalid }
}

/** Colonnes (hors étiquettes) dont la plupart des cellules sont des nombres : celles qu'un graphique peut tracer. */
export function numericColumns(columns: string[], rows: string[][]): number[] {
  return columns.map((_, c) => c).filter((c) => {
    const filled = rows.filter((r) => (r[c] ?? '').trim() !== '')
    return filled.length > 0 && filled.filter((r) => parseNumber(r[c]) !== null).length / filled.length >= 0.8
  })
}

/** Réglages par défaut d'un graphique à partir d'un tableau : première colonne = étiquettes, trois premières colonnes numériques = séries. */
export function defaultSpec(kind: ChartKind, columns: string[], rows: string[][], title = ''): ChartSpec {
  const numeric = numericColumns(columns, rows).filter((c) => c !== 0)
  const valueColumns = (numeric.length ? numeric : columns.map((_, i) => i).filter((i) => i !== 0)).slice(0, kind === 'pie' ? 1 : 3)
  return { kind, title, columns, rows, labelColumn: 0, valueColumns: valueColumns.length ? valueColumns : [0], showValues: kind === 'pie' || rows.length <= 8, showLegend: true, palette: 'safe', theme: 'light' }
}

export interface ChartBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ChartResult {
  /** premier élément = fond (porte la description) ; tous partagent `groupId` */
  elements: TrameElement[]
  /** cellules de valeur illisibles (comptées 0) */
  invalid: number
  /** lignes du tableau qui ne tiennent pas dans le cadre */
  hiddenRows: number
}

const FONT = '"Inter", sans-serif'

/** Texte lisible sur une couleur de fond : noir ou blanc, selon le meilleur contraste. */
const textOn = (bg: string): string => {
  const c = parseHex(bg) ?? ([255, 255, 255] as Rgb)
  return contrastRatio([255, 255, 255], c) >= contrastRatio([30, 31, 36], c) ? '#ffffff' : '#1e1f24'
}

/**
 * Éléments qui dessinent un graphique ou un tableau dans `box` : rectangles, formes et textes ordinaires, donc rendus tels quels par
 * l'éditeur, les exports image, PDF, PowerPoint, SVG et la présentation web. Les graduations sont arrondies, les étiquettes trop
 * longues coupées, les valeurs masquées quand les barres sont trop étroites.
 */
export function chartElements(spec: ChartSpec, box: ChartBox, options: { locale: string; groupId?: string }): ChartResult {
  const groupId = options.groupId ?? nanoid(8)
  const th = THEMES[spec.theme]
  const colors = PALETTES[spec.palette]
  const out: TrameElement[] = []
  const add = (e: Partial<TrameElement> & Pick<TrameElement, 'type' | 'x' | 'y' | 'width' | 'height'>): TrameElement => {
    const el = { id: nanoid(8), rotation: 0, opacity: 1, fill: th.text, groupId, ...e } as TrameElement
    out.push(el)
    return el
  }
  const text = (x: number, y: number, width: number, value: string, fs: number, extra: Partial<TrameElement> = {}): void => {
    add({ type: 'text', x, y, width, height: fs * 1.25, text: value, fontSize: fs, fontFamily: FONT, fontStyle: 'normal', align: 'left', fill: th.text, ...extra })
  }
  const rect = (x: number, y: number, width: number, height: number, fill: string, extra: Partial<TrameElement> = {}): void => {
    add({ type: 'rect', x, y, width: Math.max(0, width), height: Math.max(0, height), fill, ...extra })
  }

  const { x, y, width: w, height: h } = box
  const anchor = add({ type: 'rect', x, y, width: w, height: h, fill: th.card, cornerRadius: 12, stroke: th.border, strokeWidth: 1, name: 'chart', chart: spec })
  void anchor
  const data = chartData(spec)
  const n = spec.rows.length
  const pad = Math.round(Math.min(w, h) * 0.05)
  let top = y + pad
  if (spec.title.trim()) {
    const fs = clamp(Math.round(h * 0.07), 14, 44)
    text(x + pad, top, w - 2 * pad, fitLabel(spec.title.trim(), w - 2 * pad, fs * 1.07), fs, { fontStyle: 'bold' })
    top += fs * 1.45
  }
  let hiddenRows = 0

  const legendEntries = spec.kind === 'pie' ? data.labels.map((l, i) => ({ name: l, color: colors[i % colors.length] })) : data.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }))
  const wantLegend = spec.showLegend && (spec.kind === 'pie' ? n > 0 : data.series.length > 1) && spec.kind !== 'table'
  const fsL = clamp(Math.round(h * 0.04), 11, 20)
  let bottom = y + h - pad
  if (wantLegend && spec.kind !== 'pie') {
    // une ligne sous le graphique : pastille + nom, noms coupés si besoin
    const slot = (w - 2 * pad) / legendEntries.length
    legendEntries.forEach((e, i) => {
      const lx = x + pad + i * slot
      rect(lx, bottom - fsL, fsL * 0.8, fsL * 0.8, e.color, { cornerRadius: 2 })
      text(lx + fsL * 1.1, bottom - fsL * 1.15, slot - fsL * 1.2, fitLabel(e.name, slot - fsL * 1.3, fsL), fsL, { fill: th.muted })
    })
    bottom -= fsL * 1.9
  }

  if (spec.kind === 'table') {
    const cols = spec.columns
    const availH = bottom - top
    const rowH = clamp(Math.floor(availH / (n + 1)), 22, 56)
    const fit = Math.max(0, Math.floor(availH / rowH) - 1)
    const shown = spec.rows.slice(0, fit)
    hiddenRows = n - shown.length
    const fs = clamp(Math.round(rowH * 0.46), 9, 26)
    const weights = cols.map((c, ci) => clamp(Math.max(c.length, ...shown.map((r) => (r[ci] ?? '').length)), 4, 28))
    const total = weights.reduce((a, b) => a + b, 0)
    const innerW = w - 2 * pad
    const numeric = new Set(numericColumns(cols, spec.rows))
    let cx = x + pad
    const xs = weights.map((wt) => {
      const start = cx
      cx += (wt / total) * innerW
      return { start, width: (wt / total) * innerW }
    })
    rect(x + pad, top, innerW, rowH, colors[0], { cornerRadius: 4 })
    const headText = textOn(colors[0])
    cols.forEach((c, ci) => text(xs[ci].start + 6, top + (rowH - fs * 1.25) / 2, xs[ci].width - 12, fitLabel(c, xs[ci].width - 12, fs), fs, { fontStyle: 'bold', fill: headText, align: numeric.has(ci) ? 'right' : 'left' }))
    shown.forEach((r, ri) => {
      const ry = top + rowH * (ri + 1)
      if (ri % 2 === 0) rect(x + pad, ry, innerW, rowH, spec.theme === 'dark' ? '#2a2b31' : '#f3f4f8')
      cols.forEach((_, ci) => text(xs[ci].start + 6, ry + (rowH - fs * 1.25) / 2, xs[ci].width - 12, fitLabel(r[ci] ?? '', xs[ci].width - 12, fs), fs, { align: numeric.has(ci) ? 'right' : 'left' }))
    })
    return { elements: out, invalid: 0, hiddenRows }
  }

  const fsA = clamp(Math.round(Math.min(w, h) * 0.035), 10, 18)
  const fsV = clamp(Math.round(fsA * 0.95), 9, 17)

  if (spec.kind === 'pie') {
    const values = (data.series[0]?.values ?? []).map((v) => Math.max(0, v))
    const sum = values.reduce((a, b) => a + b, 0)
    const sideLegend = w > h * 1.15
    const legendW = wantLegend && sideLegend ? clamp(w * 0.38, 120, 360) : 0
    const area = { x: x + pad, y: top, w: w - 2 * pad - legendW, h: bottom - top - (wantLegend && !sideLegend ? Math.min(legendEntries.length, 6) * fsL * 1.5 + 6 : 0) }
    const size = Math.max(20, Math.min(area.w, area.h))
    const px = area.x + (area.w - size) / 2
    const py = area.y + (area.h - size) / 2
    if (sum > 0) {
      let angle = -Math.PI / 2
      values.forEach((v, i) => {
        if (v <= 0) return
        const sweep = (v / sum) * Math.PI * 2
        const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 60)))
        const pts: string[] = ['M50 50']
        for (let k = 0; k <= steps; k++) {
          const a = angle + (sweep * k) / steps
          pts.push(`L${(50 + 50 * Math.cos(a)).toFixed(2)} ${(50 + 50 * Math.sin(a)).toFixed(2)}`)
        }
        add({ type: 'path', x: px, y: py, width: size, height: size, path: `${pts.join(' ')} Z`, fill: colors[i % colors.length], stroke: th.card, strokeWidth: 2 })
        const pct = (v / sum) * 100
        if (spec.showValues && pct >= 6) {
          const mid = angle + sweep / 2
          const r = size * 0.33
          const label = `${formatValue(Math.round(pct * 10) / 10, options.locale)} %`
          text(px + size / 2 + Math.cos(mid) * r - 40, py + size / 2 + Math.sin(mid) * r - fsV * 0.62, 80, label, fsV, { align: 'center', fontStyle: 'bold', fill: textOn(colors[i % colors.length]) })
        }
        angle += sweep
      })
    }
    if (wantLegend) {
      const entries = legendEntries.map((e, i) => ({ ...e, pct: sum > 0 ? (Math.max(0, values[i] ?? 0) / sum) * 100 : 0 }))
      const rowH = fsL * 1.5
      entries.slice(0, 12).forEach((e, i) => {
        const lx = sideLegend ? x + w - pad - legendW : x + pad
        const ly = sideLegend ? top + (area.h - Math.min(entries.length, 12) * rowH) / 2 + i * rowH : bottom - Math.min(entries.length, 6) * rowH + i * rowH
        if (!sideLegend && i >= 6) return
        rect(lx, ly + fsL * 0.2, fsL * 0.8, fsL * 0.8, e.color, { cornerRadius: 2 })
        const label = `${e.name}${spec.showValues ? ` : ${formatValue(Math.round(e.pct * 10) / 10, options.locale)} %` : ''}`
        text(lx + fsL * 1.1, ly, (sideLegend ? legendW : w - 2 * pad) - fsL * 1.2, fitLabel(label, (sideLegend ? legendW : w - 2 * pad) - fsL * 1.2, fsL), fsL, { fill: th.muted })
      })
    }
    return { elements: out, invalid: data.invalid, hiddenRows }
  }

  // barres verticales, horizontales et courbes : un axe de valeurs gradué et un axe de catégories
  const allValues = data.series.flatMap((s) => s.values)
  const vmin = allValues.length ? Math.min(...allValues) : 0
  const vmax = allValues.length ? Math.max(...allValues) : 1
  const zero = spec.kind !== 'line'
  const ticks = niceTicks(zero ? Math.min(0, vmin) : vmin - (vmax - vmin) * 0.05, zero ? Math.max(0, vmax) : vmax + (vmax - vmin) * 0.05, 5)
  const tickLabels = ticks.values.map((v) => formatValue(v, options.locale))
  const nSeries = Math.max(1, data.series.length)
  const horizontal = spec.kind === 'hbar'

  if (!horizontal) {
    const labelsW = Math.max(...tickLabels.map((t) => textWidth(t, fsA)), 0) + 10
    const px0 = x + pad + labelsW
    const px1 = x + w - pad
    const py0 = top + fsA
    const py1 = bottom - fsA * 1.7
    const yOf = (v: number): number => py1 - ((v - ticks.min) / (ticks.max - ticks.min)) * (py1 - py0)
    ticks.values.forEach((v, i) => {
      rect(px0, yOf(v) - 0.5, px1 - px0, 1, v === 0 ? th.axis : th.grid)
      text(x + pad, yOf(v) - fsA * 0.62, labelsW - 6, tickLabels[i], fsA, { align: 'right', fill: th.muted })
    })
    const slot = (px1 - px0) / Math.max(1, n)
    data.labels.forEach((l, i) => text(px0 + i * slot, py1 + fsA * 0.35, slot, fitLabel(l, slot - 4, fsA), fsA, { align: 'center', fill: th.muted }))
    if (spec.kind === 'bar') {
      const groupW = slot * 0.74
      const barW = groupW / nSeries
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const bx = px0 + i * slot + (slot - groupW) / 2 + si * barW
          const y0 = yOf(0)
          const y1 = yOf(v)
          rect(bx, Math.min(y0, y1), barW - (nSeries > 1 ? 2 : 0), Math.max(1, Math.abs(y1 - y0)), colors[si % colors.length], { cornerRadius: 2 })
          const label = formatValue(v, options.locale)
          if (spec.showValues && barW >= textWidth(label, fsV) * 0.85) text(bx + (barW - Math.max(barW, textWidth(label, fsV) + 6)) / 2, v >= 0 ? Math.min(y0, y1) - fsV * 1.4 : Math.max(y0, y1) + 2, Math.max(barW, textWidth(label, fsV) + 6), label, fsV, { align: 'center' })
        })
      })
    } else {
      data.series.forEach((s, si) => {
        const color = colors[si % colors.length]
        const pts = s.values.map((v, i) => ({ x: px0 + i * slot + slot / 2, y: yOf(v), v }))
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]
          const b = pts[i + 1]
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          const ang = Math.atan2(b.y - a.y, b.x - a.x)
          const t = 3
          add({ type: 'rect', x: a.x + (Math.sin(ang) * t) / 2, y: a.y - (Math.cos(ang) * t) / 2, width: len, height: t, rotation: (ang * 180) / Math.PI, fill: color })
        }
        pts.forEach((p) => {
          add({ type: 'ellipse', x: p.x - 5, y: p.y - 5, width: 10, height: 10, fill: color, stroke: th.card, strokeWidth: 1.5 })
          const label = formatValue(p.v, options.locale)
          if (spec.showValues && slot >= textWidth(label, fsV) + 4) text(p.x - (textWidth(label, fsV) + 6) / 2, p.y - fsV * 2.1, textWidth(label, fsV) + 6, label, fsV, { align: 'center' })
        })
      })
    }
  } else {
    const labelsW = clamp(Math.max(...data.labels.map((l) => textWidth(l, fsA)), 0) + 10, 30, w * 0.32)
    const px0 = x + pad + labelsW
    const px1 = x + w - pad - fsA * 2
    const py0 = top
    const py1 = bottom - fsA * 1.7
    const xOf = (v: number): number => px0 + ((v - ticks.min) / (ticks.max - ticks.min)) * (px1 - px0)
    ticks.values.forEach((v, i) => {
      rect(xOf(v) - 0.5, py0, 1, py1 - py0, v === 0 ? th.axis : th.grid)
      text(xOf(v) - 40, py1 + fsA * 0.35, 80, tickLabels[i], fsA, { align: 'center', fill: th.muted })
    })
    const slot = (py1 - py0) / Math.max(1, n)
    data.labels.forEach((l, i) => text(x + pad, py0 + i * slot + (slot - fsA * 1.25) / 2, labelsW - 6, fitLabel(l, labelsW - 8, fsA), fsA, { align: 'right', fill: th.muted }))
    const groupH = slot * 0.74
    const barH = groupH / nSeries
    data.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const by = py0 + i * slot + (slot - groupH) / 2 + si * barH
        const x0 = xOf(0)
        const x1 = xOf(v)
        rect(Math.min(x0, x1), by, Math.max(1, Math.abs(x1 - x0)), barH - (nSeries > 1 ? 2 : 0), colors[si % colors.length], { cornerRadius: 2 })
        const label = formatValue(v, options.locale)
        if (spec.showValues && barH >= fsV * 1.1) text(v >= 0 ? Math.max(x0, x1) + 4 : Math.min(x0, x1) - textWidth(label, fsV) - 10, by + (barH - fsV * 1.25) / 2, textWidth(label, fsV) + 6, label, fsV)
      })
    })
  }
  return { elements: out, invalid: data.invalid, hiddenRows }
}

/** Lecture d'un fichier : la description d'un graphique est nettoyée ou, si elle est inexploitable, retirée. */
export function sanitizeChart(e: { chart?: unknown }): void {
  const raw = e.chart as Partial<ChartSpec> | undefined
  if (!raw || typeof raw !== 'object') {
    delete e.chart
    return
  }
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '')
  const columns = (Array.isArray(raw.columns) ? raw.columns : []).slice(0, MAX_CHART_COLUMNS).map((c) => str(c, 60))
  const rows = (Array.isArray(raw.rows) ? (raw.rows as unknown[]) : [])
    .filter((r): r is unknown[] => Array.isArray(r))
    .slice(0, MAX_CHART_ROWS)
    .map((r) => columns.map((_, i) => str(r[i], 120)))
  const kind = CHART_KINDS.includes(raw.kind as ChartKind) ? (raw.kind as ChartKind) : null
  const index = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < columns.length ? v : null)
  const labelColumn = index(raw.labelColumn)
  const valueColumns = [...new Set((Array.isArray(raw.valueColumns) ? raw.valueColumns : []).map(index).filter((v): v is number => v !== null))].slice(0, MAX_CHART_SERIES)
  if (!kind || labelColumn === null || columns.length === 0 || valueColumns.length === 0) {
    delete e.chart
    return
  }
  e.chart = {
    kind,
    title: str(raw.title, 120),
    columns,
    rows,
    labelColumn,
    valueColumns,
    showValues: raw.showValues === true,
    showLegend: raw.showLegend !== false,
    palette: raw.palette === 'violet' || raw.palette === 'gray' ? raw.palette : 'safe',
    theme: raw.theme === 'dark' ? 'dark' : 'light'
  }
}
