import { describe, expect, it } from 'vitest'
import { DEFAULT_QR, MAX_QR_TEXT, QR_QUIET, qrContrastLow, qrElements, qrMatrix, qrPath, sanitizeQr } from './qr'
import type { QrSpec } from './types'

const spec = (over: Partial<QrSpec> = {}): QrSpec => ({ ...DEFAULT_QR, text: 'https://example.com', ...over })

describe('qrMatrix', () => {
  it('donne une grille carrée dont les trois coins portent un repère de position', () => {
    const m = qrMatrix('HELLO', 'M')!
    expect(m).toHaveLength(21) // version 1
    expect(m.every((row) => row.length === 21)).toBe(true)
    const finder = (r: number, c: number): boolean => [0, 6].every((i) => m[r][c + i] && m[r + 6][c + i] && m[r + i][c] && m[r + i][c + 6]) && m[r + 3][c + 3] && !m[r + 1][c + 1]
    expect(finder(0, 0) && finder(0, 14) && finder(14, 0)).toBe(true)
  })

  it('grandit avec le texte et avec la correction d\'erreurs', () => {
    const short = qrMatrix('abc', 'L')!.length
    expect(qrMatrix('a'.repeat(200), 'L')!.length).toBeGreaterThan(short)
    expect(qrMatrix('a'.repeat(100), 'H')!.length).toBeGreaterThan(qrMatrix('a'.repeat(100), 'L')!.length)
  })

  it('compte les octets UTF-8 (un accent en pèse deux)', () => {
    expect(qrMatrix('é'.repeat(600), 'H')).not.toBeNull() // 1 200 octets, limite 1 273
    expect(qrMatrix('é'.repeat(700), 'H')).toBeNull() // 1 400 octets
    expect(qrMatrix('été à Paris — 🙂', 'M')).not.toBeNull()
  })

  it('refuse un texte vide ou trop long', () => {
    expect(qrMatrix('', 'M')).toBeNull()
    expect(qrMatrix('a'.repeat(3000), 'L')).toBeNull()
  })
})

describe('qrPath', () => {
  /** relit les rectangles du chemin et en refait la grille */
  const decode = (d: string, n: number): boolean[][] => {
    const grid = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
    for (const m of d.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z/g)) {
      const [x0, y0, x1, , , y1] = m.slice(1).map(Number)
      for (let r = Math.round((y0 * n) / 100); r < Math.round((y1 * n) / 100); r++) for (let c = Math.round((x0 * n) / 100); c < Math.round((x1 * n) / 100); c++) grid[r][c] = true
    }
    return grid
  }

  it('redessine exactement les modules sombres, en rectangles de modules voisins', () => {
    const m = qrMatrix('https://example.com/une/adresse?avec=des&parametres=1', 'Q')!
    const d = qrPath(m)
    expect(decode(d, m.length)).toEqual(m)
    // une suite de modules voisins = un seul rectangle
    expect((d.match(/Z/g) ?? []).length).toBeLessThan(m.flat().filter(Boolean).length)
  })

  it('n\'emploie que des commandes absolues M, L, Z, dans le viewBox 100 × 100', () => {
    const d = qrPath(qrMatrix('x', 'L')!)
    expect(d.replace(/[MLZ\d. ]/g, '')).toBe('')
    expect(Math.max(...(d.match(/[\d.]+/g) ?? []).map(Number))).toBeLessThanOrEqual(100)
  })
})

describe('qrElements', () => {
  it('fabrique un fond qui porte la description et un chemin de modules, dans un même groupe', () => {
    const res = qrElements(spec(), { x: 10, y: 20, width: 300, height: 300 })!
    const [anchor, modules] = res.elements
    expect(anchor).toMatchObject({ type: 'rect', x: 10, y: 20, width: 300, height: 300, fill: '#ffffff', name: 'qr' })
    expect(anchor.qr).toEqual(spec())
    expect(modules).toMatchObject({ type: 'path', fill: '#000000' })
    expect(anchor.groupId).toBeTruthy()
    expect(modules.groupId).toBe(anchor.groupId)
  })

  it('laisse une marge claire de 4 modules tout autour', () => {
    const res = qrElements(spec(), { x: 0, y: 0, width: 330, height: 330 })!
    const [anchor, modules] = res.elements
    const cell = anchor.width / (res.modules + 2 * QR_QUIET)
    expect(modules.x).toBeCloseTo(QR_QUIET * cell)
    expect(modules.width).toBeCloseTo(res.modules * cell)
    expect(modules.x + modules.width).toBeCloseTo(anchor.width - QR_QUIET * cell)
  })

  it('reste carré : le côté est le plus petit des deux', () => {
    const [anchor, modules] = qrElements(spec(), { x: 0, y: 0, width: 400, height: 250 })!.elements
    expect([anchor.width, anchor.height]).toEqual([250, 250])
    expect(modules.width).toBeCloseTo(modules.height)
  })

  it('garde le groupe demandé et retourne null pour un contenu vide ou trop long', () => {
    expect(qrElements(spec(), { x: 0, y: 0, width: 100, height: 100 }, { groupId: 'g1' })!.elements.every((e) => e.groupId === 'g1')).toBe(true)
    expect(qrElements(spec({ text: '' }), { x: 0, y: 0, width: 100, height: 100 })).toBeNull()
    expect(qrElements(spec({ text: 'a'.repeat(3000) }), { x: 0, y: 0, width: 100, height: 100 })).toBeNull()
  })
})

describe('qrContrastLow', () => {
  it('accepte des modules sombres sur fond clair', () => {
    expect(qrContrastLow({ dark: '#000000', light: '#ffffff' })).toBe(false)
    expect(qrContrastLow({ dark: '#1a237e', light: '#fff8e1' })).toBe(false)
  })
  it('signale un faible contraste et un QR code inversé', () => {
    expect(qrContrastLow({ dark: '#aaaaaa', light: '#ffffff' })).toBe(true)
    expect(qrContrastLow({ dark: '#ffffff', light: '#000000' })).toBe(true)
  })
})

describe('sanitizeQr', () => {
  const clean = (qr: unknown): unknown => {
    const e: { qr?: unknown } = { qr }
    sanitizeQr(e)
    return e.qr
  }
  it('garde une description valide', () => {
    expect(clean(spec({ ecc: 'H', dark: '#112233' }))).toEqual(spec({ ecc: 'H', dark: '#112233' }))
  })
  it('remplace un niveau ou une couleur invalide par la valeur par défaut', () => {
    expect(clean({ text: 'x', ecc: 'Z', dark: 'rouge', light: 42 })).toEqual({ text: 'x', ...DEFAULT_QR })
  })
  it('retire une description sans texte, trop longue ou qui n\'est pas un objet', () => {
    for (const bad of [null, 'x', 5, {}, { text: '' }, { text: 3 }, { text: 'a'.repeat(MAX_QR_TEXT + 1) }]) expect(clean(bad)).toBeUndefined()
  })
  it('ne fait rien quand il n\'y a pas de description', () => {
    const e: { qr?: unknown } = {}
    sanitizeQr(e)
    expect('qr' in e).toBe(false)
  })
})
