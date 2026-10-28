import { describe, expect, it } from 'vitest'
import { cleanTransition, DEFAULT_TRANSITION, isTransition, transitionDirection } from './transition'

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
