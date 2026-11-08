import { describe, expect, it } from 'vitest'
import { mergeSpeakerState, parseSpeakerCommand, parseSpeakerState } from './speakerProtocol'

const ok = { doc: '{"a":1}', index: 2, step: 1, black: false, startedAt: 1_700_000_000_000, spent: [1200, 0, 3400], enteredAt: 1_700_000_005_000 }

describe('état de l\'écran de l\'orateur', () => {
  it('accepte un état valide, avec ou sans document', () => {
    expect(parseSpeakerState(ok)).toEqual(ok)
    expect(parseSpeakerState({ ...ok, doc: null })?.doc).toBeNull()
  })
  it('refuse les messages mal formés', () => {
    for (const bad of [null, 'x', 12, {}, { ...ok, index: -1 }, { ...ok, index: 1.5 }, { ...ok, index: 'a' }, { ...ok, black: 'oui' }, { ...ok, startedAt: NaN }, { ...ok, doc: 5 }, { ...ok, index: 1e9 }, { ...ok, step: -1 }, { ...ok, step: 1.5 }, { ...ok, step: 'a' }]) expect(parseSpeakerState(bad)).toBeNull()
  })
  it('ne garde que les champs connus', () => {
    expect(Object.keys(parseSpeakerState({ ...ok, extra: 1 })!).sort()).toEqual(['black', 'doc', 'enteredAt', 'index', 'spent', 'startedAt', 'step'])
  })
  it('un état sans « step » (ancienne fenêtre) vaut zéro clic', () => {
    const { step: _step, ...old } = ok
    expect(parseSpeakerState(old)?.step).toBe(0)
  })
  it('un document absent conserve le précédent', () => {
    const prev = parseSpeakerState(ok)!
    expect(mergeSpeakerState(prev, { ...ok, doc: null, index: 5 })).toEqual({ ...ok, index: 5 })
    expect(mergeSpeakerState(null, { ...ok, doc: null }).doc).toBeNull()
  })
})

describe('chronométrage de l\'écran de l\'orateur', () => {
  it('un état sans temps (ancienne fenêtre) n\'a aucun temps passé et arrive au début de la présentation', () => {
    const { spent: _s, enteredAt: _e, ...old } = ok
    const parsed = parseSpeakerState(old)!
    expect(parsed.spent).toEqual([])
    expect(parsed.enteredAt).toBe(ok.startedAt)
  })
  it('des temps invalides sont ignorés', () => {
    for (const bad of [[-1], [Number.NaN], ['a'], 'x', { 0: 1 }, [Infinity]]) expect(parseSpeakerState({ ...ok, spent: bad })!.spent).toEqual([])
    expect(parseSpeakerState({ ...ok, enteredAt: 'x' })!.enteredAt).toBe(ok.startedAt)
  })
})

describe('commandes de l\'écran de l\'orateur', () => {
  it('reconnaît les commandes', () => {
    expect(parseSpeakerCommand({ type: 'go', index: 3 })).toEqual({ type: 'go', index: 3 })
    for (const t of ['next', 'prev', 'black', 'exit', 'swap']) expect(parseSpeakerCommand({ type: t })).toEqual({ type: t })
  })
  it('refuse le reste', () => {
    for (const bad of [null, 'go', {}, { type: 'go' }, { type: 'go', index: -2 }, { type: 'go', index: 'x' }, { type: 'rm -rf' }, 7]) expect(parseSpeakerCommand(bad)).toBeNull()
  })
})
