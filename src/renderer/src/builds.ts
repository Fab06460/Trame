import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Numéro d'apparition le plus élevé qu'un élément peut porter. */
export const MAX_BUILD = 30

/** Numéro de clic qui fait apparaître l'élément ; null s'il est visible dès l'ouverture de la page (ou masqué : un calque masqué n'apparaît jamais). */
const buildOf = (e: Pick<TrameElement, 'build' | 'hidden'>): number | null => (!e.hidden && typeof e.build === 'number' ? e.build : null)

/** Numéros d'apparition utilisés sur la page, du plus petit au plus grand, sans doublon (un calque masqué n'apparaît jamais). */
export function buildNumbers(page: Pick<TramePage, 'elements'>): number[] {
  return [...new Set(page.elements.flatMap((e) => buildOf(e) ?? []))].sort((a, b) => a - b)
}

/** Nombre de clics nécessaires pour tout montrer sur une page (0 = rien n'apparaît pas à pas). Des numéros « troués » (1 puis 3) comptent pour deux. */
export const stepsOf = (page: Pick<TramePage, 'elements'>): number => buildNumbers(page).length

/** La page telle qu'on la voit après `step` clics : les éléments qui apparaissent plus tard sont retirés. Sans apparition, la page elle-même. */
export function pageAtStep(page: TramePage, step: number): TramePage {
  const numbers = buildNumbers(page)
  if (numbers.length === 0) return page
  const shown = numbers[Math.min(Math.max(0, Math.floor(step)), numbers.length) - 1] ?? 0
  return { ...page, elements: page.elements.filter((e) => {
      const b = buildOf(e)
      return b === null || b <= shown
    }) }
}

export interface Position {
  index: number
  step: number
}

/** Position suivante : un clic de plus sur la page, puis la page suivante (au début). Au bout de la dernière page, on reste. */
export function nextPosition(doc: Pick<TrameDocument, 'pages'>, at: Position): Position {
  const page = doc.pages[at.index]
  if (page && at.step < stepsOf(page)) return { index: at.index, step: at.step + 1 }
  return at.index < doc.pages.length - 1 ? { index: at.index + 1, step: 0 } : at
}

/** Position précédente : un clic de moins, puis la page précédente **entièrement montrée** (comme on l'a quittée). Avant la première page, on reste. */
export function prevPosition(doc: Pick<TrameDocument, 'pages'>, at: Position): Position {
  if (at.step > 0) return { index: at.index, step: at.step - 1 }
  if (at.index <= 0) return at
  return { index: at.index - 1, step: stepsOf(doc.pages[at.index - 1]) }
}

/** Arrivée sur une page (saut, vue d'ensemble) : au début, ou entièrement montrée. */
export const startOf = (index: number): Position => ({ index, step: 0 })
export const endOf = (doc: Pick<TrameDocument, 'pages'>, index: number): Position => ({ index, step: doc.pages[index] ? stepsOf(doc.pages[index]) : 0 })

/** Les éléments à modifier quand on règle l'apparition de ces éléments : un groupe (graphique, tableau…) apparaît d'un seul bloc. */
export function withGroupMates(elements: readonly TrameElement[], ids: readonly string[]): string[] {
  const groups = new Set(elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId))
  return elements.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id)
}

/** Choix proposés pour un élément : « dès l'ouverture » (0), puis un clic existant ou le prochain nouveau clic. */
export function buildChoices(page: Pick<TramePage, 'elements'>): number[] {
  const max = Math.min(MAX_BUILD, (buildNumbers(page).pop() ?? 0) + 1)
  return Array.from({ length: max + 1 }, (_, i) => i)
}

/** Nettoyage à la lecture d'un fichier : un entier de 1 à `MAX_BUILD`, sinon le champ disparaît. Modifie en place. */
export function sanitizeBuild(element: object): void {
  const e = element as Record<string, unknown>
  const b = e.build
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 1 || b > MAX_BUILD) delete e.build
}
