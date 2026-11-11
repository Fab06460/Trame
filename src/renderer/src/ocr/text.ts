/**
 * Nettoie le texte rendu par la reconnaissance. Le moteur coupe le texte à la largeur de l'image : on recolle les lignes d'un même
 * paragraphe (le bloc de texte de la page a sa propre largeur) et on rejoint les mots coupés en fin de ligne. Un paragraphe est séparé
 * du suivant par une ligne vide. Avec `keepLines`, les retours à la ligne du moteur sont gardés (listes, vers, tableaux de mots).
 */
export function cleanOcrText(raw: string, keepLines = false): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​﻿]/g, '') // caractères de contrôle et espaces de largeur nulle
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
  const paragraphs: string[][] = [[]]
  for (const l of lines) {
    if (l) paragraphs[paragraphs.length - 1].push(l)
    else if (paragraphs[paragraphs.length - 1].length) paragraphs.push([])
  }
  return paragraphs
    .filter((p) => p.length)
    .map((p) => (keepLines ? p.join('\n') : joinLines(p)))
    .join('\n\n')
}

/** Recolle les lignes d'un paragraphe ; « exem- » + « ple » devient « exemple » (trait d'union suivi d'une minuscule seulement). */
function joinLines(lines: string[]): string {
  let out = lines[0]
  for (const next of lines.slice(1)) {
    if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(next)) out = out.slice(0, -1) + next
    else out += ' ' + next
  }
  return out
}
