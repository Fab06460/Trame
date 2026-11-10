import { describe, expect, it } from 'vitest'
import { decodeText, resolveOutlineImages, type ImageDeps } from './images'
import { emptyOutline, type OutlineBlock } from './outline'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const img = (src: string, extra: Partial<OutlineBlock> = {}): OutlineBlock => ({ kind: 'image', src, ...extra }) as OutlineBlock
const outline = (blocks: OutlineBlock[]) => ({ ...emptyOutline(), blocks })
const deps = (files: Record<string, string>, ratio: number | null = 2): ImageDeps & { reads: string[] } => {
  const reads: string[] = []
  return { reads, read: async (ref) => (reads.push(ref), files[ref] ?? null), measure: async () => ratio }
}

describe('images d’un document Markdown', () => {
  it('lit les chemins relatifs, vérifie les data URL et mesure les proportions', async () => {
    const d = deps({ 'img/a.png': PNG })
    const o = await resolveOutlineImages(outline([img('img/a.png', { alt: 'A' }), img(PNG)]), d)
    expect(o.blocks).toEqual([
      { kind: 'image', src: PNG, alt: 'A', ratio: 2 },
      { kind: 'image', src: PNG, ratio: 2 }
    ])
    expect(d.reads).toEqual(['img/a.png'])
    expect(o.notes.skippedImages).toBe(0)
  })

  it('retire et compte une image distante, introuvable, illisible ou d’un format inconnu', async () => {
    const o = await resolveOutlineImages(
      outline([img('https://exemple.fr/x.png'), img('//cdn.exemple.fr/x.png'), img('absente.png'), img('data:image/svg+xml;base64,AAAA'), img('data:text/html;base64,AAAA'), img('ftp://x/y.png'), { kind: 'para', text: 'reste' }]),
      deps({})
    )
    expect(o.blocks).toEqual([{ kind: 'para', text: 'reste' }])
    expect(o.notes.skippedImages).toBe(6)
  })

  it('ne lit jamais une adresse distante (aucun accès au disque pour elle)', async () => {
    const d = deps({})
    await resolveOutlineImages(outline([img('https://exemple.fr/x.png'), img('file:///etc/passwd')]), d)
    expect(d.reads).toEqual([])
  })

  it('une image dont on ne peut pas mesurer les proportions est retirée', async () => {
    const o = await resolveOutlineImages(outline([img('a.png')]), deps({ 'a.png': PNG }, null))
    expect(o.blocks).toEqual([])
    expect(o.notes.skippedImages).toBe(1)
  })

  it('garde les proportions déjà connues sans les mesurer et plafonne le nombre d’images', async () => {
    const many = Array.from({ length: 70 }, () => img(PNG, { ratio: 1.5 } as Partial<OutlineBlock>))
    const o = await resolveOutlineImages(outline(many), deps({}, null))
    expect(o.blocks).toHaveLength(60)
    expect(o.notes.skippedImages).toBe(10)
  })

  it('une lecture qui échoue compte comme une image introuvable', async () => {
    const d: ImageDeps = { read: async () => { throw new Error('disque') }, measure: async () => 1 }
    const o = await resolveOutlineImages(outline([img('a.png')]), d)
    expect(o.blocks).toEqual([])
    expect(o.notes.skippedImages).toBe(1)
  })
})

describe('texte d’un fichier', () => {
  it('lit l’UTF-8 et se rabat sur Windows-1252', () => {
    expect(decodeText(new TextEncoder().encode('Élève à l’école'))).toBe('Élève à l’école')
    expect(decodeText(new Uint8Array([0xc9, 0x6c, 0xe8, 0x76, 0x65]))).toBe('Élève')
  })
})
