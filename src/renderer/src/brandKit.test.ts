import { describe, expect, it } from 'vitest'
import { FONTS } from '@/fonts'
import { MAX_COLORS, MAX_RECENT, addColor, addFont, addLogo, emptyKit, normalizeColor, parseBrandKit, pushRecentColor, removeColor, removeLogo } from '@/brandKit'

const logo = (id: string) => ({ id, name: id, src: 'data:image/png;base64,AAAA' })

describe('brandKit', () => {
  it('normalise les couleurs', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc')
    expect(normalizeColor(' #7C5CFF ')).toBe('#7c5cff')
    expect(normalizeColor('rouge')).toBeNull()
    expect(normalizeColor('#12345')).toBeNull()
    expect(normalizeColor(5)).toBeNull()
  })

  it('ajoute sans doublon, respecte la limite, ignore l\'invalide', () => {
    let k = addColor(emptyKit(), '#FF0000')
    k = addColor(k, '#ff0000')
    k = addColor(k, 'nope')
    expect(k.colors).toEqual(['#ff0000'])
    for (let i = 0; i < MAX_COLORS + 5; i++) k = addColor(k, `#${String(100000 + i)}`)
    expect(k.colors).toHaveLength(MAX_COLORS)
    expect(removeColor(k, '#ff0000').colors).not.toContain('#ff0000')
  })

  it('n\'accepte que les polices connues', () => {
    expect(addFont(emptyKit(), 'Comic Sans').fonts).toEqual([])
    expect(addFont(emptyKit(), FONTS[0].family).fonts).toEqual([FONTS[0].family])
    expect(addFont(addFont(emptyKit(), FONTS[0].family), FONTS[0].family).fonts).toHaveLength(1)
  })

  it('logos : images seulement, retrait par identifiant', () => {
    const k = addLogo(emptyKit(), logo('a'))
    expect(k.logos).toHaveLength(1)
    expect(addLogo(k, { id: 'b', name: 'b', src: 'https://exemple.fr/x.png' }).logos).toHaveLength(1)
    expect(removeLogo(k, 'a').logos).toEqual([])
  })

  it('lecture tolérante', () => {
    expect(parseBrandKit('pas du json')).toEqual(emptyKit())
    expect(parseBrandKit(null)).toEqual(emptyKit())
    const k = parseBrandKit(JSON.stringify({ colors: ['#ABC', 'x', '#abc', 4], fonts: [FONTS[1].family, 'Inconnue'], logos: [logo('a'), { id: 'z', src: 'http://x' }, null] }))
    expect(k).toEqual({ colors: ['#aabbcc'], fonts: [FONTS[1].family], logos: [logo('a')] })
  })

  it('couleurs récentes : en tête, sans doublon, bornées', () => {
    expect(pushRecentColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    expect(pushRecentColor([], 'x')).toEqual([])
    let l: string[] = []
    for (let i = 0; i < MAX_RECENT + 4; i++) l = pushRecentColor(l, `#${String(100000 + i)}`)
    expect(l).toHaveLength(MAX_RECENT)
    expect(l[0]).toBe(`#${100000 + MAX_RECENT + 3}`)
  })
})

import { MAX_KITS, MAX_TOTAL_LOGO_CHARS, activeKit, addKit, addLogoChecked, deleteKit, duplicateKit, newKit, parseKitFile, parseLibrary, renameKit, selectKit, serializeKitFile, serializeLibrary, uniqueName, updateActive, type BrandLibrary } from '@/brandKit'

