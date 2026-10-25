import { describe, expect, it } from 'vitest'
import { createFileInbox } from './fileInbox'

describe('fileInbox', () => {
  it('met en attente un fichier reçu avant que le renderer soit prêt (lancement par double-clic)', () => {
    const inbox = createFileInbox<string>()
    expect(inbox.push('a.trame')).toBeNull()
    expect(inbox.onRendererReady()).toBe('a.trame')
  })

  it('transmet immédiatement quand le renderer est prêt (application déjà ouverte)', () => {
    const inbox = createFileInbox<string>()
    inbox.onRendererReady()
    expect(inbox.push('b.trame')).toBe('b.trame')
  })

  it('ne rend un fichier en attente qu’une seule fois', () => {
    const inbox = createFileInbox<string>()
    inbox.push('a.trame')
    expect(inbox.onRendererReady()).toBe('a.trame')
    inbox.onRendererGone()
    expect(inbox.onRendererReady()).toBeNull()
  })

  it('plusieurs fichiers en attente : seul le dernier est conservé', () => {
    const inbox = createFileInbox<string>()
    inbox.push('a.trame')
    inbox.push('b.trame')
    expect(inbox.onRendererReady()).toBe('b.trame')
  })

  it('remet en attente pendant un rechargement de la page puis livre à la fin', () => {
    const inbox = createFileInbox<string>()
    inbox.onRendererReady()
    inbox.onRendererGone() // rechargement ou fenêtre fermée
    expect(inbox.push('c.trame')).toBeNull()
    expect(inbox.onRendererReady()).toBe('c.trame')
  })

  it('sans fichier en attente, rien n’est livré', () => {
    expect(createFileInbox<string>().onRendererReady()).toBeNull()
  })
})
