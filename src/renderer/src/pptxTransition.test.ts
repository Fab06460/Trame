import { describe, expect, it } from 'vitest'
import { insertTransition, transitionFromEffect, transitionXml } from './pptxTransition'

const slide = (middle: string) => `<?xml version="1.0"?><p:sld xmlns:p="x"><p:cSld><p:spTree/></p:cSld>${middle}</p:sld>`

describe('transitions PowerPoint : écriture', () => {
  it('chaque transition a son élément ; « aucune » n\'en a pas', () => {
    expect(transitionXml('none')).toBe('')
    expect(transitionXml('fade')).toContain('<p:fade/>')
    expect(transitionXml('slide')).toContain('<p:push dir="l"/>')
    expect(transitionXml('cover')).toContain('<p:cover dir="l"/>')
    expect(transitionXml('zoom')).toContain('<p:zoom dir="in"/>')
  })
  it('s\'insère après clrMapOvr', () => {
    const out = insertTransition(slide('<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'), 'fade')
    expect(out).toMatch(/<\/p:clrMapOvr><p:transition spd="med"><p:fade\/><\/p:transition><\/p:sld>/)
  })
  it('s\'insère avant timing quand il n\'y a pas de clrMapOvr', () => {
    const out = insertTransition(slide('<p:timing/>'), 'zoom')
    expect(out.indexOf('<p:transition')).toBeLessThan(out.indexOf('<p:timing'))
    expect(out.indexOf('<p:transition')).toBeGreaterThan(out.indexOf('</p:cSld>'))
  })
  it('clrMapOvr auto-fermant et fin de diapositive', () => {
    expect(insertTransition(slide('<p:clrMapOvr/>'), 'slide')).toContain('<p:clrMapOvr/><p:transition')
    expect(insertTransition(slide(''), 'cover')).toContain('</p:cSld><p:transition')
  })
  it('« aucune » ne change rien ; une transition déjà présente n\'est pas doublée', () => {
    const base = slide('<p:clrMapOvr/>')
    expect(insertTransition(base, 'none')).toBe(base)
    const once = insertTransition(base, 'fade')
    expect(insertTransition(once, 'slide')).toBe(once)
  })
})

describe('transitions PowerPoint : lecture', () => {
  it('correspondance des effets', () => {
    expect(transitionFromEffect(null)).toBe('none')
    expect(transitionFromEffect('cut')).toBe('none')
    expect(transitionFromEffect('fade')).toBe('fade')
    expect(transitionFromEffect('push')).toBe('slide')
    expect(transitionFromEffect('cover')).toBe('cover')
    expect(transitionFromEffect('zoom')).toBe('zoom')
  })
  it('les autres effets deviennent un fondu', () => {
    for (const e of ['wipe', 'blinds', 'checker', 'dissolve', 'vortex', 'whatever']) expect(transitionFromEffect(e)).toBe('fade')
  })
})
