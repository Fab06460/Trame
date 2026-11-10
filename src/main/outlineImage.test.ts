import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDocumentImage } from './outlineImage'

const dir = resolve('/documents/cours')

describe('images d’un fichier Markdown', () => {
  it('accepte une image du dossier ou d’un sous-dossier, avec son type', () => {
    expect(resolveDocumentImage(dir, 'schema.png')).toEqual({ path: join(dir, 'schema.png'), mime: 'image/png' })
    expect(resolveDocumentImage(dir, './img/photo.JPG')).toEqual({ path: join(dir, 'img', 'photo.JPG'), mime: 'image/jpeg' })
    expect(resolveDocumentImage(dir, 'a/b/c.webp')?.mime).toBe('image/webp')
    expect(resolveDocumentImage(dir, 'a/../b.gif')).toEqual({ path: join(dir, 'b.gif'), mime: 'image/gif' })
  })

  it('décode les espaces et ignore la requête et l’ancre', () => {
    expect(resolveDocumentImage(dir, 'mes%20images/un%20schema.png?raw=1#x')).toEqual({ path: join(dir, 'mes images', 'un schema.png'), mime: 'image/png' })
  })

  it('refuse de sortir du dossier, par « .. » ou autrement', () => {
    for (const ref of ['../secret.png', 'a/../../secret.png', '..\\secret.png', '../cours2/x.png', 'img/../../x.png', '%2e%2e/x.png']) {
      expect(resolveDocumentImage(dir, ref), ref).toBeNull()
    }
  })

  it('refuse les chemins absolus, les lecteurs, les adresses et les schémas', () => {
    for (const ref of ['/etc/passwd.png', '\\\\serveur\\x.png', 'C:\\x.png', 'c:/x.png', 'file:///x.png', 'https://exemple.fr/x.png', 'http://a/b.png', 'data:image/png;base64,AA', 'javascript:alert(1).png']) {
      expect(resolveDocumentImage(dir, ref), ref).toBeNull()
    }
  })

  it('refuse un autre type de fichier, un nom vide ou un caractère nul', () => {
    for (const ref of ['', '   ', 'notes.txt', 'script.js', 'x.svg', 'sans-extension', 'img/', 'a\0.png', '%00.png', '.png.txt', '%zz.png']) {
      expect(resolveDocumentImage(dir, ref), JSON.stringify(ref)).toBeNull()
    }
  })

  it('un nom qui commence par deux points reste dans le dossier', () => {
    expect(resolveDocumentImage(dir, '..image.png')).toEqual({ path: join(dir, '..image.png'), mime: 'image/png' })
  })
})
