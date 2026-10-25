import { describe, expect, it } from 'vitest'
import {
  MAX_NAME, MAX_THUMBNAIL_CHARS, addMeta, isValidId, normalizeName, parseTemplateIndex, removeMeta, sanitizeMeta,
  type TemplateMeta
} from './userTemplates'

const input = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Mon modèle', width: 1080, height: 1080, pageCount: 2, thumbnail: 'data:image/jpeg;base64,AAAA', ...over
})
const meta = (id: string, over: Partial<TemplateMeta> = {}): TemplateMeta => ({ ...(sanitizeMeta(input(), id, 1) as TemplateMeta), ...over })

describe('isValidId', () => {
  it('accepte un identifiant sûr', () => {
    expect(isValidId('3f2a9c1e-77b4-4d1a-9a0e-1c2b3d4e5f60')).toBe(true)
    expect(isValidId('abcdefgh')).toBe(true)
  })
  it.each(['', 'court', '../../etc/passwd', 'a/b/c/d/e/f/g/h', 'abc def gh', 'x'.repeat(65), 42, null, undefined])(
    'refuse %j (protège contre l’écriture hors du dossier des modèles)',
    (id) => expect(isValidId(id)).toBe(false)
  )
})

describe('normalizeName', () => {
  it('nettoie les espaces et borne la longueur', () => {
    expect(normalizeName('  Mon   super\n modèle ')).toBe('Mon super modèle')
    expect(normalizeName('x'.repeat(200))).toHaveLength(MAX_NAME)
  })
  it('retombe sur un nom par défaut', () => {
    expect(normalizeName('   ')).toBe('Sans titre')
    expect(normalizeName(undefined)).toBe('Sans titre')
    expect(normalizeName(12)).toBe('Sans titre')
  })
})

describe('sanitizeMeta', () => {
  it('accepte des métadonnées valides', () => {
    expect(sanitizeMeta(input(), 'abcdefgh', 5)).toMatchObject({ id: 'abcdefgh', name: 'Mon modèle', createdAt: 5, pageCount: 2 })
  })
  it('refuse des dimensions ou un nombre de pages invalides', () => {
    expect(sanitizeMeta(input({ width: 0 }), 'abcdefgh', 1)).toBeNull()
    expect(sanitizeMeta(input({ height: 1.5 }), 'abcdefgh', 1)).toBeNull()
    expect(sanitizeMeta(input({ pageCount: '2' }), 'abcdefgh', 1)).toBeNull()
    expect(sanitizeMeta(null, 'abcdefgh', 1)).toBeNull()
  })
  it('refuse une miniature qui n’est pas une image ou qui est démesurée', () => {
    expect(sanitizeMeta(input({ thumbnail: 'http://exemple.com/x.png' }), 'abcdefgh', 1)).toBeNull()
    expect(sanitizeMeta(input({ thumbnail: 'data:image/png;base64,' + 'A'.repeat(MAX_THUMBNAIL_CHARS) }), 'abcdefgh', 1)).toBeNull()
  })
})

describe('index', () => {
  it('addMeta met le plus récent en tête et remplace un identifiant existant', () => {
    const list = addMeta([meta('aaaaaaaa'), meta('bbbbbbbb')], meta('cccccccc'))
    expect(list.map((m) => m.id)).toEqual(['cccccccc', 'aaaaaaaa', 'bbbbbbbb'])
    expect(addMeta(list, meta('aaaaaaaa', { name: 'Renommé' })).map((m) => m.id)).toEqual(['aaaaaaaa', 'cccccccc', 'bbbbbbbb'])
  })
  it('removeMeta retire une entrée', () => {
    expect(removeMeta([meta('aaaaaaaa'), meta('bbbbbbbb')], 'aaaaaaaa').map((m) => m.id)).toEqual(['bbbbbbbb'])
  })
  it('parseTemplateIndex relit un index valide et ignore les entrées corrompues', () => {
    const good = meta('aaaaaaaa')
    const raw = JSON.stringify([good, { id: '../../x', createdAt: 1, ...input() }, { id: 'bbbbbbbb' }, null])
    expect(parseTemplateIndex(raw)).toEqual([good])
    expect(parseTemplateIndex('{pas du json')).toEqual([])
    expect(parseTemplateIndex('{"a":1}')).toEqual([])
  })
})
