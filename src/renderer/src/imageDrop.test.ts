import { describe, expect, it } from 'vitest'
import { DROP_STEP, MAX_DROP_BYTES, dropCenter, isDroppableImage } from '@/imageDrop'

describe('dépôt d’images', () => {
  it('accepte les formats d’image courants', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']) expect(isDroppableImage({ type, name: 'a', size: 10 })).toBe(true)
  })

  it('refuse ce qui n’est pas une image, un fichier vide ou trop gros', () => {
    expect(isDroppableImage({ type: 'application/pdf', name: 'a.pdf', size: 10 })).toBe(false)
    expect(isDroppableImage({ type: 'text/plain', name: 'a.png', size: 10 })).toBe(false)
    expect(isDroppableImage({ type: 'image/png', name: 'a.png', size: 0 })).toBe(false)
    expect(isDroppableImage({ type: 'image/png', name: 'a.png', size: MAX_DROP_BYTES + 1 })).toBe(false)
  })

  it('sans type du système, l’extension décide', () => {
    expect(isDroppableImage({ type: '', name: 'Photo.JPG', size: 10 })).toBe(true)
    expect(isDroppableImage({ type: '', name: 'notes.txt', size: 10 })).toBe(false)
  })

  it('centre la première image sur le point lâché, décale les suivantes en cascade', () => {
    const page = { width: 1080, height: 1080 }
    expect(dropCenter({ x: 300, y: 400 }, 0, page)).toEqual({ x: 300, y: 400 })
    expect(dropCenter({ x: 300, y: 400 }, 2, page)).toEqual({ x: 300 + 2 * DROP_STEP, y: 400 + 2 * DROP_STEP })
  })

  it('ramène dans la page un point lâché au-delà de ses bords', () => {
    const page = { width: 1080, height: 720 }
    expect(dropCenter({ x: -50, y: 9000 }, 0, page)).toEqual({ x: 0, y: 720 })
    expect(dropCenter({ x: 2000, y: -100 }, 1, page)).toEqual({ x: 1080, y: 0 })
  })
})
