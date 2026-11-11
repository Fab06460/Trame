import { describe, expect, it } from 'vitest'
import { cleanOcrText } from './text'
import { MAX_SIDE, MIN_SIDE, ocrScale, sourceRect } from './prepare'
import { placeText } from './place'
import { languageForLocale } from './languages'

describe('nettoyage du texte reconnu', () => {
  it('recolle les lignes d\'un paragraphe et garde les paragraphes', () => {
    expect(cleanOcrText('La photosynthèse est le\nprocessus par lequel les plantes\n\nSeconde idée\nsur deux lignes\n')).toBe('La photosynthèse est le processus par lequel les plantes\n\nSeconde idée sur deux lignes')
  })
  it('rejoint les mots coupés en fin de ligne (trait d\'union + minuscule seulement)', () => {
    expect(cleanOcrText('une exem-\nple simple')).toBe('une exemple simple')
    expect(cleanOcrText('porte-\nMonnaie')).toBe('porte- Monnaie')
    expect(cleanOcrText('a priori -\nb')).toBe('a priori - b')
  })
  it('garde les retours à la ligne à la demande', () => {
    expect(cleanOcrText('- un\n- deux\n\n- trois', true)).toBe('- un\n- deux\n\n- trois')
  })
  it('espaces, lignes vides multiples et caractères de contrôle', () => {
    expect(cleanOcrText('  a   b  \r\n\r\n\r\n\r\n c\u000c\u0007  ')).toBe('a b\n\nc')
    expect(cleanOcrText('')).toBe('')
    expect(cleanOcrText('\n \n')).toBe('')
  })
})

describe('préparation de l\'image', () => {
  it('petite image agrandie (×2 au plus), grande réduite, taille moyenne intacte', () => {
    expect(ocrScale(400, 300)).toBe(2)
    expect(ocrScale(1000, 800)).toBe(MIN_SIDE / 1000)
    expect(ocrScale(2000, 1000)).toBe(1)
    expect(ocrScale(6000, 4000)).toBe(MAX_SIDE / 6000)
    expect(ocrScale(0, 0)).toBe(1)
  })
  it('zone lue : l\'image entière ou le recadrage borné à l\'image', () => {
    expect(sourceRect({ width: 800, height: 600 })).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    expect(sourceRect({ width: 800, height: 600 }, { x: 100, y: 50, width: 300, height: 200 })).toEqual({ x: 100, y: 50, width: 300, height: 200 })
    expect(sourceRect({ width: 800, height: 600 }, { x: 700, y: 500, width: 900, height: 900 })).toEqual({ x: 700, y: 500, width: 100, height: 100 })
    expect(sourceRect({ width: 800, height: 600 }, { x: -50, y: -5, width: 10, height: 0 })).toEqual({ x: 0, y: 0, width: 10, height: 1 })
  })
})

describe('placement du texte reconnu', () => {
  const page = { width: 1920, height: 1080 }
  it('à droite de l\'image quand il y a la place, à la hauteur de l\'image', () => {
    const p = placeText({ x: 100, y: 200, width: 600, height: 400 }, page, 'Bonjour le monde')
    expect(p.x).toBe(100 + 600 + 58)
    expect(p.y).toBe(200)
    expect(p.width).toBeLessThanOrEqual(960)
    expect(p.x + p.width).toBeLessThanOrEqual(1920 - 58)
    expect(p.fontSize).toBe(30)
  })
  it('dessous quand l\'image prend toute la largeur', () => {
    const p = placeText({ x: 100, y: 100, width: 1700, height: 400 }, page, 'Bonjour')
    expect(p.y).toBe(100 + 400 + 58)
    expect(p.x).toBe(100)
  })
  it('sur toute la page quand il n\'y a de place ni à droite ni dessous', () => {
    const p = placeText({ x: 0, y: 0, width: 1920, height: 1080 }, page, 'Bonjour')
    expect([p.x, p.y, p.width]).toEqual([58, 58, 1920 - 116])
  })
  it('un long texte rétrécit pour tenir dans la place, sans dépasser la page', () => {
    const long = 'mot '.repeat(600)
    const p = placeText({ x: 100, y: 200, width: 600, height: 400 }, page, long)
    expect(p.fontSize).toBeLessThan(30)
    expect(p.y + p.height).toBeLessThanOrEqual(1080 - 58)
  })
})

describe('langue de reconnaissance', () => {
  it('suit la langue de l\'interface, l\'anglais par défaut', () => {
    expect(languageForLocale('fr')).toBe('fra')
    expect(languageForLocale('de')).toBe('deu')
    expect(languageForLocale('es-MX')).toBe('spa')
    expect(languageForLocale('ja')).toBe('eng')
  })
})
