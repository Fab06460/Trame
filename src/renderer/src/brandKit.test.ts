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
