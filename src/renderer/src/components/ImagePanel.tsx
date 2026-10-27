import { useEditor } from '@/store/editor'
import { downscaleImage } from '@/photoImport'
import { FILTER_LIMITS, coverCrop, FILTER_PRESETS, activeFilters, clampCrop, cropInsets, currentCrop, hasCrop, hasFilters, recrop, type FilterKey } from '@/imageStyle'
import type { ImageFilters, TrameElement } from '@/types'
import { NumberField } from './NumberField'

const SLIDERS: Array<[FilterKey, string]> = [
  ['brightness', 'Luminosité'],
  ['contrast', 'Contraste'],
  ['saturation', 'Saturation'],
  ['grayscale', 'Noir et blanc'],
  ['sepia', 'Sépia'],
  ['blur', 'Flou']
]

/** Recadrage, miroir et réglages de lumière et de couleur d'une image. */
export function ImagePanel({ el }: { el: TrameElement }): React.JSX.Element {
  const { updateElement, beginChange } = useEditor.getState()
  const filters = activeFilters(el)
  const inset = cropInsets(el)
  const crop = currentCrop(el)

  const setInset = (side: 'left' | 'top' | 'right' | 'bottom', percent: number): void => {
    const i = { ...inset, [side]: percent }
    // les deux marges d'un même axe ne peuvent pas se recouvrir : la valeur saisie cède la place à l'autre marge
    const next = clampCrop({ x: i.left / 100, y: i.top / 100, width: 1 - (i.left + i.right) / 100, height: 1 - (i.top + i.bottom) / 100 })
    updateElement(el.id, recrop(el, next))
  }

  const setFilter = (key: FilterKey, value: number, live: boolean): void => {
    const next: ImageFilters = { ...filters, [key]: value }
    if (value === 0) delete next[key]
    updateElement(el.id, { filters: Object.keys(next).length ? next : undefined }, !live)
  }

  // remplace l'image en gardant la place et la taille de la boîte : la nouvelle image est recadrée pour la couvrir (sans déformation)
  const replaceImage = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (!src) return
    const small = await downscaleImage(src)
    const size = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const i = new window.Image()
      i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight })
      i.onerror = () => resolve(null)
      i.src = small
    })
    if (!size) return
    updateElement(el.id, { src: small, crop: coverCrop(el.width, el.height, size.w, size.h), credit: undefined, pdfSource: undefined, filters: undefined, flipX: undefined, flipY: undefined })
  }

  return (
    <>
      <button data-action="replace-image" title="Garde la place et la taille de cette image ; la nouvelle est recadrée pour la couvrir" onClick={() => void replaceImage()}>
        Remplacer l'image…
      </button>
      <div className="row">
        <button data-flip="x" aria-pressed={!!el.flipX} className={el.flipX ? 'active' : ''} title="Retourner horizontalement" onClick={() => updateElement(el.id, { flipX: el.flipX ? undefined : true })}>
          ⇋
        </button>
        <button data-flip="y" aria-pressed={!!el.flipY} className={el.flipY ? 'active' : ''} title="Retourner verticalement" onClick={() => updateElement(el.id, { flipY: el.flipY ? undefined : true })}>
          ⇅
        </button>
      </div>

      {el.credit && (
        <>
          <h4>Crédit</h4>
          <p className="hint" data-field="credit">{el.credit}</p>
          <button data-action="copy-credit" onClick={() => void navigator.clipboard.writeText(el.credit!).catch(() => {})}>
            Copier le crédit
          </button>
        </>
      )}

      <h4>Recadrage</h4>
      <div className="num-grid">
        <NumberField label="Gauche" field="cropLeft" value={inset.left} min={0} max={95} suffix="%" onCommit={(v) => setInset('left', v)} />
        <NumberField label="Haut" field="cropTop" value={inset.top} min={0} max={95} suffix="%" onCommit={(v) => setInset('top', v)} />
        <NumberField label="Droite" field="cropRight" value={inset.right} min={0} max={95} suffix="%" onCommit={(v) => setInset('right', v)} />
        <NumberField label="Bas" field="cropBottom" value={inset.bottom} min={0} max={95} suffix="%" onCommit={(v) => setInset('bottom', v)} />
      </div>
      {hasCrop(el) && (
        <button data-action="crop-reset" onClick={() => updateElement(el.id, recrop(el, { x: 0, y: 0, width: 1, height: 1 }))}>
          Rétablir l'image entière ({Math.round(crop.width * 100)} × {Math.round(crop.height * 100)} %)
        </button>
      )}

      <h4>Filtres</h4>
      <div className="presets">
        {FILTER_PRESETS.map((p) => (
          <button key={p.name} data-preset={p.name} onClick={() => updateElement(el.id, { filters: Object.keys(p.filters).length ? { ...p.filters } : undefined })}>
            {p.name}
          </button>
        ))}
      </div>
      {SLIDERS.map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="range"
            data-filter={key}
            min={FILTER_LIMITS[key].min}
            max={FILTER_LIMITS[key].max}
            value={filters[key] ?? 0}
            onPointerDown={beginChange}
            onChange={(e) => setFilter(key, Number(e.target.value), true)}
            onDoubleClick={() => setFilter(key, 0, false)}
          />
        </label>
      ))}
      {hasFilters(el) && (
        <button data-action="filters-reset" onClick={() => updateElement(el.id, { filters: undefined })}>
          Réinitialiser les réglages
        </button>
      )}
    </>
  )
}
