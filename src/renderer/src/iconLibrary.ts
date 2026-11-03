import { fromRaw, type IconEntry, type IconLibrary, type IconWeight, type RawIconData } from '@/iconSearch'
import { useEditor } from '@/store/editor'

let loading: Promise<IconLibrary> | null = null

/** Charge la bibliothèque d'icônes (2,5 Mo) au premier besoin seulement : elle fait un fichier à part dans l'application. */
export function loadIcons(): Promise<IconLibrary> {
  loading ??= import('./iconData.json').then((m) => fromRaw(m.default as RawIconData))
  loading.catch(() => (loading = null)) // un échec de chargement n'est pas mémorisé : on réessaiera
  return loading
}

/** Côté d'une icône insérée : un cinquième de la plus petite dimension de la page. */
export const iconSize = (page: { width: number; height: number }): number => Math.round(Math.min(page.width, page.height) / 5)

/** Insère l'icône au centre de la page : un tracé ordinaire (rempli, redimensionnable, coloriable, avec contour et ombre). */
export function insertIcon(icon: IconEntry, weight: IconWeight): void {
  const { doc, addElement } = useEditor.getState()
  const size = iconSize(doc)
  addElement({ type: 'path', path: icon[weight], width: size, height: size, fill: '#1e1f24', name: icon.name })
}
