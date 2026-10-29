import { MAX_AI_PROMPT, isAiProvider } from '@shared/ai'
import type { TrameElement } from '@/types'

/** Origine d'une image générée par un service d'IA (information enregistrée avec l'élément). */
export type AiInfo = NonNullable<TrameElement['ai']>

export function makeAiInfo(provider: AiInfo['provider'], model: string, prompt: string): AiInfo {
  return { provider, model: model.slice(0, 60), prompt: prompt.trim().slice(0, MAX_AI_PROMPT) }
}

/** Nom de calque proposé pour une image générée : le début de la demande. */
export const aiLayerName = (prompt: string): string => prompt.replace(/\s+/g, ' ').trim().slice(0, 60)

/** Lecture d'un fichier : `ai` n'a de sens que sur une image, avec un service connu et des textes bornés ; sinon il est retiré. */
export function sanitizeAiInfo(e: { type: string; ai?: unknown }): void {
  const a = e.ai as Partial<Record<keyof AiInfo, unknown>> | undefined
  if (e.type !== 'image' || !a || typeof a !== 'object' || !isAiProvider(a.provider) || typeof a.model !== 'string' || typeof a.prompt !== 'string' || !a.prompt.trim()) {
    delete e.ai
    return
  }
  e.ai = makeAiInfo(a.provider, a.model, a.prompt)
}
