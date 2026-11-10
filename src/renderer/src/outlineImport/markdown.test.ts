import { describe, expect, it } from 'vitest'
import { parseMarkdown, stripInline } from './markdown'

const blocks = (md: string, plain = false) => parseMarkdown(md, { plain }).blocks

describe('texte d’une ligne Markdown', () => {
  it('retire l’emphase, le code, les liens et les balises, garde le texte', () => {
    expect(stripInline('Un **mot** en _gras_ et *italique* avec `code`')).toBe('Un mot en gras et italique avec code')
    expect(stripInline('Voir [le site](https://exemple.fr) et ![logo](a.png) ici')).toBe('Voir le site et ici')
    expect(stripInline('a<br>b <span class="x">c</span> <!-- note --> d')).toBe('a b c d')
    expect(stripInline('~~barré~~ &amp; &lt;tag&gt; &#233;')).toBe('barré & <tag> é')
  })

  it('ne touche pas aux soulignés et astérisques au milieu d’un mot ou d’un calcul', () => {
    expect(stripInline('la variable snake_case_name')).toBe('la variable snake_case_name')
    expect(stripInline('2*3*4 = 24')).toBe('2*3*4 = 24')
    expect(stripInline('prix : 5 * 3')).toBe('prix : 5 * 3')
  })

  it('respecte les caractères échappés', () => {
    expect(stripInline('1\\. pas une liste, \\*pas gras\\*')).toBe('1. pas une liste, *pas gras*')
  })
})

