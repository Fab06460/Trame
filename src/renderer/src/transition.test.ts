import { describe, expect, it } from 'vitest'
import { cleanPageTransition, cleanTransition, DEFAULT_TRANSITION, isTransition, pageTransition, transitionBetween, transitionDirection, type PageTransition } from './transition'

describe('transitions de présentation', () => {
  it('ne reconnaît que les transitions connues', () => {
    for (const t of ['none', 'fade', 'slide', 'cover', 'zoom']) expect(isTransition(t)).toBe(true)
    for (const t of ['Fade', '', null, 3, undefined, 'spin']) expect(isTransition(t)).toBe(false)
  })
  it('le fondu est la valeur par défaut : il n\'est pas écrit dans le fichier', () => {
    expect(DEFAULT_TRANSITION).toBe('fade')
    expect(cleanTransition('fade')).toBeUndefined()
    expect(cleanTransition('slide')).toBe('slide')
    expect(cleanTransition('none')).toBe('none')
    expect(cleanTransition('spin')).toBeUndefined()
  })
  it('le sens suit la navigation', () => {
    expect(transitionDirection(0, 1, 3, false)).toBe(1)
    expect(transitionDirection(2, 1, 3, false)).toBe(-1)
    expect(transitionDirection(0, 2, 3, false)).toBe(1)
  })
  it('la boucle de lecture automatique avance même de la dernière à la première page', () => {
    expect(transitionDirection(2, 0, 3, true)).toBe(1)
    expect(transitionDirection(2, 0, 3, false)).toBe(-1)
  })
})

describe('transition par page', () => {
  const doc = (def: PageTransition | undefined, pages: Array<PageTransition | undefined>) => ({ transition: def, pages: pages.map((t) => ({ transition: t })) })
  it('une page sans réglage hérite du document, puis du fondu', () => {
    expect(pageTransition(doc('zoom', [undefined, 'slide']), 0)).toBe('zoom')
    expect(pageTransition(doc('zoom', [undefined, 'slide']), 1)).toBe('slide')
    expect(pageTransition(doc(undefined, [undefined]), 0)).toBe('fade')
  })
  it('en avançant, c\'est la transition de la page d\'arrivée', () => {
    const d = doc('fade', [undefined, 'slide', 'zoom'])
    expect(transitionBetween(d, 0, 1)).toBe('slide')
    expect(transitionBetween(d, 1, 2)).toBe('zoom')
    expect(transitionBetween(d, 0, 2)).toBe('zoom')
  })
  it('en reculant, c\'est celle de la page quittée', () => {
    const d = doc('fade', [undefined, 'slide', 'zoom'])
    expect(transitionBetween(d, 2, 1)).toBe('zoom')
    expect(transitionBetween(d, 1, 0)).toBe('slide')
  })
  it('première apparition : la transition de la page elle-même', () => {
    expect(transitionBetween(doc('fade', ['cover']), null, 0)).toBe('cover')
  })
  it('« aucune » sur une page est conservé (≠ hériter), et le fondu aussi quand le document a une autre transition', () => {
    expect(pageTransition(doc('slide', ['none', 'fade']), 0)).toBe('none')
    expect(pageTransition(doc('slide', ['none', 'fade']), 1)).toBe('fade')
    expect(cleanPageTransition('fade')).toBe('fade')
    expect(cleanPageTransition('spin')).toBeUndefined()
  })
})
