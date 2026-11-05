import { describe, expect, it } from 'vitest'
import {
  MAX_TAGS_PER_IMAGE, MAX_TAG_LENGTH, allTags, isMediaFile, isSafeRelative, mediaMime, normalizeTag, normalizeTags, parseMediaState, searchMedia, withTags,
  type MediaItem
} from './mediaLibrary'

const item = (path: string, tags: string[] = []): MediaItem => ({ path, name: path.split('/').pop()!, size: 1, tags })

describe('fichiers images', () => {
  it('reconnaît les images (casse ignorée) et écarte les fichiers cachés et autres formats', () => {
    for (const n of ['a.png', 'B.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg']) expect(isMediaFile(n), n).toBe(true)
    for (const n of ['.cache.png', 'notes.txt', 'archive.zip', 'sans-extension', 'photo.png.exe', 'a.tiff']) expect(isMediaFile(n), n).toBe(false)
  })
  it('donne le type MIME', () => {
    expect([mediaMime('a.jpg'), mediaMime('a.JPEG'), mediaMime('a.png'), mediaMime('a.svg'), mediaMime('a.webp')]).toEqual(['image/jpeg', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'])
  })
})

describe('isSafeRelative', () => {
  it('accepte un chemin relatif simple', () => {
    expect(isSafeRelative('a.png')).toBe(true)
    expect(isSafeRelative('vacances/2026/plage.jpg')).toBe(true)
  })
  it.each(['', '/etc/passwd', '../secret.png', 'a/../../b.png', 'a/./b.png', 'a//b.png', 'C:\\x.png', 'C:/x.png', 'a\\b.png', 'a\0.png', 'x'.repeat(1025), 12, null, undefined])(
    'refuse %j (le renderer ne sort jamais du dossier choisi)',
    (p) => expect(isSafeRelative(p)).toBe(false)
  )
})

describe('étiquettes', () => {
  it('nettoie un nom', () => {
    expect(normalizeTag('  #  Logo   école ')).toBe('Logo école')
    expect(normalizeTag('x'.repeat(100))).toHaveLength(MAX_TAG_LENGTH)
    for (const bad of ['', '   ', '#', '##  ', 5, null]) expect(normalizeTag(bad)).toBeNull()
  })
  it('supprime les doublons (casse et accents ignorés), garde la première graphie et borne le nombre', () => {
    expect(normalizeTags(['Équipe', 'equipe', 'EQUIPE', 'logo', ' ', 3])).toEqual(['Équipe', 'logo'])
    expect(normalizeTags(Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS_PER_IMAGE)
    expect(normalizeTags('pas une liste')).toEqual([])
  })
})

describe('état enregistré', () => {
  it('se relit à l\'identique', () => {
    const state = { folder: '/Users/x/Images', tags: { 'a.png': ['logo'], 'b/c.jpg': ['équipe', 'photo'] } }
    expect(parseMediaState(JSON.stringify(state))).toEqual(state)
  })
  it('écarte le contenu illisible ou douteux', () => {
    expect(parseMediaState('pas du json')).toEqual({ folder: null, tags: {} })
    expect(parseMediaState('[]')).toEqual({ folder: null, tags: {} })
    expect(parseMediaState(JSON.stringify({ folder: 3, tags: [] }))).toEqual({ folder: null, tags: {} })
    expect(parseMediaState(JSON.stringify({ folder: '/d', tags: { '../x.png': ['a'], 'ok.png': ['b'], 'vide.png': [], 'n.png': 'oups' } }))).toEqual({ folder: '/d', tags: { 'ok.png': ['b'] } })
  })
  it('remplace les étiquettes d\'une image, ou supprime l\'entrée quand il n\'en reste pas', () => {
    const base = { folder: '/d', tags: { 'a.png': ['x'] } }
    expect(withTags(base, 'a.png', ['y', 'Y', 'z']).tags).toEqual({ 'a.png': ['y', 'z'] })
    expect(withTags(base, 'a.png', []).tags).toEqual({})
    expect(withTags(base, 'b.png', ['q']).tags).toEqual({ 'a.png': ['x'], 'b.png': ['q'] })
    expect(base.tags).toEqual({ 'a.png': ['x'] }) // l'original n'est pas modifié
  })
})

describe('searchMedia', () => {
  const items = [item('logo-école.png', ['marque']), item('chat.jpg', ['animal', 'maison']), item('vacances/Plage 10.jpg', ['été']), item('vacances/Plage 2.jpg', ['été', 'animal'])]
  it('trie par nom, les nombres dans l\'ordre naturel', () => {
    expect(searchMedia(items, '', null).map((m) => m.path)).toEqual(['chat.jpg', 'logo-école.png', 'vacances/Plage 2.jpg', 'vacances/Plage 10.jpg'])
  })
  it('cherche dans le nom, le dossier et les étiquettes, sans casse ni accents', () => {
    expect(searchMedia(items, 'ECOLE', null).map((m) => m.path)).toEqual(['logo-école.png'])
    expect(searchMedia(items, 'ete', null)).toHaveLength(2)
    expect(searchMedia(items, 'vacances plage', null)).toHaveLength(2)
    expect(searchMedia(items, 'maison', null).map((m) => m.path)).toEqual(['chat.jpg'])
    expect(searchMedia(items, 'zzz', null)).toEqual([])
  })
  it('filtre par étiquette, cumulable avec la recherche', () => {
    expect(searchMedia(items, '', 'Animal').map((m) => m.path)).toEqual(['chat.jpg', 'vacances/Plage 2.jpg'])
    expect(searchMedia(items, 'plage', 'animal').map((m) => m.path)).toEqual(['vacances/Plage 2.jpg'])
  })
})

describe('allTags', () => {
  it('compte les étiquettes, les plus fréquentes d\'abord', () => {
    const items = [item('a.png', ['x', 'Y']), item('b.png', ['y']), item('c.png', ['y', 'z'])]
    expect(allTags(items)).toEqual([{ tag: 'Y', count: 3 }, { tag: 'x', count: 1 }, { tag: 'z', count: 1 }])
  })
})
