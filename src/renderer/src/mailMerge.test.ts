import { describe, expect, it } from 'vitest'
import { DEFAULT_QR, qrElements, qrMatrix, qrPath } from '@/qr'
import type { TrameDocument, TrameElement } from '@/types'
import { cleanSettings, decodeCsv, imageFieldsUsed, sanitizeImageField, detectDelimiter, fieldsIn, fieldsUsed, fillText, mergeDocument, parseCsv, rowFileNames, sanitizeMergeData, toMergeData, unknownFields, unusedColumns, MAX_MERGE_ROWS } from './mailMerge'

const text = (id: string, t: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'text', x: 0, y: 0, width: 100, height: 30, rotation: 0, opacity: 1, fill: '#000', text: t, ...extra })
const doc = (): TrameDocument => ({
  version: 2,
  name: 'Diplôme',
  width: 800,
  height: 600,
  pages: [
    { id: 'p1', background: '#fff', elements: [text('a', 'Bravo {{Prénom}} {{ nom }} !', { groupId: 'g' }), text('b', 'Classe {{classe}}', { groupId: 'g' })] },
    { id: 'p2', background: '#fff', elements: [text('c', 'Verso {{Prénom}}')] }
  ]
})
const data = { columns: ['Prénom', 'Nom', 'Classe'], rows: [['Ada', 'Lovelace', '6A'], ['Alan', 'Turing', '6B']] }

describe('lecture du CSV', () => {
  it('reconnaît le séparateur (point-virgule d\'Excel français, virgule, tabulation)', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('"a;b",c,d')).toBe(',')
  })
  it('gère guillemets, guillemets doublés, retours à la ligne dans une cellule et fins de ligne Windows', () => {
    expect(parseCsv('a;b\r\n"x;1";"dit ""oui"""\r\n"l1\nl2";z\r\n')).toEqual([['a', 'b'], ['x;1', 'dit "oui"'], ['l1\nl2', 'z']])
  })
  it('garde les cellules vides et la dernière ligne sans fin de ligne', () => {
    expect(parseCsv('a,b,c\n1,,3\n4,5,')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '']])
  })
  it('décode UTF-8 (avec BOM), UTF-16 et, à défaut, Windows-1252', () => {
    const utf8 = new TextEncoder().encode('Élève;Né')
    expect(decodeCsv(utf8)).toBe('Élève;Né')
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe('Élève;Né')
    expect(decodeCsv(new Uint8Array([0xc9, 0x6c, 0xe8, 0x76, 0x65]))).toBe('Élève') // Windows-1252, UTF-8 invalide
    expect(decodeCsv(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00]))).toBe('Aé')
  })
})

describe('données de publipostage', () => {
  it('la première ligne donne les champs ; lignes vides ignorées, lignes complétées', () => {
    const r = toMergeData([['Nom', 'Note'], ['Ada', '18'], ['', ''], ['Alan']])!
    expect(r.data).toEqual({ columns: ['Nom', 'Note'], rows: [['Ada', '18'], ['Alan', '']] })
    expect(r.truncated).toBe(false)
  })
  it('en-têtes : vides nommés, doublons suffixés, accolades retirées', () => {
    expect(toMergeData([['Nom', 'nom', '', '{x}'], ['a', 'b', 'c', 'd']])!.data.columns).toEqual(['Nom', 'nom 2', 'Colonne 3', 'x'])
  })
  it('refuse un tableau sans en-têtes et signale les limites', () => {
    expect(toMergeData([])).toBeNull()
    expect(toMergeData([['', ''], ['a', 'b']])).toBeNull()
    const big = toMergeData([['a'], ...Array.from({ length: MAX_MERGE_ROWS + 5 }, (_, i) => [String(i)])])!
    expect(big.data.rows).toHaveLength(MAX_MERGE_ROWS)
    expect(big.truncated).toBe(true)
  })
  it('lecture d\'un fichier : données invalides retirées, valeurs bornées', () => {
    const bad: { mailMerge?: unknown } = { mailMerge: { columns: 'x', rows: [] } }
    sanitizeMergeData(bad)
    expect(bad.mailMerge).toBeUndefined()
    const ok: { mailMerge?: unknown } = { mailMerge: { columns: ['A', 'A'], rows: [['1', 2], 'oups', ['x'.repeat(900)]] } }
    sanitizeMergeData(ok)
    const m = ok.mailMerge as { columns: string[]; rows: string[][] }
    expect(m.columns).toEqual(['A', 'A 2'])
    expect(m.rows[0]).toEqual(['1', ''])
    expect(m.rows[1][0]).toHaveLength(500)
    const empty: { mailMerge?: unknown } = { mailMerge: { columns: ['A'], rows: [] } }
    sanitizeMergeData(empty)
    expect(empty.mailMerge).toBeUndefined()
  })
})

