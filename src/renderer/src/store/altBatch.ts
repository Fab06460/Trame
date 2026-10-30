import { create } from 'zustand'
import type { AiProviderId } from '@shared/ai'
import { prepareDescribeSource } from '@/aiEdit'
import { imagesMissingAlt } from '@/altCheck'
import { useEditor } from '@/store/editor'

interface Progress {
  done: number
  total: number
}

/**
 * « Décrire toutes les images » : les images sans description sont envoyées une à une au service choisi, puis toutes les descriptions
 * reçues sont appliquées d'un coup (un seul pas d'historique, annulable). Une erreur ou « Annuler » arrête l'envoi et garde ce qui est déjà reçu.
 */
export const useAltBatch = create<{
  progress: Progress | null
  error: { kind: string; detail?: string } | null
  /** nombre de descriptions appliquées par la dernière exécution */
  lastApplied: number | null
  run: (provider: AiProviderId, language: string) => Promise<void>
  cancel: () => void
  dismiss: () => void
}>((set, get) => {
  let current: string | null = null
  let stopped = false
  return {
    progress: null,
    error: null,
    lastApplied: null,

    run: async (provider, language) => {
      if (get().progress) return
      const doc = useEditor.getState().doc
      const targets = imagesMissingAlt(doc).map((m) => doc.pages[m.pageIndex].elements.find((e) => e.id === m.elementId)!)
      if (!targets.length) return
      stopped = false
      set({ progress: { done: 0, total: targets.length }, error: null, lastApplied: null })
      const changes: Array<{ id: string; alt: string }> = []
      try {
        for (const el of targets) {
          if (stopped) break
          current = crypto.randomUUID()
          const source = await prepareDescribeSource(el).catch(() => null)
          if (!source) continue // image illisible : on passe à la suivante
          const res = await window.trame.aiDescribe(provider, source.dataUrl, language, current)
          if (res.ok) changes.push({ id: el.id, alt: res.text })
          else if (res.error !== 'cancelled') {
            set({ error: { kind: res.error, detail: res.detail } })
            break
          } else break
          set({ progress: { done: changes.length, total: targets.length } })
        }
      } finally {
        current = null
        const applied = changes.length ? useEditor.getState().setImageAlts(changes) : 0
        set({ progress: null, lastApplied: applied })
      }
    },

    cancel: () => {
      stopped = true
      if (current) void window.trame.aiCancel(current)
    },

    dismiss: () => set({ error: null, lastApplied: null })
  }
})
