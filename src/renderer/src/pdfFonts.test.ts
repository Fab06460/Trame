import { describe, expect, it } from 'vitest'
import { resolveFont } from '@/pdfFonts'
import { FONTS } from '@/fonts'

describe('resolveFont', () => {
  it('retrouve la police embarquée à partir de la valeur stockée dans le document', () => {
    const r = resolveFont('"Inter", sans-serif', 'normal')!
    expect(r.def.name).toBe('Inter')
    expect(r.variant).toBe('400')
    expect(r.file).toBe('inter-latin-400-normal.woff')
  })

  it('combine gras et italique', () => {
    expect(resolveFont('"Lora", serif', 'bold')!.file).toBe('lora-latin-700-normal.woff')
    expect(resolveFont('"Lora", serif', 'italic')!.file).toBe('lora-latin-400-italic.woff')
    expect(resolveFont('"Lora", serif', 'italic bold')!.file).toBe('lora-latin-700-italic.woff')
    expect(resolveFont('"Lora", serif', 'bold italic')!.file).toBe('lora-latin-700-italic.woff')
  })

  it('gère les noms de paquet à tiret ou en deux mots', () => {
    expect(resolveFont('"Playfair Display", serif', 'normal')!.file).toBe('playfair-display-latin-400-normal.woff')
    expect(resolveFont('"Bebas Neue", sans-serif', 'normal')!.file).toBe('bebas-neue-latin-400-normal.woff')
    expect(resolveFont('"JetBrains Mono", monospace', 'bold')!.file).toBe('jetbrains-mono-latin-700-normal.woff')
  })

  it('refuse (→ rendu en image) les polices système et inconnues', () => {
    expect(resolveFont('Helvetica Neue, Arial, sans-serif', 'normal')).toBeNull()
    expect(resolveFont('Comic Sans MS', 'normal')).toBeNull()
    expect(resolveFont(undefined, undefined)).toBeNull()
  })

  it('refuse une variante que la famille ne possède pas (le navigateur la simulerait, pas le PDF)', () => {
    expect(resolveFont('"Bebas Neue", sans-serif', 'bold')).toBeNull()
    expect(resolveFont('"Pacifico", cursive', 'italic')).toBeNull()
    expect(resolveFont('"Oswald", sans-serif', 'italic')).toBeNull()
  })

  it('chaque variante annoncée par le catalogue se résout vers un fichier', () => {
    for (const def of FONTS)
      for (const variant of def.variants) {
        const style = `${variant.includes('italic') ? 'italic ' : ''}${variant.startsWith('700') ? 'bold' : ''}`.trim() || 'normal'
        expect(resolveFont(def.family, style)?.variant, `${def.name} ${variant}`).toBe(variant)
      }
  })
})
