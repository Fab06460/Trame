import { CHART_KINDS, MAX_CHART_COLUMNS, MAX_CHART_ROWS, chartElements, defaultSpec, numericColumns, type ChartKind, type ChartResult, type ChartSpec } from '@/chart'
import { decodeCsv, parseCsv, toMergeData } from '@/mailMerge'
import { useEditor } from '@/store/editor'
import { t, useLocale } from '@/i18n'
import type { TrameElement } from '@/types'

export { CHART_KINDS }

/** Données d'exemple (dans la langue de l'interface) : on voit tout de suite à quoi ressemble le graphique, on l'adapte ensuite. */
export function sampleSpec(kind: ChartKind): ChartSpec {
  const columns = [t('chart.sample.subject'), t('chart.sample.classA'), t('chart.sample.classB')]
  const rows = [
    [t('chart.sample.maths'), '12', '14,5'],
    [t('chart.sample.french'), '15', '11'],
    [t('chart.sample.history'), '13', '16'],
    [t('chart.sample.science'), '16', '15']
  ]
  return defaultSpec(kind, columns, rows, t('chart.sample.title'))
}

/** Dessin d'une description dans un cadre, dans la langue de l'interface. */
export const drawChart = (spec: ChartSpec, box: { x: number; y: number; width: number; height: number }, groupId?: string): ChartResult => chartElements(spec, box, { locale: useLocale.getState().locale, groupId })

/** Insère un graphique (ou un tableau) d'exemple, centré sur la page, aux deux tiers de sa largeur. */
export function insertChart(kind: ChartKind): void {
  const { doc } = useEditor.getState()
  const width = Math.round(Math.min(doc.width * 0.7, doc.height * 1.3))
  const height = Math.round(Math.min(doc.height * 0.7, width * (kind === 'pie' ? 0.8 : 0.62)))
  useEditor.getState().insertChart(drawChart(sampleSpec(kind), { x: Math.round((doc.width - width) / 2), y: Math.round((doc.height - height) / 2), width, height }).elements)
}

/** Redessine le graphique de ce fond avec des réglages modifiés, dans le même cadre. */
export function updateChart(anchor: TrameElement, patch: Partial<ChartSpec>): ChartResult | null {
  if (!anchor.chart) return null
  let spec: ChartSpec = { ...anchor.chart, ...patch }
  if (spec.kind === 'pie' && spec.valueColumns.length > 1) spec = { ...spec, valueColumns: spec.valueColumns.slice(0, 1) }
  const res = drawChart(spec, { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height })
  useEditor.getState().replaceChart(anchor.id, res.elements)
  return res
}

export type ChartImport = { ok: true; spec: ChartSpec; truncated: boolean } | { ok: false; error: 'cancel' | 'empty' | 'noNumbers' }

/** Choisit un CSV et en fait les nouvelles données de ce graphique (réglages d'apparence conservés). */
export async function importChartCsv(current: ChartSpec): Promise<ChartImport> {
  const file = await window.trame.pickCsv()
  if (!file) return { ok: false, error: 'cancel' }
  const read = toMergeData(parseCsv(decodeCsv(file.bytes)))
  if (!read || read.data.rows.length === 0) return { ok: false, error: 'empty' }
  const columns = read.data.columns.slice(0, MAX_CHART_COLUMNS)
  const rows = read.data.rows.slice(0, MAX_CHART_ROWS).map((r) => r.slice(0, MAX_CHART_COLUMNS))
  if (current.kind !== 'table' && numericColumns(columns, rows).filter((c) => c !== 0).length === 0) return { ok: false, error: 'noNumbers' }
  const fresh = defaultSpec(current.kind, columns, rows, current.title)
  return { ok: true, spec: { ...current, ...fresh, showValues: current.showValues, showLegend: current.showLegend, palette: current.palette, theme: current.theme }, truncated: read.truncated || read.data.columns.length > MAX_CHART_COLUMNS || read.data.rows.length > MAX_CHART_ROWS }
}
