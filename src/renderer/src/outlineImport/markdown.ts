import { MAX_BLOCK_CHARS, MAX_ITEM_LEVEL, emptyOutline, type Outline } from './outline'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Texte brut d'une ligne Markdown : liens, emphase, code et balises HTML retirés (le texte d'un élément Trame a un seul style). */
export function stripInline(text: string): string {
  // un caractère échappé (\*, \_, \[…) ne fait plus partie d'aucune marque : on le met à l'abri, puis on le rend à la fin
  let s = text
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (_m, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
    .replace(/<!--.*?-->/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '') // une image au milieu d'une phrase est traitée à part (`extractImages`)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`+([^`]+)`+/g, '$1')
  // l'emphase ne s'ouvre ni ne se ferme au milieu d'un mot (snake_case, 2*3 restent tels quels)
  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2').replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
  s = s.replace(/(^|[^\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?=[^\w*]|$)/g, '$1$2').replace(/(^|[^\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?=[^\w_]|$)/g, '$1$2')
  s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
  return s.replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000)).replace(/\s+/g, ' ').trim()
}

const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g

/** Images d'une ligne : (texte alternatif, adresse). */
function extractImages(line: string): { alt: string; src: string }[] {
  return [...line.matchAll(IMAGE)].map((m) => ({ alt: stripInline(m[1]), src: m[2] }))
}

const clip = (s: string): string => (s.length > MAX_BLOCK_CHARS ? s.slice(0, MAX_BLOCK_CHARS) : s)

/** En-tête YAML au début du fichier : rend le titre et la position de la première ligne après l'en-tête. */
function frontMatter(lines: string[]): { title?: string; start: number } {
  if (lines[0]?.trim() !== '---') return { start: 0 }
  for (let i = 1; i < Math.min(lines.length, 60); i++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i])) {
      const t = lines.slice(1, i).map((l) => /^title\s*:\s*(.+)$/i.exec(l)?.[1]).find(Boolean)
      return { title: t ? stripInline(t.replace(/^["']|["']$/g, '')) : undefined, start: i + 1 }
    }
  }
  return { start: 0 }
}

const columns = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => stripInline(c))

/**
 * Markdown (et texte brut, avec `plain`) vers un plan : titres `#` et soulignés, listes (imbriquées, ordonnées, de tâches), paragraphes
 * (les lignes d'un même paragraphe se rejoignent), citations, blocs de code, tableaux (une ligne de texte par rangée), images, `---` qui
 * force un saut de page. En mode `plain`, seuls les titres `#`, les listes et les paragraphes comptent, et chaque ligne est un paragraphe
 * (sauf la suite d'une ligne longue, qu'un éditeur a coupée).
 */
export function parseMarkdown(source: string, options: { plain?: boolean } = {}): Outline {
  const plain = options.plain === true
  const out = emptyOutline()
  const lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const fm = plain ? { start: 0, title: undefined } : frontMatter(lines)
  if (fm.title) out.title = fm.title

  let para: string[] = []
  let fence: string | null = null
  let code: string[] = []
  let tableRows = 0
  let indents: number[] = [] // retraits des listes ouvertes : la profondeur d'un élément est son rang parmi eux
  let lastWasLongLine = false

  const flush = (): void => {
    if (!para.length) return
    const text = stripInline(para.join(plain ? ' ' : ' '))
    if (text) out.blocks.push({ kind: 'para', text: clip(text) })
    para = []
  }
  const endTable = (): void => {
    if (tableRows) out.notes.tables++
    tableRows = 0
  }
  const image = (src: string, alt: string): void => {
    out.blocks.push({ kind: 'image', src, ...(alt ? { alt } : {}) })
  }

  for (let i = fm.start; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.replace(/\t/g, '    ')

    if (fence !== null) {
      if (line.trim().startsWith(fence)) {
        fence = null
        const text = code.join('\n').trim()
        if (text) out.blocks.push({ kind: 'para', text: clip(text) })
        code = []
      } else code.push(line)
      continue
    }
    const open = !plain && /^ {0,3}(```+|~~~+)/.exec(line)
    if (open) {
      flush()
      endTable()
      fence = open[1]
      continue
    }

    if (!line.trim()) {
      flush()
      endTable()
      indents = []
      lastWasLongLine = false
      continue
    }

    const atx = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line)
    if (atx) {
      flush()
      endTable()
      indents = []
      const text = stripInline(atx[2])
      if (text) out.blocks.push({ kind: 'heading', level: atx[1].length, text: clip(text) })
      continue
    }

    if (!plain) {
      // titre souligné : « Titre » puis « ==== » ou « ---- »
      const underline = /^ {0,3}(=+|-+)\s*$/.exec(line)
      if (underline && para.length) {
        const text = stripInline(para.join(' '))
        para = []
        if (text) out.blocks.push({ kind: 'heading', level: underline[1][0] === '=' ? 1 : 2, text: clip(text) })
        continue
      }
      if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
        flush()
        endTable()
        indents = []
        out.blocks.push({ kind: 'break' })
        continue
      }
    }

    const item = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      endTable()
      const width = item[1].length
      while (indents.length && width < indents[indents.length - 1]) indents.pop()
      if (!indents.length || width > indents[indents.length - 1]) indents.push(width)
      const level = Math.min(MAX_ITEM_LEVEL, indents.length - 1)
      const body = item[3].replace(/^\[[ xX]\]\s+/, '')
      const imgs = plain ? [] : extractImages(body)
      const text = stripInline(body)
      if (text) out.blocks.push({ kind: 'item', level, ordered: /\d/.test(item[2]), text: clip(text) })
      for (const m of imgs) image(m.src, m.alt)
      continue
    }

    if (!plain) {
      // suite (retrait) d'un élément de liste : elle rejoint cet élément
      const last = out.blocks[out.blocks.length - 1]
      if (!para.length && last?.kind === 'item' && /^ {2,}\S/.test(line) && !/^\s*>/.test(line)) {
        last.text = clip(`${last.text} ${stripInline(line)}`.trim())
        continue
      }
      // tableau : « | a | b | » (la ligne « |---|---| » n'apporte rien)
      if (/^\s*\|.*\|\s*$/.test(line)) {
        flush()
        if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) {
          const cells = columns(line).filter((c) => c)
          if (cells.length) out.blocks.push({ kind: 'para', text: clip(cells.join(' | ')) })
        }
        tableRows++
        continue
      }
      const quote = /^\s*>\s?(.*)$/.exec(line)
      if (quote) {
        para.push(quote[1])
        continue
      }
      const imgs = extractImages(line)
      if (imgs.length) {
        const rest = stripInline(line)
        if (rest) para.push(line)
        flush()
        for (const m of imgs) image(m.src, m.alt)
        continue
      }
    }

    endTable()
    indents = []
    if (plain) {
      // chaque ligne est un paragraphe, sauf la suite d'une longue ligne (retour à la ligne automatique d'un éditeur)
      if (para.length && lastWasLongLine) para.push(line.trim())
      else {
        flush()
        para.push(line.trim())
      }
      lastWasLongLine = line.trim().length >= 70
    } else para.push(line.trim())
  }
  if (fence !== null) {
    const text = code.join('\n').trim()
    if (text) out.blocks.push({ kind: 'para', text: clip(text) })
  }
  flush()
  endTable()
  return out
}
