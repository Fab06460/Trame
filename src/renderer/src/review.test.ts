import { describe, expect, it } from 'vitest'
import type { TrameDocument } from '@/types'
import {
  MAX_COMMENTS,
  MAX_REPLIES,
  MAX_TEXT,
  addComment,
  addReply,
  allComments,
  clearComments,
  cleanCommentText,
  commentsAsText,
  deleteComment,
  deleteReply,
  editComment,
  mergeComments,
  moveComment,
  openCount,
  sanitizeComments,
  setResolved
} from './review'

const doc = (pages = 2): TrameDocument => ({
  version: 2,
  name: 'Exposé',
  width: 1000,
  height: 500,
  pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i + 1}`, background: '#fff', elements: [] }))
})
const withOne = (): { d: TrameDocument; id: string } => {
  const r = addComment(doc(), 'p1', { x: 100, y: 50, author: 'Mme Martin', text: 'Source à citer' }, 1000)
  return { d: r.doc, id: r.id! }
}

describe('cleanCommentText', () => {
  it('normalise les fins de ligne, retire les caractères de contrôle et borne la longueur', () => {
    expect(cleanCommentText('  a\r\nb\u0000c  ')).toBe('a\nbc')
    expect(cleanCommentText('x'.repeat(MAX_TEXT + 50))).toHaveLength(MAX_TEXT)
    expect(cleanCommentText(42)).toBe('')
  })
})

describe('addComment', () => {
  it('ajoute un commentaire à la page, sans toucher aux autres', () => {
    const { d, id } = withOne()
    expect(d.pages[0].comments).toEqual([{ id, x: 100, y: 50, author: 'Mme Martin', at: 1000, text: 'Source à citer' }])
    expect(d.pages[1].comments).toBeUndefined()
  })

  it('refuse un texte vide, une page inconnue et la limite dépassée', () => {
    expect(addComment(doc(), 'p1', { x: 0, y: 0, author: 'a', text: '  ' }).id).toBeNull()
    expect(addComment(doc(), 'zz', { x: 0, y: 0, author: 'a', text: 'x' }).id).toBeNull()
    let d = doc()
    for (let i = 0; i < MAX_COMMENTS; i++) d = addComment(d, 'p1', { x: 0, y: 0, author: 'a', text: `c${i}` }).doc
    expect(addComment(d, 'p1', { x: 0, y: 0, author: 'a', text: 'de trop' }).id).toBeNull()
  })

  it('garde l\'épingle dans la page', () => {
    const r = addComment(doc(), 'p1', { x: -20, y: 9999, author: 'a', text: 'x' })
    expect(r.doc.pages[0].comments![0]).toMatchObject({ x: 0, y: 500 })
  })
})

describe('réponses, état, texte, suppression', () => {
  it('répond, résout, rouvre', () => {
    const { d, id } = withOne()
    const replied = addReply(d, 'p1', id, 'Léo', 'Corrigé !', 2000)
    expect(replied.pages[0].comments![0].replies).toMatchObject([{ author: 'Léo', at: 2000, text: 'Corrigé !' }])
    const done = setResolved(replied, 'p1', id, true)
    expect(done.pages[0].comments![0].resolved).toBe(true)
    expect(openCount(done)).toBe(0)
    expect(setResolved(done, 'p1', id, false).pages[0].comments![0].resolved).toBeUndefined()
    expect(openCount(replied)).toBe(1)
  })

  it('limite le nombre de réponses et ignore les réponses vides', () => {
    const { d, id } = withOne()
    expect(addReply(d, 'p1', id, 'a', '   ')).toBe(d)
    let cur = d
    for (let i = 0; i < MAX_REPLIES + 5; i++) cur = addReply(cur, 'p1', id, 'a', `r${i}`)
    expect(cur.pages[0].comments![0].replies).toHaveLength(MAX_REPLIES)
  })

  it('modifie le texte (jamais en le vidant), déplace l\'épingle', () => {
    const { d, id } = withOne()
    expect(editComment(d, 'p1', id, 'Nouveau').pages[0].comments![0].text).toBe('Nouveau')
    expect(editComment(d, 'p1', id, '  ')).toBe(d)
    expect(moveComment(d, 'p1', id, 300, 40).pages[0].comments![0]).toMatchObject({ x: 300, y: 40 })
  })

  it('supprime un commentaire, puis retire le champ de la page quand il n\'en reste plus', () => {
    const { d, id } = withOne()
    const gone = deleteComment(d, 'p1', id)
    expect('comments' in gone.pages[0]).toBe(false)
  })

  it('supprime une réponse', () => {
    const { d, id } = withOne()
    const r = addReply(addReply(d, 'p1', id, 'a', 'un', 1), 'p1', id, 'b', 'deux', 2)
    const rid = r.pages[0].comments![0].replies![0].id
    expect(deleteReply(r, 'p1', id, rid).pages[0].comments![0].replies!.map((x) => x.text)).toEqual(['deux'])
    const last = deleteReply(deleteReply(r, 'p1', id, rid), 'p1', id, r.pages[0].comments![0].replies![1].id)
    expect(last.pages[0].comments![0].replies).toBeUndefined()
  })
})

describe('numérotation', () => {
  it('numérote dans l\'ordre des pages puis de la date', () => {
    let d = addComment(doc(), 'p2', { x: 0, y: 0, author: 'a', text: 'page 2' }, 10).doc
    d = addComment(d, 'p1', { x: 0, y: 0, author: 'a', text: 'tard' }, 50).doc
    d = addComment(d, 'p1', { x: 0, y: 0, author: 'a', text: 'tôt' }, 5).doc
    expect(allComments(d).map((c) => [c.n, c.pageNumber, c.comment.text])).toEqual([
      [1, 1, 'tôt'],
      [2, 1, 'tard'],
      [3, 2, 'page 2']
    ])
  })
})

describe('sanitizeComments', () => {
  const page = (comments: unknown): { comments?: unknown } => ({ comments })
  it('ne garde que les commentaires valides, sans doublon d\'identifiant, et borne les positions', () => {
    const p = page([
      { id: 'a', x: 5000, y: -3, author: ' Zoé ', at: 1, text: ' ok ', resolved: true, replies: [{ id: 'r', author: 'x', at: 2, text: 'oui' }, { id: 'r', author: 'x', at: 3, text: 'doublon' }, { id: 'v', at: 3, text: '' }] },
      { id: 'a', x: 1, y: 1, at: 1, text: 'même id' },
      { id: 'b', x: 'x', y: 1, at: 1, text: 'position invalide' },
      { id: 'c', x: 1, y: 1, at: 1, text: '' },
      null
    ])
    sanitizeComments(p, 1000, 500)
    expect(p.comments).toEqual([{ id: 'a', x: 1000, y: 0, author: 'Zoé', at: 1, text: 'ok', resolved: true, replies: [{ id: 'r', author: 'x', at: 2, text: 'oui' }] }])
  })

  it('retire le champ quand il ne reste rien, et ignore une valeur qui n\'est pas une liste', () => {
    const p = page('n\'importe quoi')
    sanitizeComments(p, 10, 10)
    expect('comments' in p).toBe(false)
    const q: { comments?: unknown } = {}
    sanitizeComments(q, 10, 10)
    expect('comments' in q).toBe(false)
  })

  it('« resolved » n\'est retenu que s\'il vaut true', () => {
    const p = page([{ id: 'a', x: 1, y: 1, at: 1, text: 't', resolved: 'oui' }])
    sanitizeComments(p, 10, 10)
    expect((p.comments as Array<{ resolved?: boolean }>)[0].resolved).toBeUndefined()
  })
})

describe('mergeComments', () => {
  it('ajoute les commentaires et réponses de l\'autre copie, une seule fois', () => {
    const { d, id } = withOne()
    const reviewed = addReply(addComment(d, 'p2', { x: 1, y: 1, author: 'Prof', text: 'Page 2 à revoir' }, 3000).doc, 'p1', id, 'Prof', 'Merci', 3500)
    const r = mergeComments(d, reviewed)
    expect(r).toMatchObject({ addedComments: 1, addedReplies: 1, resolved: 0 })
    expect(r.doc.pages[1].comments![0].text).toBe('Page 2 à revoir')
    const again = mergeComments(r.doc, reviewed)
    expect(again).toMatchObject({ addedComments: 0, addedReplies: 0, resolved: 0 })
    expect(again.doc).toEqual(r.doc)
  })

  it('un commentaire traité dans l\'autre copie le devient aussi ici ; le texte local est gardé', () => {
    const { d, id } = withOne()
    const theirs = setResolved(editComment(d, 'p1', id, 'Texte modifié ailleurs'), 'p1', id, true)
    const r = mergeComments(d, theirs)
    expect(r.resolved).toBe(1)
    expect(r.doc.pages[0].comments![0]).toMatchObject({ text: 'Source à citer', resolved: true })
  })

  it('ignore les commentaires d\'une page qui n\'existe pas ici', () => {
    const other = addComment(doc(3), 'p3', { x: 0, y: 0, author: 'a', text: 'x' }).doc
    expect(mergeComments(doc(2), other).addedComments).toBe(0)
  })
})

describe('divers', () => {
  it('clearComments retire tout', () => {
    const { d } = withOne()
    expect(allComments(clearComments(d))).toEqual([])
  })

  it('commentsAsText liste les commentaires et leurs réponses', () => {
    const { d, id } = withOne()
    const text = commentsAsText(addReply(setResolved(d, 'p1', id, true), 'p1', id, 'Léo', 'Fait', 2000), { page: 'Page', resolved: 'traité', reply: '↳' }, 'fr')
    expect(text).toContain('1. Page 1 — Mme Martin')
    expect(text).toContain('traité')
    expect(text).toContain('   Source à citer')
    expect(text).toContain('↳ Léo')
    expect(text).toContain('Fait')
  })
})