describe('champs', () => {
  it('trouve les champs sans doublon (espaces et casse ignorés)', () => {
    expect(fieldsIn('{{Nom}} et {{ nom }} puis {{Classe}} {{}} {x}')).toEqual(['Nom', 'Classe'])
  })
  it('remplace par la valeur de la ligne, champ inconnu laissé tel quel', () => {
    expect(fillText('Bravo {{prénom}} {{ NOM }} ({{age}})', data.columns, data.rows[0])).toBe('Bravo Ada Lovelace ({{age}})')
  })
  it('une valeur contenant « {{ » n\'est pas réinterprétée', () => {
    expect(fillText('{{a}}', ['a', 'b'], ['{{b}}', 'X'])).toBe('{{b}}')
  })
  it('champs utilisés, inconnus et colonnes inutilisées', () => {
    expect(fieldsUsed(doc())).toEqual(['Prénom', 'nom', 'classe'])
    expect(unknownFields(doc(), ['Prénom', 'Nom'])).toEqual(['classe'])
    expect(unusedColumns(doc(), ['Prénom', 'Nom', 'Classe', 'Photo'])).toEqual(['Photo'])
  })
})

describe('document fusionné', () => {
  it('une série de pages par ligne, textes remplis, identifiants neufs, modèle intact', () => {
    const d = doc()
    const m = mergeDocument(d, data, [0, 1])
    expect(m.pages).toHaveLength(4)
    expect(m.pages[0].elements[0].text).toBe('Bravo Ada Lovelace !')
    expect(m.pages[1].elements[0].text).toBe('Verso Ada')
    expect(m.pages[2].elements[0].text).toBe('Bravo Alan Turing !')
    expect(new Set(m.pages.map((p) => p.id)).size).toBe(4)
    expect(d.pages[0].elements[0].text).toBe('Bravo {{Prénom}} {{ nom }} !')
    expect(d.pages[0].elements[0].id).toBe('a')
  })
  it('les groupes restent groupés dans une série et sont distincts d\'une série à l\'autre', () => {
    const m = mergeDocument(doc(), data, [0, 1])
    const g0 = m.pages[0].elements.map((e) => e.groupId)
    const g1 = m.pages[2].elements.map((e) => e.groupId)
    expect(g0[0]).toBe(g0[1])
    expect(g1[0]).toBe(g1[1])
    expect(g0[0]).not.toBe(g1[0])
  })
  it('les données ne suivent pas dans le document fusionné', () => {
    expect('mailMerge' in mergeDocument({ ...doc(), mailMerge: data }, data, [0])).toBe(false)
  })
})

describe('noms de fichiers', () => {
  it('colonne choisie, caractères interdits remplacés, doublons suffixés', () => {
    const d = { columns: ['Nom'], rows: [['Ada/Lovelace'], ['Ada/Lovelace'], ['']] }
    expect(rowFileNames('Diplôme', d, [0, 1, 2], 0, 'pdf')).toEqual(['Ada-Lovelace.pdf', 'Ada-Lovelace-2.pdf', 'Diplôme-3.pdf'])
  })
  it('sans colonne : nom du document et numéro de ligne', () => {
    expect(rowFileNames('Badge', { columns: ['a'], rows: [['x'], ['y']] }, [0, 1], null, 'pdf')).toEqual(['Badge-1.pdf', 'Badge-2.pdf'])
  })
})

describe('choix des lignes', () => {
  it('plage de lignes (à partir de 1) : indices triés sans doublon, erreurs expliquées', async () => {
    const { parseRowRange } = await import('./mailMerge')
    expect(parseRowRange('2-3, 1, 3', 5)).toEqual({ ok: true, rows: [0, 1, 2] })
    expect(parseRowRange('', 5).ok).toBe(false)
    expect(parseRowRange('abc', 5).ok).toBe(false)
    expect(parseRowRange('6', 5).ok).toBe(false)
    expect(parseRowRange('3-2', 5).ok).toBe(false)
    expect(parseRowRange('0', 5).ok).toBe(false)
  })
  it('valeurs distinctes d\'une colonne et filtre', async () => {
    const { distinctValues, selectRows } = await import('./mailMerge')
    const d = { columns: ['Nom', 'Classe'], rows: [['a', '6B'], ['b', '6A'], ['c', '6A'], ['d', '']] }
    expect(distinctValues(d, 1)).toEqual(['6A', '6B'])
    expect(selectRows(d, null, null)).toEqual([0, 1, 2, 3])
    expect(selectRows(d, null, { column: 1, value: '6A' })).toEqual([1, 2])
    expect(selectRows(d, [0, 2, 9], { column: 1, value: '6A' })).toEqual([2])
    expect(selectRows(d, [3, 1], null)).toEqual([3, 1])
  })
})

