import { TEMPLATES, instantiate } from '@/templates'
import type { TrameDocument, TrameElement } from '@/types'

const SHAPES_STAR = 'M50 4 L61.8 36.5 L96.4 37.7 L69 58.8 L78.6 92 L50 72.6 L21.4 92 L31 58.8 L3.6 37.7 L38.2 36.5 Z'
const SHAPES_HEART = 'M50 90 C20 65 4 48 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 48 80 65 50 90 Z'

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
    }, {
      // page 2 : styles de texte (interlettrage, interligne, soulignement, barré, majuscules)
      id: 'p2', background: '#ffffff',
      elements: [
        text('s1', { x: 60, y: 60, width: 960, fontStyle: 'bold', fontSize: 56, letterSpacing: 14, text: 'Espacé large' }),
        text('s2', { x: 60, y: 160, width: 960, fontStyle: 'bold', fontSize: 64, letterSpacing: -3, text: 'Serré −3 px AVA To' }),
        text('s3', { x: 60, y: 270, width: 520, fontSize: 34, lineHeight: 1.7, text: "Un interligne généreux sur plusieurs lignes : le texte est enroulé par Konva puis repris tel quel dans le PDF." }),
        text('s4', { x: 620, y: 270, width: 400, fontSize: 34, lineHeight: 0.85, text: "Interligne serré, lignes presque collées entre elles pour voir l'écart." }),
        text('s5', { x: 60, y: 560, width: 460, fontSize: 52, underline: true, text: 'Souligné' }),
        text('s6', { x: 560, y: 560, width: 460, fontSize: 52, strike: true, text: 'Barré' }),
        text('s7', { x: 60, y: 660, width: 960, fontSize: 60, fontFamily: '"Playfair Display", serif', fontStyle: 'italic bold', underline: true, strike: true, align: 'center', fill: '#d6336c', text: 'Les deux à la fois' }),
        text('s8', { x: 60, y: 780, width: 960, fontSize: 40, uppercase: true, letterSpacing: 8, align: 'center', text: 'élégant été, ÇA se voit' }),
        text('s9', { x: 60, y: 880, width: 560, fontSize: 36, underline: true, lineHeight: 1.4, letterSpacing: 2, align: 'right', text: 'Souligné, espacé et\naligné à droite' }),
        text('s10', { x: 640, y: 880, width: 380, fontSize: 30, fontFamily: '"Lora", serif', uppercase: true, text: 'Majuscules Lora' })
      ]
    }, {
      // page 3 : contours (trait centré sur le bord, tirets, forme étirée, image, lettres, rotation, opacité)
      id: 'p3', background: '#fffdf5',
      elements: [
        { id: 'k1', type: 'rect', x: 60, y: 60, width: 300, height: 200, cornerRadius: 50, ...base, fill: '#e9e3ff', stroke: '#7c5cff', strokeWidth: 14 },
        { id: 'k2', type: 'ellipse', x: 420, y: 60, width: 300, height: 200, ...base, fill: '#ffe3d9', stroke: '#ff7a59', strokeWidth: 8, strokeDashed: true },
        { id: 'k3', type: 'path', x: 780, y: 50, width: 240, height: 130, path: SHAPES_STAR, ...base, fill: '#ffd166', stroke: '#1e1f24', strokeWidth: 6 },
        { id: 'k4', type: 'image', x: 60, y: 340, width: 240, height: 160, src: pngDataUrl(), ...base, stroke: '#d6336c', strokeWidth: 10 },
        { id: 'k5', type: 'path', x: 360, y: 320, width: 260, height: 260, path: SHAPES_HEART, ...base, fill: '#ff3d71', stroke: '#1e1f24', strokeWidth: 12, strokeDashed: true },
        { id: 'k6', type: 'rect', x: 740, y: 340, width: 240, height: 160, ...base, fill: '#ff0000', stroke: '#0000ff', strokeWidth: 20, opacity: 0.5, rotation: 15 },
        text('k7', { x: 60, y: 620, width: 960, fontStyle: 'bold', fontSize: 130, fill: '#ffd166', stroke: '#1e1f24', strokeWidth: 5, text: 'Contour' }),
        text('k8', { x: 60, y: 820, width: 960, fontSize: 60, fontFamily: '"Playfair Display", serif', fontStyle: 'italic', align: 'center', stroke: '#7c5cff', strokeWidth: 1.5, text: 'Lettres cernées, fines' })
      ]
    }, {
      // page 4 : dégradés (angles, radial, forme étirée, avec contour, avec opacité)
      id: 'p4', background: '#ffffff',
      elements: [
        { id: 'd1', type: 'rect', x: 60, y: 60, width: 300, height: 200, ...base, fill: '#000', gradient: { type: 'linear', from: '#7c5cff', to: '#38bdf8', angle: 90 } },
        { id: 'd2', type: 'rect', x: 400, y: 60, width: 300, height: 200, cornerRadius: 40, ...base, fill: '#000', gradient: { type: 'linear', from: '#ff3d71', to: '#ffd166', angle: 135 } },
        { id: 'd3', type: 'ellipse', x: 740, y: 60, width: 280, height: 200, ...base, fill: '#000', gradient: { type: 'radial', from: '#ffffff', to: '#0f172a', angle: 0 } },
        { id: 'd4', type: 'path', x: 60, y: 320, width: 360, height: 220, path: SHAPES_STAR, ...base, fill: '#000', gradient: { type: 'linear', from: '#fde047', to: '#ea580c', angle: 200 } },
        { id: 'd5', type: 'path', x: 460, y: 300, width: 260, height: 260, path: SHAPES_HEART, ...base, fill: '#000', gradient: { type: 'radial', from: '#fecdd3', to: '#be123c', angle: 0 } },
        { id: 'd6', type: 'rect', x: 760, y: 320, width: 260, height: 220, cornerRadius: 30, ...base, fill: '#000', gradient: { type: 'linear', from: '#34d399', to: '#065f46', angle: 0 }, stroke: '#1e1f24', strokeWidth: 8, strokeDashed: true },
        { id: 'd7', type: 'rect', x: 60, y: 620, width: 460, height: 300, ...base, fill: '#000', opacity: 0.55, rotation: -6, gradient: { type: 'linear', from: '#2563eb', to: '#db2777', angle: 45 } },
        { id: 'd8', type: 'ellipse', x: 560, y: 600, width: 220, height: 340, ...base, fill: '#000', gradient: { type: 'linear', from: '#f472b6', to: '#a78bfa', angle: 180 } },
        { id: 'd9', type: 'rect', x: 820, y: 620, width: 200, height: 300, ...base, fill: '#000', gradient: { type: 'radial', from: '#fff7ed', to: '#c2410c', angle: 0 } }
      ]
    }, {
      // page 5 : ombres et lueurs (le corps de l'élément reste vectoriel, l'ombre est une image placée dessous)
      id: 'p5', background: '#e7e9f5',
      elements: [
        { id: 'o1', type: 'rect', x: 70, y: 70, width: 260, height: 170, cornerRadius: 30, ...base, fill: '#ffffff', shadow: { color: '#000000', blur: 24, offsetX: 0, offsetY: 14, opacity: 0.35 } },
        { id: 'o2', type: 'ellipse', x: 400, y: 70, width: 260, height: 170, ...base, fill: '#7c5cff', shadow: { color: '#ffb703', blur: 40, offsetX: 0, offsetY: 0, opacity: 0.95 } },
        { id: 'o3', type: 'path', x: 740, y: 60, width: 260, height: 180, path: SHAPES_STAR, ...base, fill: '#ff3d71', shadow: { color: '#1e1f24', blur: 8, offsetX: 14, offsetY: 14, opacity: 0.6 } },
        text('o4', { x: 70, y: 310, width: 940, fontStyle: 'bold', fontSize: 96, fill: '#1e1f24', text: 'Ombre portée', shadow: { color: '#000000', blur: 12, offsetX: 6, offsetY: 8, opacity: 0.45 } }),
        text('o5', { x: 70, y: 450, width: 940, fontStyle: 'bold', fontSize: 96, fill: '#ffffff', text: 'Lueur douce', shadow: { color: '#7c5cff', blur: 28, offsetX: 0, offsetY: 0, opacity: 1 } }),
        { id: 'o6', type: 'image', x: 70, y: 610, width: 230, height: 150, src: pngDataUrl(), ...base, shadow: { color: '#000000', blur: 18, offsetX: 10, offsetY: 12, opacity: 0.5 } },
        { id: 'o7', type: 'rect', x: 400, y: 620, width: 220, height: 140, ...base, fill: '#38bdf8', rotation: 30, shadow: { color: '#000000', blur: 14, offsetX: 26, offsetY: 26, opacity: 0.5 } },
        { id: 'o8', type: 'rect', x: 740, y: 610, width: 240, height: 150, ...base, fill: '#34d399', shadow: { color: '#000000', blur: 0, offsetX: 16, offsetY: 16, opacity: 0.4 } },
        { id: 'o9', type: 'rect', x: 70, y: 830, width: 280, height: 160, ...base, fill: '#ffd166', stroke: '#1e1f24', strokeWidth: 8, shadow: { color: '#000000', blur: 16, offsetX: 8, offsetY: 12, opacity: 0.4 } },
        { id: 'o10', type: 'ellipse', x: 420, y: 830, width: 260, height: 160, ...base, fill: '#000', gradient: { type: 'linear', from: '#f472b6', to: '#6366f1', angle: 90 }, shadow: { color: '#000000', blur: 20, offsetX: 0, offsetY: 16, opacity: 0.4 } },
        { id: 'o11', type: 'rect', x: 780, y: 830, width: 230, height: 160, ...base, fill: '#ef4444', opacity: 0.6, shadow: { color: '#000000', blur: 14, offsetX: 10, offsetY: 10, opacity: 0.5 } },
        text('o12', { x: 70, y: 1010, width: 940, fontStyle: 'bold', fontSize: 52, fill: '#1e1f24', opacity: 0.5, text: 'Texte translucide', shadow: { color: '#000000', blur: 10, offsetX: 8, offsetY: 8, opacity: 0.8 } })
      ]
    }]
  }
}

