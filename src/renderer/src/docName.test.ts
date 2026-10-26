import { describe, expect, it } from 'vitest'
import { cleanDocName, fileSafeName } from '@/docName'

describe('docName', () => {
  it('rogne et condense les espaces', () => expect(cleanDocName('  Mon   affiche \n')).toBe('Mon affiche'))
  it('retombe sur « Sans titre » si vide ou invalide', () => {
    expect(cleanDocName('   ')).toBe('Sans titre')
    expect(cleanDocName(42)).toBe('Sans titre')
    expect(cleanDocName(undefined)).toBe('Sans titre')
  })
  it('borne la longueur', () => expect(cleanDocName('a'.repeat(200))).toHaveLength(80))
  it('nom de fichier : remplace les séparateurs et caractères interdits', () => {
    expect(fileSafeName('a/b\\c:d*e?"<>|')).toBe('a-b-c-d-e-----')
    expect(fileSafeName('../secret')).toBe('-secret')
    expect(fileSafeName('.caché')).toBe('caché')
    expect(fileSafeName('...')).toBe('Sans titre')
  })
  it('garde les accents et espaces', () => expect(fileSafeName('Été 2026 — flyer')).toBe('Été 2026 — flyer'))
})