describe('choix mémorisés avec le document', () => {
  const ok = { mode: 'single', nameColumn: 1, sheet: true, layout: { paper: 'letter', landscape: false, cols: 3, rows: 10, marginMm: 5, gapMm: 1, cutMarks: false, mirrorBacks: true, fillCell: true, offsetXMm: 1.5, offsetYMm: -0.5, preset: 'letter-5160' } }
  it('des choix valides sont conservés tels quels', () => {
    expect(cleanSettings(ok, 3)).toEqual(ok)
  })
  it('valeurs hors bornes ramenées aux bornes, types faux remplacés par les valeurs par défaut', () => {
    const s = cleanSettings({ mode: 'x', nameColumn: 9, sheet: 'oui', layout: { paper: 'a3', cols: 99, rows: -4, marginMm: 'a', offsetXMm: 500, preset: '<script>' } }, 3)!
    expect(s.mode).toBe('single')
    expect(s.nameColumn).toBeNull()
    expect(s.sheet).toBe(false)
    expect(s.layout).toMatchObject({ paper: 'a4', cols: 10, rows: 1, marginMm: 10, offsetXMm: 20, cutMarks: true })
    expect(s.layout.preset).toBeUndefined()
  })
  it('illisibles : absents', () => {
    expect(cleanSettings(undefined, 2)).toBeUndefined()
    expect(cleanSettings('x', 2)).toBeUndefined()
  })
  it('lus avec le tableau, et retirés avec lui', () => {
    const doc: { mailMerge?: unknown } = { mailMerge: { columns: ['a', 'b'], rows: [['1', '2']], settings: ok } }
    sanitizeMergeData(doc)
    expect((doc.mailMerge as { settings?: unknown }).settings).toEqual({ ...ok, nameColumn: 1 })
    const empty: { mailMerge?: unknown } = { mailMerge: { columns: ['a'], rows: [], settings: ok } }
    sanitizeMergeData(empty)
    expect(empty.mailMerge).toBeUndefined()
  })
})

describe('champs image', () => {
  const img = (extra: Partial<TrameElement> = {}): TrameElement => ({ id: 'i', type: 'image', x: 0, y: 0, width: 200, height: 200, rotation: 0, opacity: 1, fill: '#000', src: 'data:image/png;base64,AAAA', imageField: 'Photo', ...extra })
  const doc = { version: 2, name: 'd', width: 400, height: 300, pages: [{ id: 'p', background: '#fff', elements: [img()] }] } as unknown as TrameDocument
  const data = { columns: ['Nom', 'photo'], rows: [['Ada', 'ada.jpg'], ['Alan', 'inconnue.jpg']] }
  it('la colonne est trouvée sans tenir compte de la casse, et l\'image remplacée', () => {
    const asked: string[] = []
    const out = mergeDocument(doc, data, [0], undefined, (_t, value) => {
      asked.push(value)
      return { src: 'data:image/jpeg;base64,BBBB' }
    })
    expect(asked).toEqual(['ada.jpg'])
    expect(out.pages[0].elements[0].src).toBe('data:image/jpeg;base64,BBBB')
    expect(out.pages[0].elements[0].imageField).toBe('Photo')
  })
  it('image introuvable (le remplaçant rend null) : celle du modèle reste', () => {
    const out = mergeDocument(doc, data, [1], undefined, () => null)
    expect(out.pages[0].elements[0].src).toBe('data:image/png;base64,AAAA')
  })
  it('sans remplaçant, rien ne change', () => {
    expect(mergeDocument(doc, data, [0]).pages[0].elements[0].src).toBe('data:image/png;base64,AAAA')
  })
  it('les colonnes d\'images comptent comme utilisées, et une colonne absente est signalée', () => {
    expect(imageFieldsUsed(doc)).toEqual(['Photo'])
    expect(fieldsUsed(doc)).toEqual(['Photo'])
    expect(unusedColumns(doc, data.columns)).toEqual(['Nom'])
    expect(unknownFields(doc, ['Nom'])).toEqual(['Photo'])
  })
  it('lecture : champ gardé pour une image, nettoyé, retiré ailleurs', () => {
    const ok: { type: string; imageField?: unknown } = { type: 'image', imageField: '  {Photo}  élève ' }
    sanitizeImageField(ok)
    expect(ok.imageField).toBe('Photo élève')
    const text: { type: string; imageField?: unknown } = { type: 'text', imageField: 'x' }
    sanitizeImageField(text)
    expect('imageField' in text).toBe(false)
    const bad: { type: string; imageField?: unknown } = { type: 'image', imageField: 42 }
    sanitizeImageField(bad)
    expect('imageField' in bad).toBe(false)
  })
})

