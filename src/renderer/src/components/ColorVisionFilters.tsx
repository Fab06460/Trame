import { COLOR_VISIONS, colorVisionMatrix } from '@/readability'

/** Filtres SVG de la simulation de la vision des couleurs (invisibles : le canevas s'y réfère par `filter: url(#…)`). */
export function ColorVisionFilters(): React.JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {COLOR_VISIONS.filter((v) => v !== 'none').map((v) => (
          <filter key={v} id={`trame-cv-${v}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={colorVisionMatrix(v as Exclude<typeof v, 'none'>)} />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