describe('Markdown vers un plan', () => {
  it('lit les titres, les paragraphes et joint les lignes d’un même paragraphe', () => {
    expect(blocks('# Titre\n\nPremière ligne\nsuite de la phrase.\n\n## Sous-titre\n\nAutre paragraphe.')).toEqual([
      { kind: 'heading', level: 1, text: 'Titre' },
      { kind: 'para', text: 'Première ligne suite de la phrase.' },
      { kind: 'heading', level: 2, text: 'Sous-titre' },
      { kind: 'para', text: 'Autre paragraphe.' }
    ])
  })

  it('lit les titres soulignés et le saut de page « --- »', () => {
    expect(blocks('Grand titre\n===========\n\nPetit\n-----\n\ntexte\n\n---\n\nsuite')).toEqual([
      { kind: 'heading', level: 1, text: 'Grand titre' },
      { kind: 'heading', level: 2, text: 'Petit' },
      { kind: 'para', text: 'texte' },
      { kind: 'break' },
      { kind: 'para', text: 'suite' }
    ])
  })

  it('lit les listes à puces et numérotées, avec leurs niveaux, et les tâches', () => {
    expect(blocks('- un\n- deux\n  - sous-deux\n    - sous-sous\n- trois\n\n1. premier\n2) second\n\n- [ ] à faire\n- [x] fait')).toEqual([
      { kind: 'item', level: 0, ordered: false, text: 'un' },
      { kind: 'item', level: 0, ordered: false, text: 'deux' },
      { kind: 'item', level: 1, ordered: false, text: 'sous-deux' },
      { kind: 'item', level: 2, ordered: false, text: 'sous-sous' },
      { kind: 'item', level: 0, ordered: false, text: 'trois' },
      { kind: 'item', level: 0, ordered: true, text: 'premier' },
      { kind: 'item', level: 0, ordered: true, text: 'second' },
      { kind: 'item', level: 0, ordered: false, text: 'à faire' },
      { kind: 'item', level: 0, ordered: false, text: 'fait' }
    ])
  })

  it('un retrait de quatre espaces sous un élément à un seul niveau reste au niveau suivant', () => {
    const b = blocks('- a\n    - b\n        - c\n')
    expect(b.map((x) => (x.kind === 'item' ? x.level : -1))).toEqual([0, 1, 2])
  })

  it('une ligne en retrait qui suit un élément le complète', () => {
    expect(blocks('- une longue\n  phrase coupée\n- autre')).toEqual([
      { kind: 'item', level: 0, ordered: false, text: 'une longue phrase coupée' },
      { kind: 'item', level: 0, ordered: false, text: 'autre' }
    ])
  })

  it('reprend les images (adresse et texte alternatif) et le texte autour', () => {
    expect(blocks('Légende ![schéma du cycle](img/cycle.png) fin\n\n![](data:image/png;base64,AAAA)')).toEqual([
      { kind: 'para', text: 'Légende fin' },
      { kind: 'image', src: 'img/cycle.png', alt: 'schéma du cycle' },
      { kind: 'image', src: 'data:image/png;base64,AAAA' }
    ])
  })

  it('convertit un tableau en une ligne de texte par rangée et le compte', () => {
    const o = parseMarkdown('| Nom | Note |\n|---|:---:|\n| Léa | 18 |\n| Tom | 15 |\n\nsuite')
    expect(o.blocks).toEqual([
      { kind: 'para', text: 'Nom | Note' },
      { kind: 'para', text: 'Léa | 18' },
      { kind: 'para', text: 'Tom | 15' },
      { kind: 'para', text: 'suite' }
    ])
    expect(o.notes.tables).toBe(1)
  })

  it('un bloc de code devient un paragraphe qui garde ses lignes ; une citation un paragraphe', () => {
    expect(blocks('```js\nlet a = 1\nlet b = 2\n```\n\n> citation\n> sur deux lignes')).toEqual([
      { kind: 'para', text: 'let a = 1\nlet b = 2' },
      { kind: 'para', text: 'citation sur deux lignes' }
    ])
  })

  it('lit le titre de l’en-tête YAML sans l’afficher comme contenu', () => {
    const o = parseMarkdown('---\ntitle: "Mon cours"\nauthor: moi\n---\n\n# Intro\n\ntexte')
    expect(o.title).toBe('Mon cours')
    expect(o.blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Intro' })
  })

  it('« --- » en première ligne sans fermeture n’est pas un en-tête', () => {
    expect(blocks('---\n\ntexte')).toEqual([{ kind: 'break' }, { kind: 'para', text: 'texte' }])
  })

  it('ignore le BOM et les fins de ligne Windows, et un fichier vide ne donne rien', () => {
    expect(blocks('﻿# T\r\n\r\ntexte\r\n')).toEqual([{ kind: 'heading', level: 1, text: 'T' }, { kind: 'para', text: 'texte' }])
    expect(parseMarkdown('').blocks).toEqual([])
    expect(parseMarkdown('   \n\n  ').blocks).toEqual([])
  })

  it('coupe un bloc démesuré', () => {
    const b = blocks('a'.repeat(20000))
    expect(b).toHaveLength(1)
    expect(b[0].kind === 'para' && b[0].text.length).toBe(5000)
  })
})

describe('texte brut', () => {
  it('chaque ligne est un paragraphe, les puces et les titres # sont reconnus', () => {
    expect(blocks('# Titre\nligne un\nligne deux\n\n- puce\n* autre', true)).toEqual([
      { kind: 'heading', level: 1, text: 'Titre' },
      { kind: 'para', text: 'ligne un' },
      { kind: 'para', text: 'ligne deux' },
      { kind: 'item', level: 0, ordered: false, text: 'puce' },
      { kind: 'item', level: 0, ordered: false, text: 'autre' }
    ])
  })

  it('la suite d’une longue ligne (coupée par un éditeur) rejoint son paragraphe', () => {
    const long = 'Ceci est une très longue ligne de texte qui a été coupée par un éditeur à soixante-dix'
    expect(blocks(`${long}\nsigns de largeur.\nAutre ligne`, true)).toEqual([
      { kind: 'para', text: `${long} signs de largeur.` },
      { kind: 'para', text: 'Autre ligne' }
    ])
  })

  it('n’interprète ni l’emphase, ni les tableaux, ni « --- »', () => {
    expect(blocks('a --- b\n---\n| x | y |', true)).toEqual([
      { kind: 'para', text: 'a --- b' },
      { kind: 'para', text: '---' },
      { kind: 'para', text: '| x | y |' }
    ])
  })
})
