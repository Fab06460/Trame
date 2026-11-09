import { describe, expect, it } from 'vitest'
import { resolveTheme, sanitizeThemeMode } from './theme'

describe('thème', () => {
  it('le choix explicite l\'emporte ; « automatique » suit le système', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })
  it('un réglage inconnu ou absent retombe sur automatique', () => {
    expect(sanitizeThemeMode('light')).toBe('light')
    expect(sanitizeThemeMode('dark')).toBe('dark')
    for (const v of [null, undefined, '', 'sepia', 3, {}]) expect(sanitizeThemeMode(v)).toBe('auto')
  })
})
