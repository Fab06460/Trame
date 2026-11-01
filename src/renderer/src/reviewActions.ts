import { addComment, addReply, clearComments, deleteComment, deleteReply, editComment, moveComment, setResolved, allComments, commentsAsText, mergeComments } from '@/review'
import { useEditor } from '@/store/editor'
import { useReview } from '@/store/review'
import { openSidebarTab } from '@/store/sidebar'
import { t, useLocale } from '@/i18n'
import type { TrameDocument } from '@/types'

const edit = (f: (doc: TrameDocument) => TrameDocument): void => useEditor.getState().editDocument(f)

/** Passe en mode « ajouter » : le prochain clic sur la page y pose l'épingle. */
export function startAddingComment(): void {
  useReview.getState().setAdding(true)
  openSidebarTab('review')
}

/** Publie le brouillon en cours ; retourne l'identifiant du commentaire créé, ou null (texte vide, limite atteinte). */
export function publishDraft(text: string): string | null {
  const { draft, author } = useReview.getState()
  if (!draft) return null
  const before = useEditor.getState().doc
  const res = addComment(before, draft.pageId, { x: draft.x, y: draft.y, author, text })
  if (!res.id) return null
  edit(() => res.doc)
  useReview.getState().setDraft(null)
  useReview.getState().setActive(res.id)
  return res.id
}

export const replyTo = (pageId: string, commentId: string, text: string): void => edit((d) => addReply(d, pageId, commentId, useReview.getState().author, text))
export const resolveComment = (pageId: string, commentId: string, resolved: boolean): void => edit((d) => setResolved(d, pageId, commentId, resolved))
export const changeComment = (pageId: string, commentId: string, text: string): void => edit((d) => editComment(d, pageId, commentId, text))
export const placeComment = (pageId: string, commentId: string, x: number, y: number): void => edit((d) => moveComment(d, pageId, commentId, x, y))
export const removeComment = (pageId: string, commentId: string): void => edit((d) => deleteComment(d, pageId, commentId))
export const removeReply = (pageId: string, commentId: string, replyId: string): void => edit((d) => deleteReply(d, pageId, commentId, replyId))

/** Affiche la page du commentaire et le met en avant. */
export function showComment(pageId: string, commentId: string): void {
  useEditor.getState().setPage(pageId)
  useReview.getState().setActive(commentId)
  openSidebarTab('review')
}

/** Retire tous les commentaires, après confirmation ; retourne vrai si c'est fait. */
export async function clearAllComments(): Promise<boolean> {
  const count = allComments(useEditor.getState().doc).length
  if (!count) return false
  if (!(await window.trame.confirm(t('review.clear.confirm', { count }), t('review.clear.detail'), t('review.clear')))) return false
  edit(clearComments)
  useReview.getState().setActive(null)
  return true
}

/** Copie la liste des commentaires en texte brut. */
export async function copyCommentsText(): Promise<boolean> {
  const text = commentsAsText(useEditor.getState().doc, { page: t('review.page'), resolved: t('review.resolved'), reply: '↳' }, useLocale.getState().locale)
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Reprend les commentaires d'une autre copie du document. */
export function importComments(other: TrameDocument): { addedComments: number; addedReplies: number; resolved: number } {
  const res = mergeComments(useEditor.getState().doc, other)
  edit(() => res.doc)
  return res
}
