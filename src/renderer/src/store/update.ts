import { create } from 'zustand'
import type { UpdateState } from '@shared/update'

interface UpdateStore {
  state: UpdateState | null
  /** fenêtre « Mises à jour » ouverte */
  open: boolean
  /** bannière masquée pour cet état (« Plus tard ») : clé `phase:version` */
  dismissed: string | null
  set: (state: UpdateState) => void
  setOpen: (open: boolean) => void
  dismiss: (key: string | null) => void
}

export const useUpdate = create<UpdateStore>((set) => ({
  state: null,
  open: false,
  dismissed: null,
  set: (state) => set({ state }),
  setOpen: (open) => set({ open }),
  dismiss: (dismissed) => set({ dismissed })
}))

export const updateKey = (s: UpdateState): string => `${s.phase}:${s.version ?? ''}`
