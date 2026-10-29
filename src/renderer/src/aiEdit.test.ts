import { describe, expect, it } from 'vitest'
import { nextToBox } from '@/aiEdit'

describe('image retouchée posée à côté de l’originale', () => {
  const source = { x: 100, y: 50, width: 400, height: 200 }
  it('garde la zone de l’original et les proportions du résultat, décalée de 24 px', () => {
    expect(nextToBox(source, 1024, 512)).toEqual({ x: 124, y: 74, width: 400, height: 200 })
    const sq = nextToBox(source, 1000, 1000)
    expect(sq.width).toBe(200)
    expect(sq.height).toBe(200)
    const tall = nextToBox(source, 500, 1000)
    expect(tall).toMatchObject({ width: 100, height: 200 })
  })
})
