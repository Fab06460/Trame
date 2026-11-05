/**
 * Réglages du correcteur orthographique (pur, testé) : activé ou non, et langue. Les mots du dictionnaire personnel sont gardés par
 * Chromium lui-même (session) ; ici seuls l'interrupteur et la langue sont enregistrés.
 */

export const SPELL_LANGUAGES = ['fr', 'en', 'de', 'es'] as const
export type SpellLanguage = (typeof SPELL_LANGUAGES)[number]

export interface SpellSettings {
  enabled: boolean
  /** `auto` = la langue de l'application */
  language: SpellLanguage | 'auto'
}

export const DEFAULT_SPELL_SETTINGS: SpellSettings = { enabled: true, language: 'auto' }

/** Code de dictionnaire demandé à Chromium pour chaque langue de l'application (inutile sur macOS : le système choisit seul). */
const DICTIONARY: Record<SpellLanguage, string> = { fr: 'fr', en: 'en-US', de: 'de', es: 'es' }

export function parseSpellSettings(raw: unknown): SpellSettings {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { ...DEFAULT_SPELL_SETTINGS }
    }
  }
  if (!data || typeof data !== 'object') return { ...DEFAULT_SPELL_SETTINGS }
  const o = data as Record<string, unknown>
  const language = o.language === 'auto' || SPELL_LANGUAGES.includes(o.language as SpellLanguage) ? (o.language as SpellSettings['language']) : 'auto'
  return { enabled: o.enabled !== false, language }
}

/** Dictionnaires à charger : la langue choisie, ou celle de l'application ; seulement ceux que Chromium connaît. Liste vide = ne rien changer. */
export function dictionariesFor(settings: SpellSettings, appLocale: string, available: readonly string[]): string[] {
  const lang: SpellLanguage = settings.language === 'auto' ? (SPELL_LANGUAGES.includes(appLocale as SpellLanguage) ? (appLocale as SpellLanguage) : 'en') : settings.language
  const wanted = DICTIONARY[lang]
  return available.includes(wanted) ? [wanted] : []
}

/** Un mot acceptable pour le dictionnaire personnel : un seul mot, de longueur raisonnable, sans caractère de contrôle. */
export function isDictionaryWord(w: unknown): w is string {
  return typeof w === 'string' && w.length >= 1 && w.length <= 60 && !/[\s\u0000-\u001f]/.test(w)
}

// ———————————————————— menu contextuel ————————————————————

export interface ContextParams {
  isEditable: boolean
  selectionText: string
  misspelledWord: string
  dictionarySuggestions: string[]
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
}

export type ContextItem =
  | { kind: 'suggestion'; word: string }
  | { kind: 'no-suggestion' }
  | { kind: 'add-word'; word: string }
  | { kind: 'separator' }
  | { kind: 'cut' | 'copy' | 'paste' | 'select-all'; enabled: boolean }

export const MAX_SUGGESTIONS = 5

/** Ce que le menu du clic droit contient ; vide = pas de menu (clic sur autre chose qu'un champ de texte ou une sélection). */
export function contextPlan(p: ContextParams): ContextItem[] {
  if (!p.isEditable && !p.selectionText) return []
  const items: ContextItem[] = []
  if (p.isEditable && p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
    if (suggestions.length) for (const word of suggestions) items.push({ kind: 'suggestion', word })
    else items.push({ kind: 'no-suggestion' })
    items.push({ kind: 'add-word', word: p.misspelledWord }, { kind: 'separator' })
  }
  if (p.isEditable) {
    items.push({ kind: 'cut', enabled: p.editFlags.canCut }, { kind: 'copy', enabled: p.editFlags.canCopy }, { kind: 'paste', enabled: p.editFlags.canPaste }, { kind: 'separator' }, { kind: 'select-all', enabled: p.editFlags.canSelectAll })
  } else {
    items.push({ kind: 'copy', enabled: true })
  }
  return items
}
