import { DOMParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'
import { readNotes } from '@/pptxImport/notes'
import { parseXml, setXmlParser } from '@/pptxImport/xml'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const notes = (shapes: string) => parseXml(`<p:notes ${NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:notes>`)
const ph = (type: string, paras: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`
const para = (t: string) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

describe('readNotes', () => {
  it('reprend le corps de texte, un paragraphe par ligne', () => {
    expect(readNotes(notes(ph('body', para('Bonjour') + para('') + para('Merci'))))).toBe('Bonjour\n\nMerci')
  })
  it('ignore le numéro de page et la miniature', () => {
    expect(readNotes(notes(ph('sldNum', '<a:p><a:fld type="slidenum"><a:t>3</a:t></a:fld></a:p>') + ph('body', para('Seulement ça'))))).toBe('Seulement ça')
  })
  it('les sauts de ligne et les runs multiples sont recollés', () => {
    expect(readNotes(notes(ph('body', '<a:p><a:r><a:t>a</a:t></a:r><a:br/><a:r><a:t>b</a:t></a:r></a:p>')))).toBe('a\nb')
  })
  it('pas de notes : undefined', () => {
    expect(readNotes(null)).toBeUndefined()
    expect(readNotes(notes(ph('body', para('   '))))).toBeUndefined()
  })
})
