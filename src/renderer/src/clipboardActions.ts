import { isElement, selectPage, useEditor } from '@/store/editor'
import type { TrameElement } from '@/types'

const MAX_PASTED_TEXT = 5000

/** Sérialisation du presse-papiers Trame (le format est interne : voir isElement pour la validation). */
export const serializeElements = (elements: TrameElement[]): string => JSON.stringify({ trame: 1, elements })

/** Retourne les éléments valides d'un contenu de presse-papiers Trame, ou [] si illisible. */
export function parseElements(json: string): TrameElement[] {
  try {
    const data = JSON.parse(json)
    return data?.trame === 1 && Array.isArray(data.elements) ? data.elements.filter(isElement) : []
  } catch {
    return []
  }
}

/** Ajoute une image (data URL) au centre de la page, réduite pour tenir dans 60 % du design. */
export function insertImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const { doc, addElement } = useEditor.getState()
      const ratio = Math.min(1, (doc.width * 0.6) / img.width, (doc.height * 0.6) / img.height)
      addElement({ type: 'image', src, width: img.width * ratio, height: img.height * ratio })
      resolve()
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

export async function copySelection(): Promise<boolean> {
  const s = useEditor.getState()
  const els = selectPage(s).elements.filter((e) => s.selectedIds.includes(e.id))
  if (!els.length) return false
  await window.trame.writeClipboardElements(serializeElements(els))
  return true
}

export async function cutSelection(): Promise<void> {
  if (await copySelection()) useEditor.getState().removeSelected()
}

/** Colle ce que contient le presse-papiers : éléments Trame, image (capture d'écran…), ou texte. */
export async function paste(): Promise<void> {
  const clip = await window.trame.readClipboard()
  if (!clip) return
  const { pasteElements, addElement } = useEditor.getState()
  if (clip.kind === 'elements') pasteElements(parseElements(clip.json))
  else if (clip.kind === 'image') await insertImage(clip.dataUrl)
  else addElement({ type: 'text', text: clip.text.slice(0, MAX_PASTED_TEXT), height: 80 })
}
