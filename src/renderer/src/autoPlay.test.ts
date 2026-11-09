import { describe, expect, it } from 'vitest'
import { AUTO_CHOICES, AUTO_PAGES, pageAutoSeconds } from './autoPlay'
import type { TramePage } from './types'

const text = (words: number) => ({ id: 't', type: 'text', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, text: Array.from({ length: words }, (_, i) => 'mot' + i).join(' ') })
const page = (extra: Partial<TramePage> = {}, words = 0): TramePage => ({ id: 'p', background: '#fff', elements: words ? [text(words) as never] : [], ...extra })

describe('lecture automatique', () => {
  it('un délai fixe s\'applique à toutes les pages, quelle que soit leur durée', () => {
    expect(pageAutoSeconds({}, page({ seconds: 20 }), 5)).toBe(5)
    expect(pageAutoSeconds({}, page(), 10)).toBe(10)
  })
  it('« Selon les pages » suit la durée de chaque page', () => {
    expect(pageAutoSeconds({}, page({ seconds: 20 }), AUTO_PAGES)).toBe(20)
    expect(pageAutoSeconds({}, page({ seconds: 2.5 }), AUTO_PAGES)).toBe(2.5)
  })
  it('une page sans durée prend l\'estimation d\'après son texte', () => {
    expect(pageAutoSeconds({}, page({}, 20), AUTO_PAGES)).toBe(10) // 3 s + 20 mots × 0,35 s
    expect(pageAutoSeconds({}, page(), AUTO_PAGES)).toBe(3) // sans texte : 3 s
  })
  it('la voix off la plus longue l\'emporte, dans les deux modes', () => {
    const voices = { v: 'data:audio/webm;base64,AA==' }
    const spoken = page({ seconds: 4, voice: { id: 'v', duration: 12 } })
    expect(pageAutoSeconds({ voices }, spoken, AUTO_PAGES)).toBeCloseTo(12.7) // 0,3 + 12 + 0,4
    expect(pageAutoSeconds({ voices }, spoken, 5)).toBeCloseTo(12.7)
    expect(pageAutoSeconds({ voices }, { ...spoken, voice: { id: 'v', duration: 1 } }, AUTO_PAGES)).toBe(4) // voix courte : la durée de la page
  })
  it('le menu propose « Non », les délais fixes puis « Selon les pages »', () => {
    expect(AUTO_CHOICES[0]).toBe(0)
    expect(AUTO_CHOICES.at(-1)).toBe(AUTO_PAGES)
    expect(AUTO_CHOICES.filter((s) => s > 0)).toEqual([3, 5, 10, 15])
  })
})
