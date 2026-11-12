import { useBrand } from '@/store/brand'
import { useT } from '@/i18n'

/** Les couleurs du kit actif en pastilles, sous un sélecteur de couleur : un clic choisit la couleur (rien quand le kit n'a pas de couleur). */
export function KitSwatches({ onPick, current }: { onPick: (color: string) => void; current?: string }): React.JSX.Element | null {
  const t = useT()
  const colors = useBrand((s) => s.kit.colors)
  if (!colors.length) return null
  return (
    <div className="kit-swatches" role="group" aria-label={t('brand.quick.label')} data-kit-swatches>
      {colors.map((c) => (
        <button
          key={c}
          className={`kit-swatch${current?.toLowerCase() === c ? ' on' : ''}`}
          style={{ background: c }}
          data-kit-swatch={c}
          title={t('brand.apply', { color: c })}
          aria-label={t('brand.apply.label', { color: c })}
          onClick={() => {
            onPick(c)
            useBrand.getState().noteColor(c)
          }}
        />
      ))}
    </div>
  )
}
