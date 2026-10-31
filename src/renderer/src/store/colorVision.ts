import { create } from 'zustand'
import type { ColorVision } from '@/readability'

/** Simulation de la vision des couleurs affichée sur la page (écran seulement : jamais exportée ni enregistrée). */
export const useColorVision = create<{ vision: ColorVision; setVision: (v: ColorVision) => void }>((set) => ({ vision: 'none', setVision: (vision) => set({ vision }) }))