export interface Case {
  name: string
  doc: TrameDocument
  /** textes qui doivent être extraits du PDF (sélectionnables) ; les autres sont des replis en image */
  expectText: string[]
  /**
   * Part maximale (en %) de pixels très différents, par page (défaut : 1). À régler juste au-dessus de la mesure réelle : un seuil
   * large laisserait passer une erreur localisée (un trait déformé ne change que ~1 % de la page).
   */
  maxBigPct?: number[]
  /** nombre de textes qui doivent retomber en image (et être signalés) : 0 pour tout document réel */
  expectFallbacks: number
}

export const cases = (): Case[] => [
  { name: 'mixte', doc: mixed(), expectText: ['Texte', 'vectoriel', 'BEBAS À DROITE', 'DEUX LIGNES', 'Lora gras italique tourné', 'Opacité 40 %', 'mono 0O1l', 'Souligné', 'Barré', 'Les deux à la fois', 'MAJUSCULES LORA', 'Un interligne généreux', 'Contour', 'Ombre portée', 'Lueur douce', 'Texte translucide'], expectFallbacks: 2, maxBigPct: [1.3, 1.6, 0.9, 0.3, 0.3] }, // mesuré : 0,92 / 1,24 / 0,55 / 0,00 / 0,08 %
  ...TEMPLATES.map((t): Case => ({
    name: t.id,
    doc: instantiate(t),
    expectFallbacks: 0, // un modèle intégré ne doit jamais dégrader son texte en image
    expectText: t.pages.flatMap((p) => p.elements.filter((e) => e.type === 'text' && e.text && e.text.length < 14).map((e) => e.text!))
  }))
]
