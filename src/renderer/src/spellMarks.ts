/** Une faute à souligner sur le canevas : les indices de caractères du mot dans le texte du calque. */
export interface SpellMark {
  start: number
  end: number
}

/** Les fautes d'un texte, avec le texte lui-même : elles ne valent que tant que le texte n'a pas changé. */
export interface SpellMarks {
  text: string
  marks: SpellMark[]
}

/**
 * Où commence chaque ligne mise en page dans le texte. Konva coupe le texte en lignes (retours à la ligne, espaces de coupure retirés) :
 * chaque ligne est une partie du texte, dans l'ordre, qu'on retrouve en avançant. -1 si une ligne ne se retrouve pas (on ne souligne alors rien).
 */
export function lineStarts(text: string, lines: readonly string[]): number[] {
  const out: number[] = []
  let at = 0
  for (const line of lines) {
    const i = text.indexOf(line, at)
    out.push(i)
    if (i >= 0) at = i + line.length
  }
  return out
}

/** Les parties de mots signalés qui tombent sur une ligne (`from` = début de la ligne dans le texte), en indices dans la ligne. */
export function marksOnLine(marks: readonly SpellMark[], from: number, length: number): SpellMark[] {
  const out: SpellMark[] = []
  for (const m of marks) {
    const start = Math.max(m.start, from)
    const end = Math.min(m.end, from + length)
    if (end > start) out.push({ start: start - from, end: end - from })
  }
  return out
}

/** Le tracé ondulé d'un soulignement de x0 à x1 : une ligne brisée de pas `step`, qui monte et descend de `amp` autour de `y`. */
export function wavePoints(x0: number, x1: number, y: number, step: number, amp: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  let up = true
  for (let x = x0; x < x1; x += step) {
    pts.push([x, y + (up ? -amp : amp)])
    up = !up
  }
  pts.push([x1, y + (up ? -amp : amp)])
  return pts
}
