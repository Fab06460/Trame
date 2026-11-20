import { create } from 'zustand'
import { newsBetween, NEWS, type NewsEntry } from '@shared/news'

const KEY = 'trame.lastVersion'

/** Fenêtre « Nouveautés » : ouverte ou non, et les versions qu'elle montre. */
export const useNews = create<{ entries: NewsEntry[] | null; current: string; auto: boolean; show: (entries: NewsEntry[], current: string, auto: boolean) => void; close: () => void }>((set) => ({
  entries: null,
  current: '',
  auto: false,
  show: (entries, current, auto) => set({ entries, current, auto }),
  close: () => set({ entries: null })
}))

/** À la demande : toutes les nouveautés, de la plus récente à la plus ancienne. */
export function showAllNews(current: string): void {
  useNews.getState().show([...NEWS], current, false)
}

/** Le stockage dont on a besoin (`localStorage`, ou un double dans les tests). */
interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/**
 * Ce qu'il y a de nouveau depuis le dernier lancement, et la mémorisation de la version courante (la fenêtre n'apparaît qu'une fois par mise à jour).
 * Rien de mémorisé : soit une première installation (la visite guidée n'a jamais été proposée : on ne montre rien, elle s'en charge), soit une
 * mise à jour depuis une version qui ne retenait pas son numéro (la visite a déjà eu lieu) : on montre alors la version courante seule.
 * Sans stockage utilisable, on ne montre rien : la fenêtre reviendrait à chaque lancement.
 */
export function pendingNews(current: string, store: Store | null = safeStorage()): NewsEntry[] {
  if (!store) return []
  try {
    const last = store.getItem(KEY)
    const tourDone = store.getItem('trame.tour') !== null
    store.setItem(KEY, current)
    if (last) return newsBetween(last, current)
    return tourDone ? newsBetween('0.0.0', current).slice(0, 1) : []
  } catch {
    return []
  }
}

function safeStorage(): Store | null {
  try {
    return localStorage
  } catch {
    return null
  }
}
