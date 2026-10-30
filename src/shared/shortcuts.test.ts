import { describe, expect, it } from 'vitest'
import { ctrlNameFor, shortcutText } from './shortcuts'

describe('shortcutText', () => {
  it('ne change rien sous macOS', () => {
    expect(shortcutText('Nouveau (⌘N)', true)).toBe('Nouveau (⌘N)')
  })
  it('remplace les symboles par les noms de touches', () => {
    expect(shortcutText('Nouveau (⌘N)', false)).toBe('Nouveau (Ctrl+N)')
    expect(shortcutText('Enregistrer sous (⇧⌘S)', false)).toBe('Enregistrer sous (Ctrl+Shift+S)')
    expect(shortcutText('Liste des pages (⌘⌥3)', false)).toBe('Liste des pages (Ctrl+Alt+3)')
  })
  it('touche seule, au milieu d\'une phrase', () => {
    expect(shortcutText('maintenir ⌘ pour la suspendre', false)).toBe('maintenir Ctrl pour la suspendre')
    expect(shortcutText('(maintenir ⌘)', false)).toBe('(maintenir Ctrl)')
  })
  it('signes + et - comme touche', () => {
    expect(shortcutText('Zoom avant (⌘+)', false)).toBe('Zoom avant (Ctrl++)')
    expect(shortcutText('Zoom arrière (⌘-)', false)).toBe('Zoom arrière (Ctrl+-)')
  })
  it('texte sans raccourci inchangé ; Strg en allemand', () => {
    expect(shortcutText('Bonjour', false)).toBe('Bonjour')
    expect(shortcutText('Neu (⌘N)', false, ctrlNameFor('de'))).toBe('Neu (Strg+N)')
  })
})
