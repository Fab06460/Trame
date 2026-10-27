/**
 * Modèles de marque : protection des éléments d'un modèle.
 * - `fixed` (figé) : l'élément ne peut plus être ni déplacé, ni redimensionné, ni modifié, ni supprimé ;
 * - `fill` (à remplir) : son contenu (texte, image, style) reste modifiable, mais ni sa position, ni sa taille, ni sa présence.
 * La protection n'agit que tant que le document est « verrouillé » : dès qu'un élément est protégé et que l'on n'est pas en train de
 * modifier le modèle. Ce n'est qu'une aide à la cohérence (le fichier reste ouvrable et modifiable) : aucune sécurité.
 */
import type { Protection, TrameDocument, TrameElement } from '@/types'

export const PROTECTIONS: Protection[] = ['fixed', 'fill']

export const hasProtected = (doc: Pick<TrameDocument, 'pages'>): boolean => doc.pages.some((p) => p.elements.some((e) => !!e.protect))

/** La protection s'applique-t-elle ? Oui dès qu'un élément est protégé, sauf pendant la modification du modèle. */
export const isEnforced = (doc: Pick<TrameDocument, 'pages'>, unlocked: boolean): boolean => !unlocked && hasProtected(doc)

/** Position, taille, rotation, ordre, visibilité et suppression interdits : verrou de calque OU élément protégé (tant que le modèle est verrouillé). */
export const positionLocked = (e: Pick<TrameElement, 'locked' | 'protect'>, enforced: boolean): boolean => !!e.locked || (enforced && !!e.protect)

/** Contenu et style interdits aussi : élément figé. */
export const contentLocked = (e: Pick<TrameElement, 'protect'>, enforced: boolean): boolean => enforced && e.protect === 'fixed'

/** Champs qui touchent à la géométrie, à la visibilité ou à la protection elle-même : jamais modifiables sur un élément protégé. */
const STRUCTURAL: Array<keyof TrameElement> = ['x', 'y', 'width', 'height', 'rotation', 'protect', 'locked', 'hidden', 'groupId']

/**
 * Ce qu'une modification peut changer sur un élément. Élément libre ou modèle déverrouillé : tout ; élément « à remplir » : tout sauf la
 * géométrie ; élément figé : rien (retourne null).
 */
export function allowedPatch(e: Pick<TrameElement, 'protect'>, patch: Partial<TrameElement>, enforced: boolean): Partial<TrameElement> | null {
  if (!enforced || !e.protect) return patch
  if (e.protect === 'fixed') return null
  const out: Partial<TrameElement> = {}
  for (const [k, v] of Object.entries(patch)) if (!STRUCTURAL.includes(k as keyof TrameElement)) (out as Record<string, unknown>)[k] = v
  return Object.keys(out).length ? out : null
}

/** Nettoyage à la lecture : seules les valeurs connues sont gardées. Modifie en place. */
export function sanitizeProtection(element: object): void {
  const e = element as Record<string, unknown>
  if (!PROTECTIONS.includes(e.protect as Protection)) delete e.protect
}
