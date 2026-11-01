/**
 * Planification de la copie de secours : on attend un court répit après la dernière modification (pour ne pas écrire
 * à chaque geste), mais jamais plus de `maxWaitMs` après la première modification non encore copiée.
 */
export interface AutosaveScheduler {
  /** une modification vient d'avoir lieu */
  change: () => void
  /** plus rien à copier (enregistré, nouveau document…) : annule l'écriture prévue */
  cancel: () => void
}

export function createScheduler(opts: { debounceMs: number; maxWaitMs: number; run: () => void | Promise<void>; now?: () => number }): AutosaveScheduler {
  const now = opts.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | undefined
  let firstChange = 0
  const fire = (): void => {
    timer = undefined
    firstChange = 0
    void Promise.resolve(opts.run()).catch(() => {})
  }
  return {
    change: () => {
      const t = now()
      if (!firstChange) firstChange = t
      if (timer) clearTimeout(timer)
      timer = setTimeout(fire, Math.max(0, Math.min(opts.debounceMs, firstChange + opts.maxWaitMs - t)))
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = undefined
      firstChange = 0
    }
  }
}
