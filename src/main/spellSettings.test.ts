import { describe, expect, it } from 'vitest'
import { contextPlan, dictionariesFor, isDictionaryWord, MAX_SUGGESTIONS, parseSpellSettings, type ContextParams } from './spellSettings'

const base: ContextParams = { isEditable: true, selectionText: '', misspelledWord: '', dictionarySuggestions: [], editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }

describe('réglages du correcteur', () => {
  it('valeurs par défaut : activé, langue automatique', () => {
    for (const bad of [undefined, null, 'pas du json', '[]', 12, '{"enabled":"non"}']) expect(parseSpellSettings(bad)).toEqual({ enabled: true, language: 'auto' })
  })
  it('lit un réglage valide (texte ou objet)', () => {
    expect(parseSpellSettings('{"enabled":false,"language":"de"}')).toEqual({ enabled: false, language: 'de' })
    expect(parseSpellSettings({ enabled: true, language: 'es' })).toEqual({ enabled: true, language: 'es' })
  })
  it('une langue inconnue redevient automatique', () => {
    expect(parseSpellSettings({ enabled: true, language: 'klingon' }).language).toBe('auto')
  })
  it('dictionnaire : langue de l\'application, ou celle choisie, si Chromium la connaît', () => {
    const available = ['fr', 'en-US', 'de', 'es', 'it']
    expect(dictionariesFor({ enabled: true, language: 'auto' }, 'fr', available)).toEqual(['fr'])
    expect(dictionariesFor({ enabled: true, language: 'auto' }, 'en', available)).toEqual(['en-US'])
    expect(dictionariesFor({ enabled: true, language: 'de' }, 'fr', available)).toEqual(['de'])
    expect(dictionariesFor({ enabled: true, language: 'auto' }, 'pt', available)).toEqual(['en-US'])
    expect(dictionariesFor({ enabled: true, language: 'es' }, 'fr', ['fr'])).toEqual([])
  })
  it('mot de dictionnaire personnel', () => {
    for (const ok of ['Trame', "l'école", 'peut-être', 'ß']) expect(isDictionaryWord(ok)).toBe(true)
    for (const bad of ['', 'deux mots', 'a\nb', 'x'.repeat(61), 3, null, undefined]) expect(isDictionaryWord(bad)).toBe(false)
  })
})

describe('menu du clic droit', () => {
  it('rien sur autre chose qu\'un champ ou une sélection', () => {
    expect(contextPlan({ ...base, isEditable: false })).toEqual([])
  })
  it('dans un champ : couper, copier, coller, tout sélectionner (états repris)', () => {
    const plan = contextPlan(base)
    expect(plan.map((i) => i.kind)).toEqual(['cut', 'copy', 'paste', 'separator', 'select-all'])
    expect(plan[0]).toEqual({ kind: 'cut', enabled: false })
    expect(plan[2]).toEqual({ kind: 'paste', enabled: true })
  })
  it('sélection hors champ : copier seulement', () => {
    expect(contextPlan({ ...base, isEditable: false, selectionText: 'x' })).toEqual([{ kind: 'copy', enabled: true }])
  })
  it('mot mal orthographié : suggestions (plafonnées), ajout au dictionnaire, puis les commandes', () => {
    const plan = contextPlan({ ...base, misspelledWord: 'bonjuor', dictionarySuggestions: ['bonjour', 'a', 'b', 'c', 'd', 'e', 'f'] })
    expect(plan.filter((i) => i.kind === 'suggestion')).toHaveLength(MAX_SUGGESTIONS)
    expect(plan[0]).toEqual({ kind: 'suggestion', word: 'bonjour' })
    expect(plan).toContainEqual({ kind: 'add-word', word: 'bonjuor' })
    expect(plan.at(-1)?.kind).toBe('select-all')
  })
  it('sans suggestion : une ligne inactive le dit, l\'ajout reste proposé', () => {
    const plan = contextPlan({ ...base, misspelledWord: 'zzzz' })
    expect(plan[0]).toEqual({ kind: 'no-suggestion' })
    expect(plan[1]).toEqual({ kind: 'add-word', word: 'zzzz' })
  })
  it('un mot soupçonné hors d\'un champ modifiable n\'offre pas de correction', () => {
    expect(contextPlan({ ...base, isEditable: false, selectionText: 'x', misspelledWord: 'bonjuor' }).some((i) => i.kind === 'suggestion')).toBe(false)
  })
})
