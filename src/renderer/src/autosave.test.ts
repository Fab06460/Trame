import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduler } from './autosave'

describe('createScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('écrit après un répit sans modification', () => {
    const run = vi.fn()
    const s = createScheduler({ debounceMs: 1000, maxWaitMs: 5000, run })
    s.change()
    vi.advanceTimersByTime(999)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('repousse l\'écriture tant que ça bouge, mais pas au-delà du délai maximal', () => {
    const run = vi.fn()
    const s = createScheduler({ debounceMs: 1000, maxWaitMs: 3500, run })
    for (let i = 0; i < 10; i++) {
      s.change()
      vi.advanceTimersByTime(700)
    }
    // 7 s de modifications continues : une écriture a eu lieu à 3,5 s au plus tard
    expect(run).toHaveBeenCalled()
    expect(run.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('cancel annule l\'écriture prévue', () => {
    const run = vi.fn()
    const s = createScheduler({ debounceMs: 1000, maxWaitMs: 5000, run })
    s.change()
    s.cancel()
    vi.advanceTimersByTime(10_000)
    expect(run).not.toHaveBeenCalled()
  })

  it('une écriture qui échoue ne casse rien', async () => {
    const s = createScheduler({ debounceMs: 10, maxWaitMs: 50, run: () => Promise.reject(new Error('disque plein')) })
    s.change()
    await vi.advanceTimersByTimeAsync(20)
    s.change()
    await vi.advanceTimersByTimeAsync(20)
  })
})
