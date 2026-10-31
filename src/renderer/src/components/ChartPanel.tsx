import { useState } from 'react'
import { CHART_KINDS, chartData, type ChartSpec } from '@/chart'
import { importChartCsv, updateChart } from '@/chartActions'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import type { TrameElement } from '@/types'

/**
 * Réglages d'un graphique ou d'un tableau sélectionné : type, titre, colonnes, couleurs, données (CSV). Chaque changement redessine le
 * groupe dans le même cadre (un seul pas d'historique). Les éléments qui le composent sont ordinaires : on peut aussi les modifier à la main.
 */
export function ChartPanel({ anchor }: { anchor: TrameElement }): React.JSX.Element | null {
  const t = useT()
  const spec = anchor.chart
  const [note, setNote] = useState('')
  const [title, setTitle] = useState(spec?.title ?? '')
  if (!spec) return null
  const apply = (patch: Partial<ChartSpec>): void => {
    setNote('')
    updateChart(anchor, patch)
  }
  const result = chartData(spec)
  const toggleValue = (c: number): void => {
    const on = spec.valueColumns.includes(c)
    if (on && spec.valueColumns.length === 1) return
    apply({ valueColumns: on ? spec.valueColumns.filter((x) => x !== c) : spec.kind === 'pie' ? [c] : [...spec.valueColumns, c].sort((a, b) => a - b) })
  }
  const importCsv = async (): Promise<void> => {
    const res = await importChartCsv(spec)
    if (!res.ok) {
      if (res.error !== 'cancel') setNote(t(res.error === 'empty' ? 'chart.empty' : 'chart.noNumbers'))
      return
    }
    setTitle(res.spec.title)
    updateChart(anchor, res.spec)
    setNote(res.truncated ? t('chart.truncated') : '')
  }
  const redraw = (): void => {
    updateChart(anchor, {})
  }

  return (
    <div data-chart-panel>
      <h3>{spec.kind === 'table' ? t('chart.kind.table') : t('chart.panel')}</h3>
      <label>
        {t('chart.type')}
        <select data-field="chartKind" value={spec.kind} onChange={(e) => apply({ kind: e.target.value as ChartSpec['kind'] })}>
          {CHART_KINDS.map((k) => (
            <option key={k} value={k}>{t(`chart.kind.${k}` as MessageKey)}</option>
          ))}
        </select>
      </label>
      <label>
        {t('chart.title')}
        <input
          type="text"
          data-field="chartTitle"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== spec.title && apply({ title })}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
      <div className="row wrap">
        <button data-action="chart-import" onClick={() => void importCsv()}>{t('chart.import')}</button>
        <span className="hint" data-chart-data>{t('chart.data', { count: spec.rows.length, rows: spec.rows.length, cols: spec.columns.length })}</span>
      </div>
      {note && <div className="warn" role="status" data-chart-note>{note}</div>}
      {spec.kind !== 'table' && (
        <>
          <label>
            {t('chart.labels')}
            <select data-field="chartLabels" value={spec.labelColumn} onChange={(e) => apply({ labelColumn: Number(e.target.value), valueColumns: spec.valueColumns.filter((c) => c !== Number(e.target.value)).length ? spec.valueColumns.filter((c) => c !== Number(e.target.value)) : spec.valueColumns })}>
              {spec.columns.map((c, i) => (
                <option key={i} value={i}>{c}</option>
              ))}
            </select>
          </label>
          <fieldset className="pages-choice" data-chart-values>
            <legend>{t('chart.values')}</legend>
            {spec.columns.map((c, i) =>
              i === spec.labelColumn ? null : (
                <label key={i} className="choice-row">
                  <input type="checkbox" data-chart-value={i} checked={spec.valueColumns.includes(i)} onChange={() => toggleValue(i)} /> {c}
                </label>
              )
            )}
          </fieldset>
          <label className="choice-row"><input type="checkbox" data-field="chartShowValues" checked={spec.showValues} onChange={(e) => apply({ showValues: e.target.checked })} /> {t('chart.showValues')}</label>
          <label className="choice-row"><input type="checkbox" data-field="chartLegend" checked={spec.showLegend} onChange={(e) => apply({ showLegend: e.target.checked })} /> {t('chart.legend')}</label>
          <label>
            {t('chart.palette')}
            <select data-field="chartPalette" value={spec.palette} onChange={(e) => apply({ palette: e.target.value as ChartSpec['palette'] })}>
              {(['safe', 'violet', 'gray'] as const).map((p) => (
                <option key={p} value={p}>{t(`chart.palette.${p}` as MessageKey)}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        {t('chart.theme')}
        <select data-field="chartTheme" value={spec.theme} onChange={(e) => apply({ theme: e.target.value as ChartSpec['theme'] })}>
          <option value="light">{t('chart.theme.light')}</option>
          <option value="dark">{t('chart.theme.dark')}</option>
        </select>
      </label>
      {result.invalid > 0 && spec.kind !== 'table' && <div className="warn" role="status" data-chart-invalid>{t('chart.invalid', { count: result.invalid })}</div>}
      <button data-action="chart-redraw" onClick={redraw}>{t('chart.redraw')}</button>
      <p className="hint">{t('chart.hint')}</p>
    </div>
  )
}
