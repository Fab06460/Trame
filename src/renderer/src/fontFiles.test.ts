import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { customId, groupFamilies, parseFontFile, sniffFormat, uniqueName, MAX_FONT_FILE_BYTES } from '@/fontFiles'

const lib = (n: string) => new Uint8Array(readFileSync(`node_modules/pdfjs-dist/standard_fonts/LiberationSans-${n}.ttf`))
const parsed = (n: string) => {
  const bytes = lib(n)
  const r = parseFontFile(`LiberationSans-${n}.ttf`, bytes)
  if (!r.ok) throw new Error(r.reason)
  return { bytes, info: r.info }
}

describe('fontFiles', () => {
  it('reconnaît le format par la signature', () => {
    expect(sniffFormat(lib('Regular'))).toBe('ttf')
    expect(sniffFormat(new Uint8Array(readFileSync('node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2')))).toBe('woff2')
    expect(sniffFormat(new Uint8Array(readFileSync('node_modules/@fontsource/lora/files/lora-latin-400-normal.woff')))).toBe('woff')
    expect(sniffFormat(new TextEncoder().encode('<!doctype html><html></html>'))).toBeNull()
    expect(sniffFormat(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('collection')
  })

  it('lit famille, graisse et style d\'un TTF', () => {
    expect(parsed('Regular').info).toMatchObject({ family: 'Liberation Sans', weight: 400, italic: false, variable: false, mono: false, format: 'ttf' })
    expect(parsed('BoldItalic').info).toMatchObject({ family: 'Liberation Sans', weight: 700, italic: true })
  })

  it('lit un WOFF2 et un WOFF', () => {
    for (const ext of ['woff2', 'woff']) {
      const r = parseFontFile(`lora.${ext}`, new Uint8Array(readFileSync(`node_modules/@fontsource/lora/files/lora-latin-700-normal.${ext}`)))
      expect(r.ok && r.info).toMatchObject({ family: 'Lora', weight: 700, italic: false, format: ext })
    }
  })

  it('refuse proprement : texte, trop gros, fichier tronqué, collection', () => {
    const bad = (bytes: Uint8Array) => { const r = parseFontFile('x', bytes); return r.ok ? 'ok' : r.reason }
    expect(bad(new TextEncoder().encode('ceci est du texte, pas une police'))).toContain('pas un fichier de police')
    expect(bad(new Uint8Array(MAX_FONT_FILE_BYTES + 1))).toContain('trop volumineux')
    expect(bad(lib('Regular').slice(0, 300))).toContain('illisible')
    expect(bad(new Uint8Array([0x74, 0x74, 0x63, 0x66, ...new Array(20).fill(0)]))).toContain('collection')
  })

  it('regroupe les 4 fichiers d\'une famille en variantes', () => {
    const g = groupFamilies(['Regular', 'Bold', 'Italic', 'BoldItalic'].map(parsed))
    expect(g).toHaveLength(1)
    expect(g[0].family).toBe('Liberation Sans')
    expect(Object.keys(g[0].variants).sort()).toEqual(['400', '400-italic', '700', '700-italic'])
    expect(g[0].variants['700']!.file).toBe('LiberationSans-Bold.ttf')
    expect(g[0].variants['400-italic']!.file).toBe('LiberationSans-Italic.ttf')
    expect(g[0].notes).toEqual([])
  })

  it('une seule graisse : variante normale seulement', () => expect(Object.keys(groupFamilies([parsed('Regular')])[0].variants)).toEqual(['400']))

  it('un fichier gras seul sert de graisse normale ; une graisse en double est signalée', () => {
    expect(Object.keys(groupFamilies([parsed('Bold')])[0].variants)).toEqual(['400'])
    const dup = parsed('Regular')
    const twin = { bytes: dup.bytes, info: { ...dup.info, file: 'copie.ttf', weight: 300 } }
    const g = groupFamilies([dup, twin])[0]
    expect(g.variants['400']!.file).toBe('LiberationSans-Regular.ttf') // la plus proche de 400
    expect(g.notes.join()).toContain('copie.ttf : graisse 300 ignorée')
  })

  it('noms uniques et identifiants', () => {
    expect(uniqueName('Zeta', new Set(['Inter']))).toBe('Zeta')
    expect(uniqueName('Inter', new Set(['Inter']))).toBe('Inter (perso)')
    expect(uniqueName('Inter', new Set(['Inter', 'Inter (perso)']))).toBe('Inter (perso 2)')
    expect(customId('Ma Police Éclatée!')).toBe('perso-ma-police-eclatee')
    expect(customId('***')).toBe('perso-police')
  })
})
