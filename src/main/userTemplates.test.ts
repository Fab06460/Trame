import { describe, expect, it } from 'vitest'
import {
  MAX_NAME, MAX_THUMBNAIL_CHARS, addHidden, addMeta, isBuiltinId, isValidId, normalizeName, parseHidden, parseTemplateIndex,
  removeMeta, renameMeta, replaceMeta, sanitizeMeta, visibleBuiltins, type TemplateMeta
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

describe('basedOn (version personnalisée d’un modèle intégré)', () => {
  it('est conservé quand il est valide, ignoré sinon', () => {
    expect(sanitizeMeta(input({ basedOn: 'story-new' }), 'abcdefgh', 1)?.basedOn).toBe('story-new')
    expect(sanitizeMeta(input({ basedOn: '../etc' }), 'abcdefgh', 1)).not.toHaveProperty('basedOn')
    expect(sanitizeMeta(input({ basedOn: 42 }), 'abcdefgh', 1)).not.toHaveProperty('basedOn')
    expect(sanitizeMeta(input(), 'abcdefgh', 1)).not.toHaveProperty('basedOn')
  })
  it('isBuiltinId', () => {
    expect(isBuiltinId('promo')).toBe(true)
    expect(isBuiltinId('story-new')).toBe(true)
    for (const bad of ['', 'Promo', 'a/b', '..', 'x'.repeat(41), 7, null]) expect(isBuiltinId(bad)).toBe(false)
  })
  it('survit à la relecture de l’index', () => {
    const m = sanitizeMeta(input({ basedOn: 'deck' }), 'abcdefgh', 5)!
    expect(parseTemplateIndex(JSON.stringify([m]))[0].basedOn).toBe('deck')
  })
})

describe('renameMeta / replaceMeta', () => {
  it('renomme en normalisant le nom, sans toucher aux autres', () => {
    const list = [meta('aaaaaaaa'), meta('bbbbbbbb')]
    const out = renameMeta(list, 'bbbbbbbb', '  Nouveau   nom ')
    expect(out.map((m) => m.name)).toEqual(['Mon modèle', 'Nouveau nom'])
    expect(renameMeta(list, 'bbbbbbbb', '   ')[1].name).toBe('Sans titre')
    expect(renameMeta(list, 'inconnu00', 'x')).toEqual(list)
  })

  it('remplacer garde l’identifiant, la date de création et le modèle intégré remplacé, et passe en tête', () => {
    const old = meta('bbbbbbbb', { createdAt: 7, basedOn: 'promo' })
    const out = replaceMeta([meta('aaaaaaaa'), old], 'bbbbbbbb', input({ name: 'Version 2', pageCount: 3 }))!
    expect(out[0]).toMatchObject({ id: 'bbbbbbbb', createdAt: 7, name: 'Version 2', pageCount: 3, basedOn: 'promo' })
    expect(out).toHaveLength(2)
  })

  it('remplacer un modèle inconnu ou avec des métadonnées invalides échoue', () => {
    expect(replaceMeta([meta('aaaaaaaa')], 'zzzzzzzz', input())).toBeNull()
    expect(replaceMeta([meta('aaaaaaaa')], 'aaaaaaaa', input({ width: 0 }))).toBeNull()
  })
})

describe('modèles intégrés masqués', () => {
  it('parseHidden est tolérant et ne garde que des identifiants sûrs, sans doublon', () => {
    expect(parseHidden('["promo","promo","../x","deck"]')).toEqual(['promo', 'deck'])
    expect(parseHidden('{pas du json')).toEqual([])
    expect(parseHidden('{"a":1}')).toEqual([])
  })
  it('addHidden ne duplique pas', () => {
    expect(addHidden(['promo'], 'promo')).toEqual(['promo'])
    expect(addHidden(['promo'], 'deck')).toEqual(['promo', 'deck'])
  })
  it('visibleBuiltins retire les masqués et ceux remplacés par une version personnalisée', () => {
    const builtins = [{ id: 'promo' }, { id: 'quote' }, { id: 'deck' }]
    expect(visibleBuiltins(builtins, [], []).map((b) => b.id)).toEqual(['promo', 'quote', 'deck'])
    expect(visibleBuiltins(builtins, ['quote'], []).map((b) => b.id)).toEqual(['promo', 'deck'])
    expect(visibleBuiltins(builtins, [], [{ basedOn: 'deck' }, {}]).map((b) => b.id)).toEqual(['promo', 'quote'])
    expect(visibleBuiltins(builtins, ['promo'], [{ basedOn: 'promo' }]).map((b) => b.id)).toEqual(['quote', 'deck'])
  })
})
