import { useView } from '@/store/view'

export function ZoomControls(): React.JSX.Element {
  const zoom = useView((v) => v.zoom)
  const fit = useView((v) => v.fit)
  const { zoomBy, fitToScreen, actualSize } = useView.getState()
  const percent = Math.round(fit * zoom * 100)

  return (
    <div className="zoom-controls" onMouseDown={(e) => e.stopPropagation()}>
      <button onClick={() => zoomBy(1 / 1.25)} title="Zoom arrière (⌘-)">−</button>
      <button className="zoom-value" onClick={fitToScreen} title="Ajuster à la fenêtre (⌘0)">{percent} %</button>
      <button onClick={() => zoomBy(1.25)} title="Zoom avant (⌘+)">+</button>
      <button onClick={actualSize} title="Taille réelle, 100 % (⌘1)">1:1</button>
    </div>
  )
}
