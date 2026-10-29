import { describe, expect, it } from 'vitest'
import { aiLayerName, makeAiInfo, sanitizeAiInfo } from '@/aiImage'
import { parseDocument } from '@/store/editor'

describe('origine d’une image générée par IA', () => {
  it('borne les textes et nomme le calque d’après la demande', () => {
    expect(makeAiInfo('openai', 'gpt-image-1', '  un chat  ')).toEqual({ provider: 'openai', model: 'gpt-image-1', prompt: 'un chat' })
    expect(makeAiInfo('openai', 'm'.repeat(200), 'x'.repeat(5000)).prompt).toHaveLength(1000)
    expect(aiLayerName('un  renard\n roux ' + 'x'.repeat(100))).toHaveLength(60)
  })

  it('refuse ce qui n’est pas une origine valide (service inconnu, pas une image, demande vide)', () => {
    const ok = { type: 'image' as const, ai: { provider: 'cloudflare', model: 'FLUX.1 schnell', prompt: 'un chat' } }
    sanitizeAiInfo(ok)
    expect(ok.ai).toEqual({ provider: 'cloudflare', model: 'FLUX.1 schnell', prompt: 'un chat' })
    for (const bad of [{ type: 'image' as const, ai: { provider: 'inconnu', model: 'm', prompt: 'x' } }, { type: 'rect' as const, ai: { provider: 'openai', model: 'm', prompt: 'x' } }, { type: 'image' as const, ai: { provider: 'openai', model: 'm', prompt: '  ' } }, { type: 'image' as const, ai: 'texte' }]) {
      sanitizeAiInfo(bad)
      expect('ai' in bad).toBe(false)
    }
  })

  it('traverse l’enregistrement et la lecture d’un document', () => {
    const doc = {
      version: 2, name: 'x', width: 100, height: 100,
      pages: [{ id: 'p', background: '#fff', elements: [
        { id: 'a', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', src: 'data:image/png;base64,AAAA', ai: { provider: 'openai', model: 'gpt-image-1', prompt: 'un chat' } },
        { id: 'b', type: 'rect', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', ai: { provider: 'openai', model: 'm', prompt: 'intrus' } }
      ] }]
    }
    const read = parseDocument(JSON.stringify(doc))
    expect(read.pages[0].elements[0].ai).toEqual({ provider: 'openai', model: 'gpt-image-1', prompt: 'un chat' })
    expect(read.pages[0].elements[1].ai).toBeUndefined()
  })
})
