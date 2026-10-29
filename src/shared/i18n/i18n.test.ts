import { describe, expect, it } from 'vitest'
import { interpolate, makeTranslator, matchLocale, pick, variablesOf, type Message } from './core'
import { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, translator } from './index'
import { fr } from './locales/fr'

describe('mécanique de traduction', () => {
  it('remplace les variables et laisse visibles celles qui manquent', () => {
    expect(interpolate('Page {n} sur {total}', { n: 2, total: 5 })).toBe('Page 2 sur 5')
    expect(interpolate('Bonjour {nom}', {})).toBe('Bonjour {nom}')
    expect(interpolate('Texte', { a: 1 })).toBe('Texte')
  })

  it('choisit le pluriel selon la langue', () => {
    const m = { zero: 'aucune', one: '{count} page', other: '{count} pages' }
    expect(pick(m, 'fr', { count: 0 })).toBe('aucune')
    expect(pick(m, 'fr', { count: 1 })).toBe('{count} page')
    expect(pick(m, 'fr', { count: 2 })).toBe('{count} pages')
    // en français 0 et 1 sont au singulier ; en anglais 0 est au pluriel
    const noZero = { one: '{count} page', other: '{count} pages' }
    expect(pick(noZero, 'en', { count: 0 })).toBe('{count} pages')
    expect(pick(noZero, 'en', { count: 1 })).toBe('{count} page')
    expect(pick('texte', 'en', { count: 3 })).toBe('texte')
  })

  it('retombe sur le français, puis sur la clé', () => {
    const t = makeTranslator<'a' | 'b'>('en', { a: 'Hello {x}' }, { a: 'Bonjour {x}', b: 'Deux {count} élément' })
    expect(t('a', { x: 'toi' })).toBe('Hello toi')
    expect(t('b', { count: 2 })).toBe('Deux 2 élément')
    expect(t('c' as 'a')).toBe('c')
  })

  it('trouve la langue selon les préférences du système', () => {
    expect(matchLocale(['de-DE', 'fr'], ['fr', 'en', 'de'], 'en')).toBe('de')
    expect(matchLocale(['pt_BR', 'es-MX'], ['fr', 'en', 'es'], 'en')).toBe('es')
    expect(matchLocale(['ja-JP'], ['fr', 'en'], 'en')).toBe('en')
    expect(matchLocale([], ['fr'], 'en')).toBe('en')
    expect(resolveLocale(['ja'])).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(['fr-CA'])).toBe('fr')
  })

  it('liste les variables d’un message, pluriels compris', () => {
    expect(variablesOf('{b} et {a} et {a}')).toEqual(['a', 'b'])
    expect(variablesOf({ one: '{count} {name}', other: '{count}' })).toEqual(['count', 'name'])
  })

  it('reconnaît les codes de langue', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('xx')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('catalogues', () => {
  const reference = fr as Record<string, Message>
  const keys = Object.keys(reference)

  it('quatre langues au minimum, codes uniques, français en premier', () => {
    const codes = LOCALES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes[0]).toBe('fr')
    for (const c of ['fr', 'en', 'de', 'es']) expect(codes).toContain(c)
    for (const l of LOCALES) expect(l.name.length).toBeGreaterThan(1)
  })

  for (const locale of LOCALES) {
    describe(locale.code, () => {
      const catalog = locale.catalog as Record<string, Message>

      it('a exactement les clés du français', () => {
        expect(Object.keys(catalog).filter((k) => !(k in reference))).toEqual([])
        expect(keys.filter((k) => !(k in catalog))).toEqual([])
      })

      it('garde les mêmes variables que le français', () => {
        const bad = keys.filter((k) => JSON.stringify(variablesOf(catalog[k])) !== JSON.stringify(variablesOf(reference[k])))
        expect(bad).toEqual([])
      })

      it('n’a aucun texte vide et garde la forme (texte ou pluriel) du français', () => {
        const empty = keys.filter((k) => {
          const m = catalog[k]
          return typeof m === 'string' ? m.trim() === '' : Object.values(m).some((s) => s.trim() === '')
        })
        expect(empty).toEqual([])
        // « one » / « other » partout où le français en a (la langue peut en avoir plus, jamais moins)
        const shape = keys.filter((k) => (typeof reference[k] === 'string') !== (typeof catalog[k] === 'string'))
        expect(shape).toEqual([])
      })

      it('traduit au moins l’essentiel (hors français : peu de textes identiques au français)', () => {
        if (locale.code === 'fr') return
        const same = keys.filter((k) => typeof catalog[k] === 'string' && catalog[k] === reference[k] && (reference[k] as string).length > 14)
        // quelques textes (noms propres, formats) peuvent rester identiques ; une langue non traduite les aurait tous
        expect(same.length).toBeLessThan(Math.max(5, keys.length * 0.05))
      })

      it('fonctionne par son traducteur', () => {
        expect(translator(locale.code)('toolbar.save').length).toBeGreaterThan(0)
      })
    })
  }
})
