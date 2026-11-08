import { describe, expect, it } from 'vitest'
import { isOpenableLink, MAX_LINK_CHARS, normalizeLink } from './links'

describe('normalizeLink', () => {
  it('garde une adresse web complète, normalisée', () => {
    expect(normalizeLink('https://exemple.fr')).toBe('https://exemple.fr/')
    expect(normalizeLink('  http://exemple.fr/a?b=1 ')).toBe('http://exemple.fr/a?b=1')
  })
  it('ajoute https:// devant une adresse sans schéma', () => {
    expect(normalizeLink('exemple.fr/page')).toBe('https://exemple.fr/page')
    expect(normalizeLink('localhost:3000')).toBe('https://localhost:3000/')
  })
  it('reconnaît une adresse de courrier', () => {
    expect(normalizeLink('moi@exemple.fr')).toBe('mailto:moi@exemple.fr')
    expect(normalizeLink('mailto:moi@exemple.fr')).toBe('mailto:moi@exemple.fr')
  })
  it('refuse tout autre schéma', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'file:///etc/passwd', 'data:text/html,<b>', 'ftp://exemple.fr', 'vbscript:x']) expect(normalizeLink(bad)).toBeNull()
  })
  it('refuse le vide, les espaces et les adresses trop longues', () => {
    expect(normalizeLink('')).toBeNull()
    expect(normalizeLink('   ')).toBeNull()
    expect(normalizeLink('exemple fr')).toBeNull()
    expect(normalizeLink('https://exemple.fr/' + 'a'.repeat(MAX_LINK_CHARS))).toBeNull()
    expect(normalizeLink('https://')).toBeNull()
    expect(normalizeLink('mailto:')).toBeNull()
  })
})

describe('isOpenableLink', () => {
  it('n\'accepte qu\'une adresse déjà normalisée', () => {
    expect(isOpenableLink('https://exemple.fr/')).toBe(true)
    expect(isOpenableLink('exemple.fr')).toBe(false)
    expect(isOpenableLink('javascript:alert(1)')).toBe(false)
    expect(isOpenableLink(42)).toBe(false)
    expect(isOpenableLink(undefined)).toBe(false)
  })
})
