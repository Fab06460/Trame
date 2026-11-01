import { nanoid } from 'nanoid'
import type { ReviewComment, ReviewReply, TrameDocument, TramePage } from '@/types'

/** Limites : un fichier reçu d'ailleurs ne doit pas faire grossir le document sans borne. */
export const MAX_COMMENTS = 200
export const MAX_REPLIES = 50
export const MAX_TEXT = 2000
export const MAX_AUTHOR = 60

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Texte saisi : fins de ligne normalisées, caractères de contrôle retirés, longueur bornée. Vide si rien d'utile. */
export function cleanCommentText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_TEXT)
}

export function cleanAuthor(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_AUTHOR) : ''
}

function cleanReply(r: any): ReviewReply | null {
  const text = cleanCommentText(r?.text)
  if (!text || typeof r?.id !== 'string' || !r.id || !isNum(r.at)) return null
  return { id: r.id.slice(0, 40), author: cleanAuthor(r.author), at: r.at, text }
}

function cleanComment(c: any, width: number, height: number): ReviewComment | null {
  const text = cleanCommentText(c?.text)
  if (!text || typeof c?.id !== 'string' || !c.id || !isNum(c.x) || !isNum(c.y) || !isNum(c.at)) return null
  const seen = new Set<string>()
  const replies = (Array.isArray(c.replies) ? c.replies : [])
    .map(cleanReply)
    .filter((r: ReviewReply | null): r is ReviewReply => !!r && !seen.has(r.id) && !!seen.add(r.id))
    .slice(0, MAX_REPLIES)
  return {
    id: c.id.slice(0, 40),
    x: Math.min(width, Math.max(0, c.x)),
    y: Math.min(height, Math.max(0, c.y)),
    author: cleanAuthor(c.author),
    at: c.at,
    text,
    ...(c.resolved === true ? { resolved: true as const } : {}),
    ...(replies.length ? { replies } : {})
  }
}

/** Nettoyage à la lecture d'un fichier (modifie la page en place) : une entrée invalide est ignorée, les identifiants en double aussi. */
export function sanitizeComments(page: { comments?: unknown }, width: number, height: number): void {
  if (page.comments === undefined) return
  const seen = new Set<string>()
  const ok = (Array.isArray(page.comments) ? page.comments : [])
    .map((c) => cleanComment(c, width, height))
    .filter((c): c is ReviewComment => !!c && !seen.has(c.id) && !!seen.add(c.id))
    .slice(0, MAX_COMMENTS)
  if (ok.length) page.comments = ok
  else delete page.comments
}

export const commentsOf = (page: TramePage): ReviewComment[] => page.comments ?? []

export interface NumberedComment {
  comment: ReviewComment
  pageId: string
  /** numéro de la page (1, 2…) */
  pageNumber: number
  /** numéro d'ordre dans tout le document, affiché dans l'épingle */
  n: number
}

/** Tous les commentaires du document, numérotés dans l'ordre des pages puis de leur création. */
export function allComments(doc: TrameDocument): NumberedComment[] {
  let n = 0
  return doc.pages.flatMap((page, i) =>
    [...commentsOf(page)].sort((a, b) => a.at - b.at).map((comment) => ({ comment, pageId: page.id, pageNumber: i + 1, n: ++n }))
  )
}

/** Nombre de commentaires à traiter (non résolus). */
export const openCount = (doc: TrameDocument): number => doc.pages.reduce((n, p) => n + commentsOf(p).filter((c) => !c.resolved).length, 0)

const withComments = (page: TramePage, comments: ReviewComment[]): TramePage => {
  const { comments: _old, ...rest } = page
  void _old
  return comments.length ? { ...rest, comments } : rest
}

const mapPage = (doc: TrameDocument, pageId: string, f: (comments: ReviewComment[]) => ReviewComment[]): TrameDocument => ({
  ...doc,
  pages: doc.pages.map((p) => (p.id === pageId ? withComments(p, f(commentsOf(p))) : p))
})

export interface NewComment {
  x: number
  y: number
  author: string
  text: string
}

/** Ajoute un commentaire à une page ; retourne le document (inchangé si le texte est vide ou la limite atteinte) et l'identifiant créé. */
export function addComment(doc: TrameDocument, pageId: string, input: NewComment, now = Date.now()): { doc: TrameDocument; id: string | null } {
  const text = cleanCommentText(input.text)
  const page = doc.pages.find((p) => p.id === pageId)
  if (!text || !page || commentsOf(page).length >= MAX_COMMENTS) return { doc, id: null }
  const id = nanoid(8)
  const comment: ReviewComment = {
    id,
    x: Math.min(doc.width, Math.max(0, input.x)),
    y: Math.min(doc.height, Math.max(0, input.y)),
    author: cleanAuthor(input.author),
    at: now,
    text
  }
  return { doc: mapPage(doc, pageId, (list) => [...list, comment]), id }
}

