import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fontkit, type FontkitFont } from '@/fontkit'
import { nodesFromPath } from '@/pen'
import { lineOutline, mergedOutline } from './textOutline'

const font = fontkit.create(readFileSync('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff')) as FontkitFont

describe('lineOutline', () => {
  it('donne des contours fermés en commandes absolues', () => {
    const d = lineOutline(font, 'Hi', 10, 100, 50, 0)
    expect(d).toMatch(/^[MLCZ0-9 .\-]+$/)
    expect((d.match(/Z/g) ?? []).length).toBeGreaterThanOrEqual(2) // H : un contour ; i : le point et le fût
    expect(d.startsWith('M')).toBe(true)
  })
  it('pose la lettre sur la ligne de base et à partir de x', () => {
    const d = lineOutline(font, 'H', 10, 100, 100, 0)
    const nodes = nodesFromPath(d)!.nodes
    const xs = nodes.map((p) => p.x)
    const ys = nodes.map((p) => p.y)
    expect(Math.min(...xs)).toBeGreaterThan(10) // l'approche gauche de la lettre
    expect(Math.max(...ys)).toBeCloseTo(100, 0) // le pied du H est sur la ligne de base
    expect(Math.min(...ys)).toBeLessThan(100 - 60) // sa hauteur de capitale dépasse 0,6 em
  })
  it('suit la taille de la police', () => {
    const height = (size: number): number => {
      const ys = nodesFromPath(lineOutline(font, 'H', 0, 200, size, 0))!.nodes.map((p) => p.y)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(height(100) / height(50)).toBeCloseTo(2, 1)
  })
  it('un interlettrage écarte les lettres', () => {
    const right = (spacing: number): number => Math.max(...[...lineOutline(font, 'HH', 0, 100, 50, spacing).matchAll(/[ML](-?[\d.]+) /g)].map((m) => +m[1]))
    expect(right(20)).toBeGreaterThan(right(0) + 15)
  })
  it('rend une chaîne vide pour un texte vide ou une espace', () => {
    expect(lineOutline(font, '', 0, 0, 50, 0)).toBe('')
    expect(lineOutline(font, ' ', 0, 0, 50, 0)).toBe('')
  })
})

describe('mergedOutline', () => {
  it('garde le trou d\'un « o » (deux contours)', async () => {
    const c = (await mergedOutline(lineOutline(font, 'o', 0, 100, 100, 0)))!
    expect((c.path.match(/M/g) ?? []).length).toBe(2)
    expect(c.width).toBeGreaterThan(30)
    expect(c.height).toBeGreaterThan(40)
  })
  it('fond deux contours qui se recouvrent en un seul', async () => {
    const c = (await mergedOutline('M0 0L100 0L100 100L0 100ZM50 50L150 50L150 150L50 150Z'))!
    expect((c.path.match(/M/g) ?? []).length).toBe(1)
    expect([c.x, c.y, c.width, c.height]).toEqual([0, 0, 150, 150])
  })
  it('n\'invente rien pour un texte vide', async () => {
    expect(await mergedOutline('')).toBeNull()
  })
})
