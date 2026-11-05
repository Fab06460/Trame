import { describe, expect, it } from 'vitest'
import type { FontDef } from './fonts'
import { fontGroups } from './fontPicker'

const def = (name: string, group: string): FontDef => ({ name, family: `"${name}", serif`, group, slug: name.toLowerCase(), variants: ['400'] })
const fonts = [def('Inter', 'sans'), def('Lora', 'serif'), def('Montserrat', 'sans'), def('Pacifico', 'handwriting'), def('Écriture', 'handwriting')]

describe('fontGroups', () => {
  it('garde les groupes dans l\'ordre de la liste', () => {
    expect(fontGroups(fonts, [], '').map((g) => g.id)).toEqual(['sans', 'serif', 'handwriting'])
  })
  it('place les polices du kit en tête, une seule fois', () => {
    const groups = fontGroups(fonts, [fonts[2].family], '')
    expect(groups[0]).toEqual({ id: 'brand', fonts: [fonts[2]] })
    expect(groups.flatMap((g) => g.fonts).filter((f) => f.name === 'Montserrat')).toHaveLength(1)
    expect(groups.find((g) => g.id === 'sans')?.fonts.map((f) => f.name)).toEqual(['Inter'])
  })
  it('filtre sur le nom sans tenir compte de la casse ni des accents', () => {
    expect(fontGroups(fonts, [], ' ECRIT ').flatMap((g) => g.fonts.map((f) => f.name))).toEqual(['Écriture'])
    expect(fontGroups(fonts, [], 'o').flatMap((g) => g.fonts.map((f) => f.name))).toEqual(['Lora', 'Montserrat', 'Pacifico'])
  })
  it('supprime les groupes vides, et ne renvoie rien sans résultat', () => {
    expect(fontGroups(fonts, [fonts[0].family], 'pacif').map((g) => g.id)).toEqual(['handwriting'])
    expect(fontGroups(fonts, [], 'zzz')).toEqual([])
  })
})
