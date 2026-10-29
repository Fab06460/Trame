import { create } from 'zustand'
import { providerInfo, type AiProviderId, type AiSize, type AiStatus } from '@shared/ai'
import { makeAiInfo, type AiInfo } from '@/aiImage'
import { t } from '@/i18n'

export interface AiResult {
  id: string
  dataUrl: string
  prompt: string
  info: AiInfo
}

/** Nombre d'images gardées dans la liste (elles pèsent plusieurs Mo chacune et disparaissent à la fermeture). */
export const MAX_RESULTS = 12

/** État du panneau « IA » : service choisi, état des identifiants, génération en cours, images produites pendant la session. */
export const useAi = create<{
  status: AiStatus | null
  provider: AiProviderId
  size: AiSize
  prompt: string
  busy: string | null
  error: { kind: string; detail?: string } | null
  results: AiResult[]
  refresh: () => Promise<void>
  set: (patch: Partial<{ provider: AiProviderId; size: AiSize; prompt: string }>) => void
  generate: () => Promise<void>
  cancel: () => void
  clearError: () => void
}>((set, get) => ({
  status: null,
  provider: 'cloudflare',
  size: 'square',
  prompt: '',
  busy: null,
  error: null,
  results: [],

  refresh: async () => {
    const status = await window.trame.aiStatus()
    // premier affichage : on propose d'abord le service déjà configuré
    const first = get().status === null ? status.providers.find((p) => p.configured)?.id : undefined
    set(first ? { status, provider: first, size: providerInfo(first).sizes[0] } : { status })
  },

  set: (patch) => {
    const next = { ...get(), ...patch }
    // changer de service peut rendre le format indisponible (Cloudflare ne produit que des carrés)
    if (patch.provider && !providerInfo(patch.provider).sizes.includes(next.size)) patch = { ...patch, size: providerInfo(patch.provider).sizes[0] }
    set({ ...patch, error: null })
  },

  generate: async () => {
    const { provider, size, prompt, busy } = get()
    if (busy || !prompt.trim()) return
    const id = crypto.randomUUID()
    set({ busy: id, error: null })
    const res = await window.trame.aiGenerate(provider, prompt, size, id)
    if (get().busy !== id) return // annulée entre-temps
    if (!res.ok) {
      set({ busy: null, error: res.error === 'cancelled' ? null : { kind: res.error, detail: res.detail } })
      return
    }
    const result: AiResult = { id, dataUrl: res.dataUrl, prompt: prompt.trim(), info: makeAiInfo(res.provider, res.model, prompt) }
    set({ busy: null, results: [result, ...get().results].slice(0, MAX_RESULTS) })
  },

  cancel: () => {
    const id = get().busy
    if (!id) return
    set({ busy: null })
    void window.trame.aiCancel(id)
  },

  clearError: () => set({ error: null })
}))

/** Message d'erreur dans la langue courante. */
export function aiErrorMessage(kind: string, provider: AiProviderId): string {
  const service = providerInfo(provider).name
  switch (kind) {
    case 'no-credentials': return t('ai.err.noCredentials', { service })
    case 'offline': return t('ai.err.offline', { service })
    case 'rate-limit': return t('ai.err.rateLimit', { service })
    case 'quota': return t('ai.err.quota', { service })
    case 'auth': return t('ai.err.auth', { service })
    case 'refused': return t('ai.err.refused', { service })
    default: return t('ai.err.unavailable', { service })
  }
}

