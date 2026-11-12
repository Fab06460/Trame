import { create } from 'zustand'
import { allFonts } from '@/fonts'
import { t } from '@/i18n'
import {
  activeKit, addColor, addFont, addKit, addLogoChecked, deleteKit, duplicateKit, newKit, parseKitFile, parseLibrary, pushRecentColor, removeColor, removeFont, removeLogo, renameKit, selectKit, serializeKitFile, serializeLibrary,
  uniqueName, updateActive, type BrandKit, type BrandLibrary, type BrandLogo
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
  /** Tous les kits et celui qui est actif. */
  library: BrandLibrary
  /** Le kit actif : c'est lui que lisent le panneau, le sélecteur de police et Style Match. */
  kit: BrandKit
  recent: string[]
  load: () => Promise<void>
  noteColor: (color: string) => void
  addColor: (color: string) => void
  removeColor: (color: string) => void
  addFont: (family: string) => void
  removeFont: (family: string) => void
  /** `false` quand le logo ne tient pas (kit plein, ou total de tous les kits trop gros). */
  addLogo: (logo: BrandLogo) => boolean
  removeLogo: (id: string) => void
  selectKit: (id: string) => void
  createKit: (name: string) => void
  renameKit: (id: string, name: string) => void
  duplicateKit: (id: string) => void
  deleteKit: (id: string) => void
  /** Écrit le kit actif dans un fichier `.tramekit` (boîte d'enregistrement) ; `true` s'il a été écrit. */
  exportKit: () => Promise<boolean>
  /** Lit un fichier `.tramekit` et l'ajoute comme nouveau kit ; `null` si annulé, sinon le nom du kit ajouté ou `false` si le fichier n'est pas un kit. */
  importKit: () => Promise<string | false | null>
}

/** Kit de marque (enregistré dans le dossier de données, hors des documents) et couleurs récentes (par poste, dans le navigateur). */
export const useBrand = create<BrandState>((set, get) => {
  const commit = (library: BrandLibrary): void => {
    if (library === get().library) return
    set({ library, kit: activeKit(library) })
    void window.trame.saveBrandKit(serializeLibrary(library))
  }
  const change = (fn: (k: BrandKit) => BrandKit): void => commit(updateActive(get().library, fn))
  const first = parseLibrary(null, '')
  return {
    library: first,
    kit: activeKit(first),
    recent: readRecent(),
    load: async () => {
      try {
        const library = parseLibrary(await window.trame.loadBrandKit(), t('brand.kit.default'))
        set({ library, kit: activeKit(library) })
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
    addLogo: (l) => {
      const next = addLogoChecked(get().library, l)
      if (!next) return false
      commit(next)
      return true
    },
    removeLogo: (id) => change((k) => removeLogo(k, id)),
    selectKit: (id) => commit(selectKit(get().library, id)),
    createKit: (name) => commit(addKit(get().library, newKit(crypto.randomUUID(), name))),
    renameKit: (id, name) => commit(renameKit(get().library, id, name)),
    duplicateKit: (id) => {
      const lib = get().library
      const src = lib.kits.find((k) => k.id === id)
      if (src) commit(duplicateKit(lib, id, crypto.randomUUID(), t('brand.kit.copyName', { name: src.name }), () => crypto.randomUUID()))
    },
    deleteKit: (id) => commit(deleteKit(get().library, id)),
    exportKit: () => window.trame.exportBrandKit(serializeKitFile(activeKit(get().library)), activeKit(get().library).name),
    importKit: async () => {
      const raw = await window.trame.importBrandKit()
      if (raw === null) return null
      const file = parseKitFile(raw)
      if (!file) return false
      const lib = get().library
      const name = uniqueName(lib, file.name || t('brand.kit.imported'))
      // le total des logos reste sous la limite : les logos en trop sont laissés de côté
      let next = addKit(lib, newKit(crypto.randomUUID(), name, { ...file.kit, logos: [] }))
      if (next === lib) return false
      for (const logo of file.kit.logos) next = addLogoChecked(next, { ...logo, id: crypto.randomUUID() }) ?? next
      commit(next)
      return activeKit(next).name
    }
  }
})

export const fontName = (family: string): string => allFonts().find((f) => f.family === family)?.name ?? family
