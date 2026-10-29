import { useView } from '@/store/view'
import { useT } from '@/i18n'

export function ZoomControls(): React.JSX.Element {
  const t = useT()
  const zoom = useView((v) => v.zoom)
  const fit = useView((v) => v.fit)
  const { zoomBy, fitToScreen, actualSize } = useView.getState()
  const percent = Math.round(fit * zoom * 100)

  return (
    <div className="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
      <button onClick={() => zoomBy(1 / 1.25)} title={t('zoom.out')}>−</button>
      <button className="zoom-value" onClick={fitToScreen} title={t('zoom.fit')}>{percent} %</button>
      <button onClick={() => zoomBy(1.25)} title={t('zoom.in')}>+</button>
      <button onClick={actualSize} title={t('zoom.actual')}>1:1</button>
    </div>
  )
}