describe('QR codes', () => {
  const links = { columns: ['Prénom', 'Lien'], rows: [['Ana', 'https://example.com/ana'], ['Bob', 'https://example.com/bob'], ['Cléo', '']] }
  /** un QR code (fond + modules) pris entre deux textes, pour vérifier aussi le rang dans la pile */
  const qrDoc = (content = '{{lien}}', over: { rotation?: number; opacity?: number } = {}): TrameDocument => {
    const res = qrElements({ ...DEFAULT_QR, text: content }, { x: 100, y: 50, width: 300, height: 300 }, { groupId: 'g', rotation: over.rotation, keep: over.opacity === undefined ? {} : { opacity: over.opacity } })!
    return { version: 2, name: 'd', width: 1000, height: 1000, pages: [{ id: 'p', background: '#fff', elements: [text('before', 'Avant'), ...res.elements, text('after', 'Après')] }] }
  }
  const qrOf = (d: TrameDocument, page: number): TrameElement[] => d.pages[page].elements.filter((e) => e.qr || e.type === 'path')

  it('les champs d\'un QR code comptent parmi les champs du document', () => {
    expect(fieldsUsed(qrDoc())).toEqual(['lien'])
    expect(unknownFields(qrDoc(), ['Prénom'])).toEqual(['lien'])
    expect(unknownFields(qrDoc(), ['Prénom', 'Lien'])).toEqual([])
    expect(unusedColumns(qrDoc(), ['Prénom', 'Lien'])).toEqual(['Prénom'])
  })

  it('chaque ligne donne son QR code : le contenu rempli (casse du champ indifférente), le dessin des modules refait', () => {
    const merged = mergeDocument(qrDoc(), links, [0, 1])
    const [a, b] = [qrOf(merged, 0), qrOf(merged, 1)]
    expect(a[0].qr!.text).toBe('https://example.com/ana')
    expect(b[0].qr!.text).toBe('https://example.com/bob')
    expect(a[1].path).not.toBe(b[1].path)
    expect(a[1].path).toBe(qrPath(qrMatrix('https://example.com/ana', 'M')!))
  })

  it('remplit aussi un champ au milieu d\'un texte', () => {
    expect(qrOf(mergeDocument(qrDoc('{{Lien}}?eleve={{Prénom}}'), links, [1]), 0)[0].qr!.text).toBe('https://example.com/bob?eleve=Bob')
  })

  it('garde le cadre, le rang dans la pile, la rotation et l\'opacité', () => {
    const els = mergeDocument(qrDoc('{{lien}}', { rotation: 30, opacity: 0.5 }), links, [0]).pages[0].elements
    expect(els.map((e) => e.text ?? (e.qr ? 'QR' : 'modules'))).toEqual(['Avant', 'QR', 'modules', 'Après'])
    expect(els[1]).toMatchObject({ x: 100, y: 50, width: 300, height: 300, rotation: 30, opacity: 0.5 })
    expect(els[2]).toMatchObject({ rotation: 30, opacity: 0.5 })
    expect(els[1].groupId).toBe(els[2].groupId)
    expect(els[1].groupId).not.toBe('g')
  })

  it('une cellule vide retire le QR code de la fiche (mieux vaut rien qu\'un code qui mène ailleurs)', () => {
    expect(mergeDocument(qrDoc(), links, [2]).pages[0].elements.map((e) => e.text)).toEqual(['Avant', 'Après'])
  })

  it('un contenu sans champ n\'est pas redessiné ; un champ inconnu reste tel quel dans le QR code', () => {
    const fixed = qrDoc('https://example.com')
    expect(qrOf(mergeDocument(fixed, links, [0]), 0)[1].path).toBe(qrOf(fixed, 0)[1].path)
    expect(qrOf(mergeDocument(qrDoc('{{inconnu}}'), links, [0]), 0)[0].qr!.text).toBe('{{inconnu}}')
  })

  it('les QR codes de deux fiches ne partagent ni élément ni groupe', () => {
    const merged = mergeDocument(qrDoc(), links, [0, 1])
    const ids = merged.pages.flatMap((p) => p.elements.map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(qrOf(merged, 0)[0].groupId).not.toBe(qrOf(merged, 1)[0].groupId)
  })
})
