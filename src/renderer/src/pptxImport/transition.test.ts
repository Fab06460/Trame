import { DOMParser } from '@xmldom/xmldom'
import { beforeAll, describe, expect, it } from 'vitest'
import { readTransition } from '@/pptxImport/transition'
import { parseXml, setXmlParser } from '@/pptxImport/xml'

const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'
const sld = (inner: string) => parseXml(`<p:sld ${NS}><p:cSld/>${inner}</p:sld>`)

beforeAll(() => setXmlParser((t) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document))

describe('readTransition', () => {
  it('pas de transition : aucune', () => {
    expect(readTransition(sld(''))).toBe('none')
    expect(readTransition(null)).toBe('none')
  })
  it('effets simples', () => {
    expect(readTransition(sld('<p:transition spd="med"><p:fade/></p:transition>'))).toBe('fade')
    expect(readTransition(sld('<p:transition><p:push dir="l"/></p:transition>'))).toBe('slide')
    expect(readTransition(sld('<p:transition><p:cover dir="r"/></p:transition>'))).toBe('cover')
    expect(readTransition(sld('<p:transition><p:zoom dir="in"/></p:transition>'))).toBe('zoom')
    expect(readTransition(sld('<p:transition/>'))).toBe('none')
  })
  it('un son associé n\'est pas un effet', () => {
    expect(readTransition(sld('<p:transition><p:sndAc/><p:push dir="u"/></p:transition>'))).toBe('slide')
  })
  it('PowerPoint récent : le repli de AlternateContent est lu, pas l\'effet moderne', () => {
    const xml = '<mc:AlternateContent><mc:Choice Requires="p14"><p:transition spd="slow" p14:dur="2000"><p14:vortex dir="r"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:push/></p:transition></mc:Fallback></mc:AlternateContent>'
    expect(readTransition(sld(xml))).toBe('slide')
  })
  it('un effet moderne sans repli lisible devient un fondu', () => {
    expect(readTransition(sld('<mc:AlternateContent><mc:Choice Requires="p14"><p:transition><p14:vortex/></p:transition></mc:Choice></mc:AlternateContent>'))).toBe('fade')
  })
})