describe('plusieurs kits', () => {
  const lib = (): BrandLibrary => ({ active: 'a', kits: [newKit('a', 'Client A'), newKit('b', 'Client B')] })

  it('reprend l\'ancien fichier d\'un seul kit comme premier kit', () => {
    const old = JSON.stringify({ colors: ['#FF0000', 'nope'], fonts: [FONTS[0].family], logos: [] })
    const l = parseLibrary(old, 'Mon kit')
    expect(l.kits).toHaveLength(1)
    expect(l.kits[0].name).toBe('Mon kit')
    expect(l.kits[0].colors).toEqual(['#ff0000'])
    expect(l.active).toBe(l.kits[0].id)
  })
  it('donne un kit vide quand le fichier est absent ou illisible', () => {
    for (const raw of [null, '', '{pas du json', '42', '[]']) {
      const l = parseLibrary(raw, 'Mon kit')
      expect(l.kits).toHaveLength(1)
      expect(activeKit(l).colors).toEqual([])
    }
  })
  it('relit ce qu\'il a écrit', () => {
    const l = updateActive(lib(), (k) => addColor(k, '#123456'))
    expect(parseLibrary(serializeLibrary(l), 'x')).toEqual(l)
  })
  it('écarte les kits invalides, les doublons d\'identifiant, et corrige le kit actif', () => {
    const raw = JSON.stringify({ version: 2, active: 'inconnu', kits: [{ id: 'a', name: 'A', colors: ['#fff'] }, { id: 'a', name: 'Bis' }, { name: 'sans id' }, 5, { id: 'c', name: '  ', colors: [] }] })
    const l = parseLibrary(raw, 'Défaut')
    expect(l.kits.map((k) => k.id)).toEqual(['a', 'c'])
    expect(l.kits[0].colors).toEqual(['#ffffff'])
    expect(l.kits[1].name).toBe('Défaut')
    expect(l.active).toBe('a')
  })
  it('limite le nombre de kits à la lecture', () => {
    const kits = Array.from({ length: MAX_KITS + 4 }, (_, i) => ({ id: `k${i}`, name: `K${i}` }))
    expect(parseLibrary(JSON.stringify({ version: 2, active: 'k0', kits }), 'x').kits).toHaveLength(MAX_KITS)
  })
  it('un changement ne touche que le kit actif', () => {
    const l = updateActive(lib(), (k) => addColor(k, '#aa0000'))
    expect(l.kits[0].colors).toEqual(['#aa0000'])
    expect(l.kits[1].colors).toEqual([])
    const same = lib()
    expect(updateActive(same, (k) => k)).toBe(same)
  })
  it('choisit le kit actif', () => {
    const l = selectKit(lib(), 'b')
    expect(activeKit(l).name).toBe('Client B')
    expect(selectKit(l, 'zzz')).toBe(l)
  })
  it('ajoute un kit (devenu actif) avec un nom libre, dans la limite', () => {
    let l = addKit(lib(), newKit('c', 'client a'))
    expect(l.active).toBe('c')
    expect(l.kits[2].name).toBe('client a (2)')
    while (l.kits.length < MAX_KITS) l = addKit(l, newKit(`x${l.kits.length}`, `N${l.kits.length}`))
    expect(addKit(l, newKit('de-trop', 'Trop'))).toBe(l)
  })
  it('renomme sans créer de doublon ni de nom vide', () => {
    expect(renameKit(lib(), 'a', 'Marque Z').kits[0].name).toBe('Marque Z')
    expect(renameKit(lib(), 'a', 'client b').kits[0].name).toBe('client b (2)')
    expect(renameKit(lib(), 'a', '   ').kits[0].name).toBe('Client A')
    const same = lib()
    expect(renameKit(same, 'a', 'Client A')).toBe(same)
  })
  it('duplique avec de nouveaux identifiants de logo', () => {
    let l = updateActive(lib(), (k) => addLogo(k, logo('l1')))
    l = duplicateKit(l, 'a', 'copie', 'Client A (copie)', () => 'nouveau')
    expect(l.active).toBe('copie')
    expect(l.kits[2].logos.map((x) => x.id)).toEqual(['nouveau'])
    expect(l.kits[0].logos.map((x) => x.id)).toEqual(['l1'])
  })
  it('supprime un kit, sauf le dernier, et choisit un kit actif voisin', () => {
    const l = deleteKit(selectKit(lib(), 'a'), 'a')
    expect(l.kits.map((k) => k.id)).toEqual(['b'])
    expect(l.active).toBe('b')
    expect(deleteKit(l, 'b')).toBe(l)
    expect(deleteKit(lib(), 'zzz').kits).toHaveLength(2)
    expect(deleteKit(lib(), 'b').active).toBe('a')
  })
  it('compte les noms libres', () => {
    expect(uniqueName(lib(), 'Neuf')).toBe('Neuf')
    expect(uniqueName(lib(), 'CLIENT A')).toBe('CLIENT A (2)')
  })
  it('refuse un logo quand le total de tous les kits dépasserait la limite', () => {
    const big = { id: 'g', name: 'g', src: `data:image/png;base64,${'A'.repeat(2_900_000)}` }
    let l: BrandLibrary | null = lib()
    let added = 0
    for (let i = 0; i < 20 && l; i++) {
      const next = addLogoChecked(l.kits.length ? selectKit(l, i % 2 ? 'a' : 'b') : l, { ...big, id: `g${i}` })
      if (next) added++
      l = next ?? l
      if (!next) break
    }
    expect(added).toBeLessThanOrEqual(Math.floor(MAX_TOTAL_LOGO_CHARS / big.src.length))
    expect(added).toBeGreaterThan(5)
  })
})

describe('fichier de kit', () => {
  it('fait l\'aller-retour avec le nom', () => {
    const kit = { ...newKit('a', 'Ma marque'), colors: ['#112233'], fonts: [FONTS[0].family], logos: [logo('x')] }
    const got = parseKitFile(serializeKitFile(kit))!
    expect(got.name).toBe('Ma marque')
    expect(got.kit).toEqual({ colors: ['#112233'], fonts: [FONTS[0].family], logos: [logo('x')] })
  })
  it('refuse ce qui n\'est pas un kit', () => {
    for (const raw of [null, '', 'xx', '{}', '{"colors":["#fff"]}', '{"trameKit":2}', '[]']) expect(parseKitFile(raw)).toBeNull()
  })
  it('nettoie le contenu comme à la lecture ordinaire', () => {
    const got = parseKitFile(JSON.stringify({ trameKit: 1, name: 5, colors: ['#FFF', 'rouge'], fonts: ['Comic Sans'], logos: [{ id: 'x', name: 'x', src: 'http://evil/x.png' }] }))!
    expect(got.kit).toEqual({ colors: ['#ffffff'], fonts: [], logos: [] })
    expect(got.name).toBe('')
  })
})
