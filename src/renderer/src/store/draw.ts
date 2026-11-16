import { create } from 'zustand'
import { TOOL_DEFAULTS, WIDTH_LIMITS, type DrawTool, type ToolSettings } from '@/drawTools'
import type { LineEnds } from '@/types'

/**
 * Outil de dessin actif (crayon, surligneur, ligne, flèche) et réglages de chacun. État d'affichage : ni sauvegardé dans le document, ni
 * dans l'historique ; seuls les tracés posés y entrent (un pas d'historique chacun). `tool` nul = pas de dessin, le canvas sélectionne.
 */
interface DrawState {
  tool: DrawTool | null
  settings: Record<DrawTool, ToolSettings>
  setTool: (tool: DrawTool | null) => void
  setColor: (tool: DrawTool, color: string) => void
  setWidth: (tool: DrawTool, width: number) => void
  setEnds: (tool: DrawTool, ends: LineEnds | undefined) => void
}

export const useDraw = create<DrawState>((set) => ({
  tool: null,
  settings: { ...TOOL_DEFAULTS },
  setTool: (tool) => set({ tool }),
  setColor: (tool, color) => set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], color } } })),
  setWidth: (tool, width) =>
    set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], width: Math.min(WIDTH_LIMITS.max, Math.max(WIDTH_LIMITS.min, Math.round(width))) } } })),
  setEnds: (tool, ends) => set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], ends } } }))
}))
