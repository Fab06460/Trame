import { describe, expect, it } from 'vitest'
import { isMergeImageFile, matchImageFile, mergeImageMime } from './mergeImages'

const files = ['Ada.JPG', 'alan.png', 'grace.webp', 'linus.jpeg', 'notes.txt']

describe('images d\'un publipostage', () => {
  it('nom exact, avec ou sans majuscules', () => {
    expect(matchImageFile(files, 'alan.png')).toBe('alan.png')
    expect(matchImageFile(files, 'ADA.jpg')).toBe('Ada.JPG')
  })
  it('extension facultative', () => {
    expect(matchImageFile(files, 'grace')).toBe('grace.webp')
    expect(matchImageFile(files, ' Linus ')).toBe('linus.jpeg')
  })
  it('un chemin est réduit à son nom : on ne sort jamais du dossier', () => {
    expect(matchImageFile(files, 'photos/alan.png')).toBe('alan.png')
    expect(matchImageFile(files, '..\\..\\etc\\alan.png')).toBe('alan.png')
    expect(matchImageFile(files, '../secret.png')).toBeNull()
    expect(matchImageFile(files, '..')).toBeNull()
  })
  it('introuvable, vide, ou pas une image : null', () => {
    expect(matchImageFile(files, 'inconnu')).toBeNull()
    expect(matchImageFile(files, '')).toBeNull()
    expect(matchImageFile(files, 'notes')).toBeNull()
  })
  it('formats acceptés', () => {
    expect(['a.png', 'a.JPG', 'a.jpeg', 'a.webp'].every(isMergeImageFile)).toBe(true)
    expect(['a.gif', 'a.svg', 'a', 'a.txt'].some(isMergeImageFile)).toBe(false)
    expect(mergeImageMime('x.JPG')).toBe('image/jpeg')
    expect(mergeImageMime('x.bmp')).toBeNull()
  })
})
