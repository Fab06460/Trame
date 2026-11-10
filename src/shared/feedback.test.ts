import { describe, expect, it } from 'vitest'
import { diagnosticText, FEEDBACK_FIELDS, feedbackUrl } from './feedback'
import { isOpenableLink } from './links'

const info = { version: '0.7.0', system: 'macOS 15.1', language: 'fr' }

describe('retours des testeurs', () => {
  it('remplit à l’avance la version, le système et la langue', () => {
    const u = new URL(feedbackUrl(info))
    expect(u.searchParams.get(FEEDBACK_FIELDS.version)).toBe('0.7.0')
    expect(u.searchParams.get(FEEDBACK_FIELDS.system)).toBe('macOS 15.1')
    expect(u.searchParams.get(FEEDBACK_FIELDS.language)).toBe('fr')
    expect(u.searchParams.get('usp')).toBe('pp_url')
  })

  it('encode les caractères spéciaux', () => {
    const u = new URL(feedbackUrl({ ...info, system: 'Windows 11 & co' }))
    expect(u.searchParams.get(FEEDBACK_FIELDS.system)).toBe('Windows 11 & co')
  })

  it('donne une adresse que l’application accepte d’ouvrir', () => {
    expect(isOpenableLink(feedbackUrl(info))).toBe(true)
  })

  it('le diagnostic ne contient que des informations techniques', () => {
    const text = diagnosticText({ ...info, arch: 'arm64', screen: '1512×982 @2x' })
    expect(text).toBe('Trame 0.7.0\nSystème : macOS 15.1 (arm64)\nLangue : fr\nÉcran : 1512×982 @2x')
    expect(diagnosticText(info)).toBe('Trame 0.7.0\nSystème : macOS 15.1\nLangue : fr')
  })
})
