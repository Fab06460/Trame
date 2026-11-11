import { luminance, parseHex } from '@/accessibility'
import { useEditor } from '@/store/editor'
import type { TrameElement } from '@/types'
import { placeText } from './place'

/** Pose le texte reconnu dans la page de l'image, près d'elle : un bloc de texte ordinaire, sélectionné, que l'on met en forme ensuite. */
export function insertRecognizedText(image: TrameElement, text: string): boolean {
  const { doc, pageId } = useEditor.getState()
  const page = doc.pages.find((p) => p.id === pageId)
  if (!page || !text.trim()) return false
  const box = placeText(image, { width: doc.width, height: doc.height }, text)
  const bg = parseHex(page.background ?? '#ffffff')
  useEditor.getState().addElement({
    type: 'text',
    text,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fontSize: box.fontSize,
    fontFamily: '"Inter", sans-serif',
    fontStyle: 'normal',
    align: 'left',
    lineHeight: 1.25,
    fill: bg && luminance(bg) < 0.35 ? '#ffffff' : '#1e1f24'
  })
  return true
}
