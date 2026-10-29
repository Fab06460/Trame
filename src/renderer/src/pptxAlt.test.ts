import { describe, expect, it } from 'vitest'
import { stripPlaceholderAlt } from '@/pptxAlt'

describe('texte alternatif PowerPoint', () => {
  it('vide le nom de fichier mis par pptxgenjs mais garde un vrai texte alternatif', () => {
    const xml = '<p:cNvPr id="2" name="Image 0" descr="preencoded.png"><p:cNvPr id="3" name="Image 1" descr="Un phare au lever du jour">'
    expect(stripPlaceholderAlt(xml)).toBe('<p:cNvPr id="2" name="Image 0" descr=""><p:cNvPr id="3" name="Image 1" descr="Un phare au lever du jour">')
  })
  it('ne touche pas un texte alternatif qui contiendrait ce nom au milieu d’une phrase', () => {
    const xml = '<p:cNvPr descr="Capture preencoded.png de l\'écran">'
    expect(stripPlaceholderAlt(xml)).toBe(xml)
  })
})
