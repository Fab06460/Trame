import { explain } from '@/pdfFallbacks'
import { selectPage, useEditor } from '@/store/editor'
import { textToPathElement } from '@/textOutline'
import { t } from '@/i18n'
import type { TrameElement } from '@/types'

/** Les textes de la sélection que l'on peut convertir en tracé. */
export const convertibleTexts = (els: readonly TrameElement[]): TrameElement[] => els.filter((e) => e.type === 'text' && !e.hidden)

/**
 * Transforme les textes sélectionnés en tracés (lettres en contours : le texte n'est plus modifiable, mais on peut le combiner avec des formes,
 * le modifier point par point et il part en vecteur dans tous les exports). Un seul cran d'historique ; un texte dont la police n'est pas dans Trame
 * ou qui contient un caractère absent de la police est laissé tel quel, avec la raison.
 */
export async function convertSelectedTexts(): Promise<void> {
  const state = useEditor.getState()
  const texts = convertibleTexts(selectPage(state).elements.filter((e) => state.selectedIds.includes(e.id)))
  if (!texts.length) return
  const changes: Array<{ id: string; element: TrameElement }> = []
  const problems: string[] = []
  try {
    for (const el of texts) {
      const res = await textToPathElement(el)
      if ('element' in res) changes.push({ id: el.id, element: res.element })
      else if ('issue' in res) problems.push(explain(res.issue))
    }
  } catch {
    void window.trame.showError(t('textPath.title'), t('textPath.failed'))
    return
  }
  const replaced = changes.length ? useEditor.getState().replaceElements(changes) : 0
  const locked = changes.length - replaced
  const lines = [...new Set(problems)]
  if (locked > 0) lines.push(t('textPath.locked', { count: locked }))
  if (lines.length) void window.trame.showInfo(t('textPath.title'), lines.join('\n\n'))
}
