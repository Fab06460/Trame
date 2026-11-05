import { describe, expect, it } from 'vitest'
import { isVideoFile, MAX_CLIP_BYTES, videoMime } from './videoFiles'

describe('fichiers vidéo', () => {
  it('reconnaît les formats jouables, sans tenir compte de la casse', () => {
    for (const n of ['a.mp4', 'B.MP4', 'c.webm', 'd.mov', 'e.m4v', 'f.ogv', 'mon clip.final.mp4']) expect(isVideoFile(n)).toBe(true)
  })
  it('refuse le reste', () => {
    for (const n of ['a.exe', 'a.mp3', 'mp4', '.mp4', 'a.mp4.txt', '']) expect(isVideoFile(n)).toBe(false)
  })
  it('type de média', () => {
    expect(videoMime('x.mp4')).toBe('video/mp4')
    expect(videoMime('x.MOV')).toBe('video/quicktime')
    expect(videoMime('x.webm')).toBe('video/webm')
    expect(videoMime('x.txt')).toBeNull()
  })
  it('taille maximale : 50 Mo', () => {
    expect(MAX_CLIP_BYTES).toBe(50 * 1024 * 1024)
  })
})
