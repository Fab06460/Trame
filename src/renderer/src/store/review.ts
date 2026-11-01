import { create } from 'zustand'

const AUTHOR_KEY = 'trame.reviewAuthor'

function loadAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY)?.slice(0, 60) ?? ''
  } catch {
    return ''
  }
}

/** Où le prochain commentaire sera épinglé, en attendant son texte. */
export interface CommentDraft {
  pageId: string
  x: number
  y: number
}

interface ReviewState {
  /** mode « ajouter un commentaire » : le prochain clic sur la page y pose une épingle */
  adding: boolean
  draft: CommentDraft | null
  /** commentaire mis en avant (épingle et ligne de la liste) */
  activeId: string | null
  hideResolved: boolean
  /** nom affiché sur les commentaires et réponses (mémorisé sur cet ordinateur) */
  author: string
  setAdding: (adding: boolean) => void
  setDraft: (draft: CommentDraft | null) => void
  setActive: (id: string | null) => void
  setHideResolved: (v: boolean) => void
  setAuthor: (name: string) => void
}

export const useReview = create<ReviewState>((set) => ({
  adding: false,
  draft: null,
  activeId: null,
  hideResolved: false,
  author: loadAuthor(),
  setAdding: (adding) => set({ adding }),
  setDraft: (draft) => set({ draft, adding: false }),
  setActive: (activeId) => set({ activeId }),
  setHideResolved: (hideResolved) => set({ hideResolved }),
  setAuthor: (author) => {
    try {
      localStorage.setItem(AUTHOR_KEY, author)
    } catch {
      // stockage indisponible (fenêtre privée, données bloquées) : le nom reste valable pour la session
    }
    set({ author })
  }
}))
