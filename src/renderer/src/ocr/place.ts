import { countLines } from '@/outlineImport/layout'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const LINE_HEIGHT = 1.25

/**
 * Où poser le bloc de texte reconnu : à droite de l'image s'il y a la place, sinon dessous, sinon sur toute la page (par-dessus). Le corps
 * du texte est le plus grand, à partir de 1/36 de la hauteur de la page (30 px sur 1 080), qui tient dans la place disponible.
 */
export function placeText(image: Box, page: { width: number; height: number }, text: string): Box & { fontSize: number } {
  const margin = Math.round(page.width * 0.03)
  let x: number
  let y: number
  let width: number
  let room: number
  const right = image.x + image.width + margin
  const below = image.y + image.height + margin
  if (page.width - right - margin >= page.width * 0.25) {
    x = right
    y = Math.max(margin, image.y)
    width = Math.min(page.width - right - margin, Math.round(page.width * 0.5))
    room = page.height - y - margin
  } else if (page.height - below - margin >= page.height * 0.2) {
    x = Math.max(margin, image.x)
    y = below
    width = Math.min(page.width - x - margin, Math.max(image.width, Math.round(page.width * 0.5)))
    room = page.height - y - margin
  } else {
    x = margin
    y = margin
    width = page.width - 2 * margin
    room = page.height - 2 * margin
  }
  const base = page.height / 36
  const sizes = [1, 0.85, 0.7, 0.6, 0.5].map((k) => Math.max(12, Math.round(base * k)))
  const fontSize = sizes.find((s) => countLines(text, s, width) * s * LINE_HEIGHT <= room) ?? sizes[sizes.length - 1]
  const wanted = Math.ceil(countLines(text, fontSize, width) * fontSize * LINE_HEIGHT)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.max(Math.ceil(fontSize * LINE_HEIGHT), Math.min(Math.round(room), wanted)), fontSize }
}
