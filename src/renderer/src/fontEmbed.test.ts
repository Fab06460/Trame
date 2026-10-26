import { describe, expect, it } from 'vitest'
import { embedFonts, sanitizeFonts, usedFamilies } from '@/fontEmbed'
import type { TrameDocument } from '@/types'

const known = (id: string, name: string) => ({ id, name, family: `"${name}", serif`, category: 'serif', license: 'OFL-1.1', data: { '400': 'AAAA', '700': 'BBBB' } })
const doc = (families: Array<string | undefined>): TrameDocument => ({ version: 2, name: 'x', width: 10, height: 10, pages: [{ id: 'p', background: '#fff', elements: families.map((f, i) => ({ id: `e${i}`, type: 'text', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, fill: '#000', fontFamily: f })) }] })

describe('fontEmbed', () => {
  it('familles utilisées par les textes', () => expect([...usedFamilies(doc(['"A", serif', '"A", serif', undefined, '"B", serif']))].sort()).toEqual(['"A", serif', '"B", serif']))

  it('embarque seulement les polices en ligne utilisées', () => {
    const d = embedFonts(doc(['"Zeta", serif', '"Inter", sans-serif']), [known('zeta', 'Zeta'), known('autre', 'Autre')])
    expect(Object.keys(d.fonts ?? {})).toEqual(['zeta'])
    expect(d.fonts!.zeta).toMatchObject({ name: 'Zeta', family: '"Zeta", serif', variants: { '400': 'AAAA', '700': 'BBBB' } })
  })

  it('aucune police en ligne utilisée : pas de clé « fonts » (même retirée d\'un ancien enregistrement)', () => {
    const base = { ...doc(['"Inter", sans-serif']), fonts: { vieux: { name: 'V', family: '"V", serif', category: 'serif', license: '', variants: { '400': 'AA' } } } }
    expect('fonts' in embedFonts(base, [known('zeta', 'Zeta')])).toBe(false)
  })

  it('nettoyage à la lecture', () => {
    const raw: { fonts?: unknown } = {
      fonts: {
        ok: { name: 'Zeta', family: '"Zeta", serif', category: 'serif', license: 'OFL-1.1', variants: { '400': 'AAAA', '900': 'AAAA', '700': '<script>' } },
        'Bad Id': { name: 'X', family: '"X", serif', variants: { '400': 'AAAA' } },
        sans400: { name: 'Y', family: '"Y", serif', variants: { '700': 'AAAA' } },
        injection: { name: 'Z"', family: '"Z", serif', variants: { '400': 'AAAA' } },
        famille: { name: 'W', family: 'pas au bon format', variants: { '400': 'AAAA' } }
      }
    }
    sanitizeFonts(raw)
    expect(Object.keys(raw.fonts as object)).toEqual(['ok'])
    expect((raw.fonts as Record<string, { variants: object }>).ok.variants).toEqual({ '400': 'AAAA' })
    const none: { fonts?: unknown } = { fonts: 'oops' }
    sanitizeFonts(none)
    expect('fonts' in none).toBe(false)
  })
})
