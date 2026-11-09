import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, lastDocumentToReopen, parseAppSettings, parseLastDocument } from './appSettings'

describe('réglages généraux', () => {
  it('rouvre le dernier document par défaut', () => {
    expect(DEFAULT_APP_SETTINGS.reopenLast).toBe(true)
    expect(parseAppSettings(null)).toEqual({ reopenLast: true })
    expect(parseAppSettings('pas du json')).toEqual({ reopenLast: true })
    expect(parseAppSettings('[1]')).toEqual({ reopenLast: true })
  })
  it('lit le réglage coupé, ignore une valeur qui n\'est pas un booléen', () => {
    expect(parseAppSettings('{"reopenLast":false}')).toEqual({ reopenLast: false })
    expect(parseAppSettings({ reopenLast: false })).toEqual({ reopenLast: false })
    expect(parseAppSettings({ reopenLast: 'non' })).toEqual({ reopenLast: true })
  })
  it('prend les valeurs par défaut données quand le fichier ne dit rien', () => {
    expect(parseAppSettings(null, { reopenLast: false })).toEqual({ reopenLast: false })
    expect(parseAppSettings({ reopenLast: true }, { reopenLast: false })).toEqual({ reopenLast: true })
  })
  it('lit le dernier document : un chemin .trame, rien d\'autre', () => {
    expect(parseLastDocument('{"path":"/Users/a/cours.trame"}')).toBe('/Users/a/cours.trame')
    expect(parseLastDocument('{"path":null}')).toBeNull()
    expect(parseLastDocument('{"path":""}')).toBeNull()
    expect(parseLastDocument('{"path":"/etc/passwd"}')).toBeNull()
    expect(parseLastDocument('{"path":12}')).toBeNull()
    expect(parseLastDocument(null)).toBeNull()
    expect(parseLastDocument('{')).toBeNull()
  })
  it('choisit le document à rouvrir', () => {
    const on = { reopenLast: true }
    expect(lastDocumentToReopen(on, '/a.trame', false)).toBe('/a.trame')
    expect(lastDocumentToReopen({ reopenLast: false }, '/a.trame', false)).toBeNull()
    expect(lastDocumentToReopen(on, null, false)).toBeNull()
    expect(lastDocumentToReopen(on, '/a.trame', true)).toBeNull() // un fichier demandé par le système passe avant
  })
})
