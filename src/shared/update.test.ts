import { describe, expect, it } from 'vitest'
import { MIN_CHECK_INTERVAL_MS, isRepoConfigured, parseRepository, parseUpdateSettings, releasesUrl, shouldAutoCheck } from './update'

describe('parseUpdateSettings', () => {
  it('lit le réglage, par défaut activé', () => {
    expect(parseUpdateSettings('{"auto":false,"lastCheck":5}')).toEqual({ auto: false, lastCheck: 5 })
    expect(parseUpdateSettings('{}')).toEqual({ auto: true })
    expect(parseUpdateSettings('pas du json')).toEqual({ auto: true })
    expect(parseUpdateSettings('{"auto":"non","lastCheck":"x"}')).toEqual({ auto: true })
  })
})

describe('shouldAutoCheck', () => {
  it('respecte le réglage et l\'intervalle minimal', () => {
    const now = 10 * MIN_CHECK_INTERVAL_MS
    expect(shouldAutoCheck({ auto: false }, now)).toBe(false)
    expect(shouldAutoCheck({ auto: true }, now)).toBe(true)
    expect(shouldAutoCheck({ auto: true, lastCheck: now - 1000 }, now)).toBe(false)
    expect(shouldAutoCheck({ auto: true, lastCheck: now - MIN_CHECK_INTERVAL_MS }, now)).toBe(true)
    // horloge réglée en arrière : on revérifie plutôt que de ne plus jamais vérifier
    expect(shouldAutoCheck({ auto: true, lastCheck: now + 1000 }, now)).toBe(true)
  })
})

describe('isRepoConfigured / releasesUrl', () => {
  it('refuse le nom provisoire et les noms invalides', () => {
    expect(isRepoConfigured('OWNER', 'trame')).toBe(false)
    expect(isRepoConfigured('', 'trame')).toBe(false)
    expect(isRepoConfigured('a/b', 'trame')).toBe(false)
    expect(isRepoConfigured('fabrice', 'tra me')).toBe(false)
    expect(isRepoConfigured(undefined, undefined)).toBe(false)
    expect(isRepoConfigured('fabrice', 'trame')).toBe(true)
  })

  it('construit l\'adresse de la dernière version', () => {
    expect(releasesUrl('fabrice', 'trame')).toBe('https://github.com/fabrice/trame/releases/latest')
  })
})

describe('parseRepository', () => {
  it('lit les écritures usuelles du champ repository', () => {
    const want = { owner: 'fabrice', repo: 'trame' }
    expect(parseRepository('https://github.com/fabrice/trame')).toEqual(want)
    expect(parseRepository({ type: 'git', url: 'git+https://github.com/fabrice/trame.git' })).toEqual(want)
    expect(parseRepository('github:fabrice/trame')).toEqual(want)
    expect(parseRepository('git@github.com:fabrice/trame.git')).toEqual(want)
  })

  it('refuse le nom provisoire, un autre site ou une valeur absente', () => {
    expect(parseRepository('https://github.com/OWNER/trame')).toBeNull()
    expect(parseRepository('https://gitlab.com/fabrice/trame')).toBeNull()
    expect(parseRepository(undefined)).toBeNull()
    expect(parseRepository('https://github.com/fabrice/trame/extra')).toBeNull()
  })
})
