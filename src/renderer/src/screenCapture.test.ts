import { describe, expect, it } from 'vitest'
import { CAPTURE_MAX_SIDE, captureSize, clockLabel, zoneBetween } from './screenCapture'

describe('captureSize', () => {
  it('garde un petit écran tel quel, en nombres pairs', () => {
    expect(captureSize(1280, 720)).toEqual({ width: 1280, height: 720 })
    expect(captureSize(1001, 667)).toEqual({ width: 1002, height: 668 })
  })
  it('ramène un grand écran au plus grand côté autorisé en gardant les proportions', () => {
    const s = captureSize(2880, 1800)
    expect(s.width).toBe(CAPTURE_MAX_SIDE)
    expect(s.height).toBe(1200)
    expect(captureSize(1800, 2880)).toEqual({ width: 1200, height: 1920 })
  })
  it('ne tombe jamais sous 2 px', () => {
    expect(captureSize(0, 0)).toEqual({ width: 2, height: 2 })
  })
})

describe('clockLabel', () => {
  it('affiche minutes et secondes', () => {
    expect(clockLabel(0)).toBe('0:00')
    expect(clockLabel(65.9)).toBe('1:05')
    expect(clockLabel(600)).toBe('10:00')
    expect(clockLabel(-3)).toBe('0:00')
  })
})

describe('zoneBetween', () => {
  it('tire un rectangle dans n\'importe quel sens', () => {
    expect(zoneBetween({ x: 10, y: 20 }, { x: 110, y: 70 }, 500, 400)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(zoneBetween({ x: 110, y: 70 }, { x: 10, y: 20 }, 500, 400)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })
  it('reste dans l\'image', () => {
    expect(zoneBetween({ x: -50, y: -50 }, { x: 900, y: 900 }, 500, 400)).toEqual({ x: 0, y: 0, width: 500, height: 400 })
  })
  it('ignore un simple clic ou une zone trop fine', () => {
    expect(zoneBetween({ x: 10, y: 10 }, { x: 12, y: 12 }, 500, 400)).toBeNull()
    expect(zoneBetween({ x: 10, y: 10 }, { x: 300, y: 12 }, 500, 400)).toBeNull()
  })
})
