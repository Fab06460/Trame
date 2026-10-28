import { cleanNotes } from '@/notes'
import { attr, deep, kid, kids, nameOfEl, textOf } from './xml'

/** Texte des notes d'une diapositive (`notesSlide`) : le contenu du corps de texte, un paragraphe par ligne. */
export function readNotes(notesDoc: Document | null): string | undefined {
  const tree = kid(notesDoc?.documentElement, 'cSld', 'spTree')
  if (!tree) return undefined
  const lines: string[] = []
  for (const sp of kids(tree, 'sp')) {
    // seul le corps de texte porte les notes (les autres zones sont le numéro de page, la miniature…)
    if (attr(kid(sp, 'nvSpPr', 'nvPr', 'ph'), 'type') !== 'body') continue
    for (const p of deep(kid(sp, 'txBody'), 'p')) {
      let line = ''
      for (const n of kids(p)) {
        const name = nameOfEl(n)
        if (name === 'r' || name === 'fld') line += textOf(kid(n, 't'))
        else if (name === 'br') line += '\n'
      }
      lines.push(line)
    }
  }
  return cleanNotes(lines.join('\n').replace(/^\n+|\n+$/g, ''))
}
