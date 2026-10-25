import { TEMPLATES, instantiate } from '@/templates'
import type { TrameDocument, TrameElement } from '@/types'

const base = { rotation: 0, opacity: 1, fill: '#1e1f24' }

const text = (id: string, over: Partial<TrameElement>): TrameElement =>
  ({
    id, type: 'text', x: 0, y: 0, width: 400, height: 80, fontSize: 48, fontFamily: '"Inter", sans-serif',
    fontStyle: 'normal', align: 'left', text: 'Texte', ...base, ...over
  }) as TrameElement

function pngDataUrl(): string {
  const c = document.createElement('canvas')
  c.width = 60
  c.height = 40
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 60, 40)
  grad.addColorStop(0, '#ff3d71')
  grad.addColorStop(1, '#38bdf8')
  g.fillStyle = grad
  g.fillRect(0, 0, 60, 40)
  g.fillStyle = '#fff'
  g.fillRect(10, 10, 20, 10)
  return c.toDataURL('image/png')
}

/** Un document qui exerce tous les cas : formes, rotation, opacité, crénage, alignements, repli en image, image. */
function mixed(): TrameDocument {
  return {
    version: 2, name: 'Mixte', width: 1080, height: 1080,
    pages: [{
      id: 'p', background: '#fff4e8',
      elements: [
        { id: 'r', type: 'rect', x: 60, y: 60, width: 300, height: 180, cornerRadius: 40, ...base, fill: '#7c5cff', opacity: 0.6, rotation: 15 },
        { id: 'e', type: 'ellipse', x: 420, y: 60, width: 220, height: 140, ...base, fill: '#ff7a59' },
        { id: 's', type: 'path', x: 700, y: 60, width: 200, height: 160, path: 'M50 4 L61.8 36.5 L96.4 37.7 L69 58.8 L78.6 92 L50 72.6 L21.4 92 L31 58.8 L3.6 37.7 L38.2 36.5 Z', ...base, fill: '#ffb703', rotation: -10 },
        text('t1', { x: 60, y: 300, fontStyle: 'bold', fontSize: 72, text: 'Texte vectoriel AVA fi' }),
        text('t2', { x: 60, y: 520, width: 500, fontFamily: '"Playfair Display", serif', fontStyle: 'italic', align: 'center', fontSize: 44, text: "Le design, c'est l'intelligence rendue visible. Fi fl AV To" }),
        text('t3', { x: 540, y: 460, width: 480, fontFamily: '"Bebas Neue", sans-serif', align: 'right', fontSize: 90, text: 'BEBAS À DROITE\nDEUX LIGNES' }),
        text('t4', { x: 120, y: 800, width: 420, fontFamily: '"Lora", serif', fontStyle: 'italic bold', fontSize: 40, rotation: -25, fill: '#d6336c', text: 'Lora gras italique tourné' }),
        text('t5', { x: 600, y: 700, width: 420, fontSize: 36, opacity: 0.4, fontFamily: '"Montserrat", sans-serif', fontStyle: 'bold', text: 'Opacité 40 %' }),
        text('t6', { x: 60, y: 920, width: 460, fontFamily: 'Helvetica Neue, Arial, sans-serif', fontSize: 40, text: 'Police système → repli image' }),
        text('t7', { x: 560, y: 920, width: 460, fontSize: 40, fill: '#0a7a3d', text: 'Glyphe absent ✓ → repli' }),
        text('t8', { x: 600, y: 780, width: 420, fontSize: 30, fontFamily: '"JetBrains Mono", monospace', text: 'mono 0O1l {x}' }),
        { id: 'i', type: 'image', x: 820, y: 280, width: 180, height: 120, src: pngDataUrl(), ...base, rotation: 8 }
      ]
    }]
  }
}

export interface Case {
  name: string
  doc: TrameDocument
  /** textes qui doivent être extraits du PDF (sélectionnables) ; les autres sont des replis en image */
  expectText: string[]
}

export const cases = (): Case[] => [
  { name: 'mixte', doc: mixed(), expectText: ['Texte', 'vectoriel', 'BEBAS À DROITE', 'DEUX LIGNES', 'Lora gras italique tourné', 'Opacité 40 %', 'mono 0O1l'] },
  ...TEMPLATES.map((t): Case => ({
    name: t.id,
    doc: instantiate(t),
    expectText: t.pages.flatMap((p) => p.elements.filter((e) => e.type === 'text' && e.text && e.text.length < 14).map((e) => e.text!))
  }))
]
