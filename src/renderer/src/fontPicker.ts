import type { FontDef } from '@/fonts'

export interface FontGroup {
  /** `brand` pour les polices du kit, sinon le groupe de la police (`sans`, `serif`…) */
  id: string
  fonts: FontDef[]
}

/**
 * Polices du sélecteur, groupées : celles du kit de marque d'abord (une police n'apparaît qu'une fois), puis les groupes dans
 * l'ordre de la liste. `query` filtre sur le nom, sans tenir compte de la casse ni des accents ; un groupe vide disparaît.
 */
export function fontGroups(fonts: FontDef[], kitFamilies: string[], query: string): FontGroup[] {
  const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  const shown = q ? fonts.filter((f) => norm(f.name).includes(q)) : fonts
  const groups: FontGroup[] = []
  const brand = shown.filter((f) => kitFamilies.includes(f.family))
  if (brand.length) groups.push({ id: 'brand', fonts: brand })
  const rest = shown.filter((f) => !kitFamilies.includes(f.family))
  for (const id of new Set(rest.map((f) => f.group))) groups.push({ id, fonts: rest.filter((f) => f.group === id) })
  return groups
}
