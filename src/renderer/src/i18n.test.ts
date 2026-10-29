import { afterEach, describe, expect, it } from 'vitest'
import { formatRelative } from '@/formatDate'
import { isUntitledName, t, useLocale } from '@/i18n'
import { TEMPLATES, instantiate, previewPage, templateCategory, templateName } from '@/templates'
import { defaultName, fileSafeName } from '@/docName'
import { layerLabel } from '@/layers'
import { LOCALES } from '@shared/i18n'

afterEach(() => useLocale.setState({ locale: 'fr' }))

describe('langue de l’interface', () => {
  it('t() suit la langue courante, y compris hors composant', () => {
    expect(t('toolbar.save')).toBe('Enregistrer')
    useLocale.getState().setLocale('en')
    expect(t('toolbar.save')).toBe('Save')
    useLocale.getState().setLocale('de')
    expect(t('toolbar.save')).toBe('Speichern')
    useLocale.getState().setLocale('es')
    expect(t('toolbar.save')).toBe('Guardar')
  })

  it('refuse une langue inconnue', () => {
    useLocale.getState().setLocale('xx')
    expect(useLocale.getState().locale).toBe('fr')
  })

  it('pluriels et variables dans chaque langue', () => {
    const lines: Record<string, [string, string]> = {
      fr: ['1 occurrence remplacée', '3 occurrences remplacées'],
      en: ['1 match replaced', '3 matches replaced'],
      de: ['1 Treffer ersetzt', '3 Treffer ersetzt'],
      es: ['1 coincidencia reemplazada', '3 coincidencias reemplazadas']
    }
    for (const [code, [one, many]] of Object.entries(lines)) {
      useLocale.setState({ locale: code })
      expect(t('find.replaced', { count: 1 })).toBe(one)
      expect(t('find.replaced', { count: 3 })).toBe(many)
    }
  })

  it('un document sans titre reste reconnu après un changement de langue', () => {
    expect(defaultName()).toBe('Sans titre')
    useLocale.setState({ locale: 'en' })
    expect(defaultName()).toBe('Untitled')
    expect(fileSafeName('')).toBe('Untitled')
    for (const l of LOCALES) expect(isUntitledName(l.catalog['doc.untitled'] as string)).toBe(true)
    expect(isUntitledName('Mon affiche')).toBe(false)
  })

  it('les libellés de calques par défaut suivent la langue', () => {
    expect(layerLabel({ type: 'rect' })).toBe('Rectangle')
    useLocale.setState({ locale: 'de' })
    expect(layerLabel({ type: 'rect' })).toBe('Rechteck')
    expect(layerLabel({ type: 'rect', name: 'Fond' })).toBe('Fond')
  })

  it('les dates relatives suivent la langue', () => {
    const now = new Date('2026-10-25T12:00:00Z').getTime()
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('il y a 3 heures')
    useLocale.setState({ locale: 'en' })
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 hours ago')
    expect(formatRelative(now - 10_000, now)).toBe('just now')
    useLocale.setState({ locale: 'de' })
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('vor 3 Stunden')
  })
})

describe('modèles intégrés traduits', () => {
  it('nom, catégorie et textes dans chaque langue, sans marqueur de traduction restant', () => {
    for (const l of LOCALES) {
      useLocale.setState({ locale: l.code })
      for (const tpl of TEMPLATES) {
        expect(templateName(tpl), `${l.code} ${tpl.id}`).not.toMatch(/^tpl\./)
        expect(templateCategory(tpl)).not.toMatch(/^tpl\./)
        const doc = instantiate(tpl)
        expect(doc.name).toBe(templateName(tpl))
        for (const page of doc.pages) for (const e of page.elements) if (e.type === 'text') expect(e.text, `${l.code} ${tpl.id}`).not.toMatch(/^i18n:|^tpl\./)
        for (const e of previewPage(tpl.pages[0]).elements) if (e.type === 'text') expect(e.text).not.toMatch(/^i18n:/)
      }
    }
  })

  it('le texte change avec la langue et les variables sont remplacées', () => {
    const deck = TEMPLATES.find((x) => x.id === 'deck')!
    const texts = (): string[] => instantiate(deck).pages.flatMap((p) => p.elements.filter((e) => e.type === 'text').map((e) => e.text!))
    expect(texts()).toContain('Idée 2')
    useLocale.setState({ locale: 'en' })
    expect(texts()).toContain('Idea 2')
    expect(texts()).toContain('Key points')
    useLocale.setState({ locale: 'es' })
    expect(texts()).toContain('Puntos clave')
  })

  it('les textes traduits restent dans la page (largeur du texte)', () => {
    for (const l of LOCALES) {
      useLocale.setState({ locale: l.code })
      for (const tpl of TEMPLATES) for (const p of instantiate(tpl).pages) for (const e of p.elements) if (e.type === 'text') expect(e.x + e.width).toBeLessThanOrEqual(tpl.width)
    }
  })
})
