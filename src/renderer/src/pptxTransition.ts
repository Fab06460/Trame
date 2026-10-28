import type { PageTransition } from '@/transition'

/**
 * Transitions dans un fichier PowerPoint (`<p:transition>` d'une diapositive). Correspondance :
 * Trame fondu ↔ `fade` · glissement ↔ `push` · recouvrement ↔ `cover` · zoom ↔ `zoom` · aucune ↔ pas de transition (ou `cut`).
 * Les autres effets de PowerPoint (volet, stores, damier, dissolution…) sont repris comme un fondu : la page a bien une transition.
 */
const XML: Record<PageTransition, string> = {
  none: '',
  fade: '<p:transition spd="med"><p:fade/></p:transition>',
  slide: '<p:transition spd="med"><p:push dir="l"/></p:transition>',
  cover: '<p:transition spd="med"><p:cover dir="l"/></p:transition>',
  zoom: '<p:transition spd="med"><p:zoom dir="in"/></p:transition>'
}

export const transitionXml = (t: PageTransition): string => XML[t]

/**
 * Insère la transition dans le XML d'une diapositive, au bon endroit du schéma : après `clrMapOvr`, avant `timing` (et `extLst`).
 * Une diapositive qui a déjà une transition est laissée telle quelle.
 */
export function insertTransition(slideXml: string, t: PageTransition): string {
  const xml = XML[t]
  if (!xml || /<p:transition[\s>/]/.test(slideXml)) return slideXml
  const after = slideXml.indexOf('</p:clrMapOvr>')
  if (after >= 0) return slideXml.slice(0, after + '</p:clrMapOvr>'.length) + xml + slideXml.slice(after + '</p:clrMapOvr>'.length)
  const selfClosed = /<p:clrMapOvr\b[^>]*\/>/.exec(slideXml)
  if (selfClosed) return slideXml.slice(0, selfClosed.index + selfClosed[0].length) + xml + slideXml.slice(selfClosed.index + selfClosed[0].length)
  const before = slideXml.search(/<p:(timing|extLst)\b/)
  const at = before >= 0 ? before : slideXml.lastIndexOf('</p:sld>')
  return at < 0 ? slideXml : slideXml.slice(0, at) + xml + slideXml.slice(at)
}

/** Effet PowerPoint (nom local de l'enfant de `<p:transition>`) → transition de Trame. */
export function transitionFromEffect(effect: string | null): PageTransition {
  switch (effect) {
    case null:
    case 'cut':
      return 'none'
    case 'fade':
      return 'fade'
    case 'push':
      return 'slide'
    case 'cover':
    case 'pull':
      return 'cover'
    case 'zoom':
      return 'zoom'
    default:
      return 'fade'
  }
}
