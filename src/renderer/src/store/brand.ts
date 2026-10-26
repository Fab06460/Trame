import { create } from 'zustand'
import { allFonts } from '@/fonts'
import {
  addColor, addFont, addLogo, emptyKit, parseBrandKit, pushRecentColor, removeColor, removeFont, removeLogo, type BrandKit, type BrandLogo
} from '@/brandKit'

const RECENT_KEY = 'trame.recentColors'

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string').slice(0, 12) : []
  } catch {
    return []
  }
}

interface BrandState {
  kit: BrandKit
  recent: string[]
  load: () => Promise<void>
  noteColor: (color: string) => void
  addColor: (color: string) => void
  removeColor: (color: string) => void
  addFont: (family: string) => void
  removeFont: (family: string) => void
  addLogo: (logo: BrandLogo) => void
  removeLogo: (id: string) => void
}

/** Kit de marque (enregistré dans le dossier de données, hors des documents) et couleurs récentes (par poste, dans le navigateur). */
export const useBrand = create<BrandState>((set, get) => {
  const change = (fn: (k: BrandKit) => BrandKit): void => {
    const kit = fn(get().kit)
    if (kit === get().kit) return
    set({ kit })
    void window.trame.saveBrandKit(JSON.stringify(kit))
  }
  return {
    kit: emptyKit(),
    recent: readRecent(),
    load: async () => {
      try {
        set({ kit: parseBrandKit(await window.trame.loadBrandKit()) })
      } catch {
        /* kit vide : le panneau reste utilisable */
      }
    },
    noteColor: (color) => {
      const recent = pushRecentColor(get().recent, color)
      if (recent === get().recent) return
      set({ recent })
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
      } catch {
        /* confort seulement */
      }
    },
    addColor: (c) => change((k) => addColor(k, c)),
    removeColor: (c) => change((k) => removeColor(k, c)),
    addFont: (f) => change((k) => addFont(k, f)),
    removeFont: (f) => change((k) => removeFont(k, f)),
    addLogo: (l) => change((k) => addLogo(k, l)),
    removeLogo: (id) => change((k) => removeLogo(k, id))
  }
})

export const fontName = (family: string): string => allFonts().find((f) => f.family === family)?.name ?? family
