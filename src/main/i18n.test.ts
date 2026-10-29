import { afterEach, describe, expect, it } from 'vitest'
import { initMainLocale, mainLocale, setMainLocale, tm } from './i18n'

afterEach(() => setMainLocale('fr'))

describe('langue du processus principal', () => {
  it('prend la langue imposée, sinon la première préférence connue, sinon l’anglais', () => {
    initMainLocale(['de-DE', 'fr'])
    expect(mainLocale()).toBe('de')
    initMainLocale(['ja-JP', 'es-MX'])
    expect(mainLocale()).toBe('es')
    initMainLocale(['ja-JP'])
    expect(mainLocale()).toBe('en')
    initMainLocale(['de'], 'fr')
    expect(mainLocale()).toBe('fr')
  })

  it('ignore une langue inconnue reçue du renderer', () => {
    setMainLocale('de')
    setMainLocale('xx')
    setMainLocale(42)
    expect(mainLocale()).toBe('de')
  })

  it('traduit les boîtes de dialogue', () => {
    expect(tm('common.cancel')).toBe('Annuler')
    setMainLocale('en')
    expect(tm('unsaved.message', { name: 'Poster' })).toBe('Save the changes to “Poster”?')
    setMainLocale('de')
    expect(tm('unsaved.detail', { action: tm('unsaved.action.close') })).toBe('Ihre Änderungen gehen verloren, wenn Sie sie nicht speichern, bevor Sie schließen.')
  })

  it('toutes les actions de fermeture ont leur phrase dans chaque langue', () => {
    for (const code of ['fr', 'en', 'de', 'es']) {
      setMainLocale(code)
      for (const a of ['close', 'new', 'open', 'importPdf', 'importPptx', 'template'] as const) expect(tm(`unsaved.action.${a}`)).not.toMatch(/^unsaved\./)
    }
  })
})
