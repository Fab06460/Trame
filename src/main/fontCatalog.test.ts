import { describe, expect, it } from 'vitest'
import { cssFamily, fontFileUrl, isSafeId, isWoff2, parseCatalog, variantsOf } from './fontCatalog'

const font = (over: Record<string, unknown> = {}) => ({ id: 'abeezee', family: 'ABeeZee', subsets: ['latin', 'latin-ext'], weights: [400], styles: ['italic', 'normal'], category: 'sans-serif', license: 'OFL-1.1', ...over })

describe('fontCatalog', () => {
  it('variantes gérées par Trame', () => {
    expect(variantsOf([400], ['normal', 'italic'])).toEqual(['400', '400-italic'])
    expect(variantsOf([300, 400, 500, 700, 900], ['normal'])).toEqual(['400', '700'])
    expect(variantsOf([700], ['normal'])).toEqual(['700'])
    expect(variantsOf([100, 200], ['normal'])).toEqual([])
  })

  it('lecture tolérante : polices libres avec latin et graisse normale', () => {
    const r = parseCatalog([font(), font({ id: 'x', family: 'Pas libre', license: 'proprietary' }), font({ id: 'y', family: 'Sans latin', subsets: ['cyrillic'] }), font({ id: 'z', family: 'Fine', weights: [200] }), null, 'x', font({ id: 'Bad Id!' }), font({ id: 'q', family: 'Injec"tion' }), font({ id: 'm', family: 'Mono', category: 'monospace', license: 'Apache-2.0' })])
    expect(r.map((f) => f.id)).toEqual(['abeezee', 'm'])
    expect(r[0]).toMatchObject({ name: 'ABeeZee', category: 'sans-serif', license: 'OFL-1.1', variants: ['400', '400-italic'] })
    expect(parseCatalog('oops')).toEqual([])
    expect(parseCatalog({})).toEqual([])
  })

  it('catégorie inconnue : sans empattement', () => expect(parseCatalog([font({ category: 'wat' })])[0].category).toBe('sans-serif'))

  it('adresses de fichiers (même nomenclature que @fontsource)', () => {
    expect(fontFileUrl('https://cdn.jsdelivr.net/', 'abeezee', '400')).toBe('https://cdn.jsdelivr.net/fontsource/fonts/abeezee@latest/latin-400-normal.woff2')
    expect(fontFileUrl('https://cdn.test', 'lora', '700-italic')).toBe('https://cdn.test/fontsource/fonts/lora@latest/latin-700-italic.woff2')
  })

  it('identifiants sûrs', () => {
    for (const ok of ['inter', 'abeezee', 'open-sans', '42dot-sans']) expect(isSafeId(ok)).toBe(true)
    for (const bad of ['../etc', 'A', '', 'a/b', 'a b', 4, undefined, '-x', 'a'.repeat(100)]) expect(isSafeId(bad)).toBe(false)
  })

  it('famille CSS', () => {
    expect(cssFamily('Lora', 'serif')).toBe('"Lora", serif')
    expect(cssFamily('Caveat', 'handwriting')).toBe('"Caveat", cursive')
    expect(cssFamily('Bebas Neue', 'display')).toBe('"Bebas Neue", sans-serif')
    expect(cssFamily('JetBrains Mono', 'monospace')).toBe('"JetBrains Mono", monospace')
  })

  it('reconnaît un fichier WOFF2', () => {
    expect(isWoff2(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1]))).toBe(true)
    expect(isWoff2(new TextEncoder().encode('<!doctype html>'))).toBe(false)
    expect(isWoff2(new Uint8Array([]))).toBe(false)
  })
})
