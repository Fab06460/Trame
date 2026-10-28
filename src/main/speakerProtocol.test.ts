import { describe, expect, it } from 'vitest'
import { mergeSpeakerState, parseSpeakerCommand, parseSpeakerState } from './speakerProtocol'

const ok = { doc: '{"a":1}', index: 2, black: false, startedAt: 1_700_000_000_000 }

describe('état de l\'écran de l\'orateur', () => {
  it('accepte un état valide, avec ou sans document', () => {
    expect(parseSpeakerState(ok)).toEqual(ok)
    expect(parseSpeakerState({ ...ok, doc: null })?.doc).toBeNull()
  })
  it('refuse les messages mal formés', () => {
    for (const bad of [null, 'x', 12, {}, { ...ok, index: -1 }, { ...ok, index: 1.5 }, { ...ok, index: 'a' }, { ...ok, black: 'oui' }, { ...ok, startedAt: NaN }, { ...ok, doc: 5 }, { ...ok, index: 1e9 }]) expect(parseSpeakerState(bad)).toBeNull()
  })
  it('ne garde que les champs connus', () => {
    expect(Object.keys(parseSpeakerState({ ...ok, extra: 1 })!).sort()).toEqual(['black', 'doc', 'index', 'startedAt'])
  })
  it('un document absent conserve le précédent', () => {
    const prev = parseSpeakerState(ok)!
    expect(mergeSpeakerState(prev, { ...ok, doc: null, index: 5 })).toEqual({ ...ok, index: 5 })
    expect(mergeSpeakerState(null, { ...ok, doc: null }).doc).toBeNull()
  })
})

describe('commandes de l\'écran de l\'orateur', () => {
  it('reconnaît les quatre commandes', () => {
    expect(parseSpeakerCommand({ type: 'go', index: 3 })).toEqual({ type: 'go', index: 3 })
    for (const t of ['black', 'exit', 'swap']) expect(parseSpeakerCommand({ type: t })).toEqual({ type: t })
  })
  it('refuse le reste', () => {
    for (const bad of [null, 'go', {}, { type: 'go' }, { type: 'go', index: -2 }, { type: 'go', index: 'x' }, { type: 'rm -rf' }, 7]) expect(parseSpeakerCommand(bad)).toBeNull()
  })
})
