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

function readLast(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeLast(version: string): void {
  try {
    localStorage.setItem(KEY, version)
  } catch {
    /* sans stockage : on ne montrera simplement rien de plus */
  }
}

/**
 * Ce qu'il y a de nouveau depuis le dernier lancement. La première fois (rien de mémorisé), on retient la version sans rien montrer : la
 * visite guidée s'en charge. Le numéro est mémorisé dès qu'on a décidé de montrer (ou non) : la fenêtre n'apparaît qu'une fois par mise à jour.
 */
export function pendingNews(current: string): NewsEntry[] {
  const last = readLast()
  writeLast(current)
  if (!last) return []
  return newsBetween(last, current)
}
