import { bubbleElements, type BubbleId } from '@/bubbles'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'

/** Insère une bulle de BD d'exemple au centre de la page (un tiers de la largeur ; un récitatif, la moitié), avec son texte, réunis dans un groupe. */
export function insertBubble(id: BubbleId): void {
  const { doc } = useEditor.getState()
  const width = Math.round(Math.min(doc.width * (id === 'caption' ? 0.5 : 0.33), doc.height * 0.6))
  const height = Math.round(width * (id === 'caption' ? 0.3 : 0.85))
  const els = bubbleElements(id, { x: Math.round((doc.width - width) / 2), y: Math.round((doc.height - height) / 2), width }, t('bubble.sample'))
  useEditor.getState().insertChart(els)
}