export function addReply(doc: TrameDocument, pageId: string, commentId: string, author: string, rawText: string, now = Date.now()): TrameDocument {
  const text = cleanCommentText(rawText)
  if (!text) return doc
  return mapPage(doc, pageId, (list) =>
    list.map((c) => (c.id === commentId && (c.replies?.length ?? 0) < MAX_REPLIES ? { ...c, replies: [...(c.replies ?? []), { id: nanoid(8), author: cleanAuthor(author), at: now, text }] } : c))
  )
}

export function setResolved(doc: TrameDocument, pageId: string, commentId: string, resolved: boolean): TrameDocument {
  return mapPage(doc, pageId, (list) =>
    list.map((c) => {
      if (c.id !== commentId) return c
      const { resolved: _old, ...rest } = c
      void _old
      return resolved ? { ...rest, resolved: true as const } : rest
    })
  )
}

/** Modifie le texte d'un commentaire (un texte vide est refusé : on supprime plutôt). */
export function editComment(doc: TrameDocument, pageId: string, commentId: string, rawText: string): TrameDocument {
  const text = cleanCommentText(rawText)
  if (!text) return doc
  return mapPage(doc, pageId, (list) => list.map((c) => (c.id === commentId ? { ...c, text } : c)))
}

export const moveComment = (doc: TrameDocument, pageId: string, commentId: string, x: number, y: number): TrameDocument =>
  mapPage(doc, pageId, (list) => list.map((c) => (c.id === commentId ? { ...c, x: Math.min(doc.width, Math.max(0, x)), y: Math.min(doc.height, Math.max(0, y)) } : c)))

export const deleteComment = (doc: TrameDocument, pageId: string, commentId: string): TrameDocument => mapPage(doc, pageId, (list) => list.filter((c) => c.id !== commentId))

export const deleteReply = (doc: TrameDocument, pageId: string, commentId: string, replyId: string): TrameDocument =>
  mapPage(doc, pageId, (list) =>
    list.map((c) => {
      if (c.id !== commentId) return c
      const replies = (c.replies ?? []).filter((r) => r.id !== replyId)
      const { replies: _old, ...rest } = c
      void _old
      return replies.length ? { ...rest, replies } : rest
    })
  )

/** Retire tous les commentaires du document (par exemple avant de le remettre « propre »). */
export function clearComments(doc: TrameDocument): TrameDocument {
  return { ...doc, pages: doc.pages.map((p) => withComments(p, [])) }
}

/** Retire les commentaires des pages données (page dupliquée : la copie n'a pas été relue). */
export const withoutComments = (page: TramePage): TramePage => withComments(page, [])

/**
 * Reprend dans `doc` les commentaires de `other` (une copie relue par quelqu'un d'autre), page par page (même identifiant de page) :
 * les commentaires et réponses absents sont ajoutés, un commentaire déjà présent garde son texte mais devient « traité » si l'autre
 * copie l'a traité. Retourne le nouveau document et ce qui a été ajouté.
 */
export function mergeComments(doc: TrameDocument, other: TrameDocument): { doc: TrameDocument; addedComments: number; addedReplies: number; resolved: number } {
  let addedComments = 0
  let addedReplies = 0
  let resolved = 0
  const pages = doc.pages.map((page) => {
    const theirs = commentsOf(other.pages.find((p) => p.id === page.id) ?? ({ comments: [] } as unknown as TramePage))
    if (!theirs.length) return page
    const mine = commentsOf(page)
    const byId = new Map(mine.map((c) => [c.id, c]))
    const next = mine.map((c) => {
      const t = theirs.find((x) => x.id === c.id)
      if (!t) return c
      let out = c
      const known = new Set((c.replies ?? []).map((r) => r.id))
      const fresh = (t.replies ?? []).filter((r) => !known.has(r.id))
      if (fresh.length) {
        addedReplies += fresh.length
        out = { ...out, replies: [...(out.replies ?? []), ...fresh].sort((a, b) => a.at - b.at).slice(0, MAX_REPLIES) }
      }
      if (t.resolved && !c.resolved) {
        resolved++
        out = { ...out, resolved: true }
      }
      return out
    })
    const added = theirs.filter((c) => !byId.has(c.id)).map((c) => ({ ...c, x: Math.min(doc.width, c.x), y: Math.min(doc.height, c.y) }))
    addedComments += added.length
    return withComments(page, [...next, ...added].slice(0, MAX_COMMENTS))
  })
  return { doc: { ...doc, pages }, addedComments, addedReplies, resolved }
}

/** Liste des commentaires en texte brut (à copier dans un message ou un cahier de correction). */
export function commentsAsText(doc: TrameDocument, labels: { page: string; resolved: string; reply: string }, locale: string): string {
  const date = (ms: number): string => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return allComments(doc)
    .map(({ comment: c, pageNumber, n }) => {
      const head = `${n}. ${labels.page} ${pageNumber}${c.author ? ` — ${c.author}` : ''} (${date(c.at)})${c.resolved ? ` — ${labels.resolved}` : ''}`
      const replies = (c.replies ?? []).map((r) => `   ${labels.reply} ${r.author ? `${r.author} ` : ''}(${date(r.at)}) : ${r.text.replace(/\n/g, '\n   ')}`)
      return [head, `   ${c.text.replace(/\n/g, '\n   ')}`, ...replies].join('\n')
    })
    .join('\n\n')
}
