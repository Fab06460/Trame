import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('couleurs de la feuille de style', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf-8')

  it('aucune variable ne se définit par elle-même (elle serait invalide, donc sans couleur)', () => {
    const selfRef = [...css.matchAll(/(--[a-z-]+):\s*var\(\1\)/g)].map((m) => m[1])
    expect(selfRef).toEqual([])
  })

  it('le thème clair redéfinit toutes les variables du thème sombre', () => {
    const names = (block: string): string[] => [...block.matchAll(/^\s+(--[a-z-]+):/gm)].map((m) => m[1])
    const dark = css.match(/:root, :root\[data-theme="dark"\][^{]*\{([^}]*)\}/)?.[1] ?? ''
    const light = css.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(names(dark).filter((n) => !names(light).includes(n))).toEqual([])
  })
})
