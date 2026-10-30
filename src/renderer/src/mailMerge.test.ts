import { describe, expect, it } from 'vitest'
import type { TrameDocument, TrameElement } from '@/types'
import { decodeCsv, detectDelimiter, fieldsIn, fieldsUsed, fillText, mergeDocument, parseCsv, rowFileNames, sanitizeMergeData, toMergeData, unknownFields, unusedColumns, MAX_MERGE_ROWS } from './mailMerge'

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
