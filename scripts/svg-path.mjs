// Lecture de chemins SVG, partagée par build-icons.mjs et build-illustrations.mjs.
// `toAbsolute(d)` : un `d` SVG (relatif ou absolu, arcs, raccourcis H V S Q T) → liste de commandes absolues M L C Z.

/** Un arc SVG (forme « point d'arrivée ») en courbes de Bézier cubiques (au plus 90° chacune). */
function arcToCubics(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy
  rx = Math.abs(rx); ry = Math.abs(ry)
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s }
  const num_ = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num_ / den))
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dth > 0) dth -= 2 * Math.PI
  else if (sweep && dth < 0) dth += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9))
  const step = dth / n
  const t = (4 / 3) * Math.tan(step / 4)
  const out = []
  const pt = (a) => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos]
  const dpt = (a) => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos]
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * step, a2 = a1 + step
    const [p1x, p1y] = pt(a1), [p2x, p2y] = pt(a2)
    const [d1x, d1y] = dpt(a1), [d2x, d2y] = dpt(a2)
    out.push([p1x + t * d1x, p1y + t * d1y, p2x - t * d2x, p2y - t * d2y, i === n - 1 ? x2 : p2x, i === n - 1 ? y2 : p2y])
  }
  return out
}

/** Lecture d'un `d` SVG (relatif ou absolu, arcs, raccourcis H V S Q T) → liste de commandes absolues M L C Z. */
export function toAbsolute(d) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g
  const tokens = []
  let m
  const raws = [] // texte des nombres : un indicateur d'arc collé au nombre suivant (« 0114.845 ») ne se lit que dans le texte
  while ((m = re.exec(d))) {
    tokens.push(m[1] ?? Number(m[2]))
    raws.push(m[1] ?? m[2])
  }
  let i = 0
  const cmds = []
  let x = 0, y = 0, sx = 0, sy = 0, lastC = null, lastQ = null, cmd = ''
  const read = () => {
    if (typeof tokens[i] !== 'number') throw new Error('nombre attendu : ' + d.slice(0, 80))
    return tokens[i++]
  }
  // un indicateur d'arc (0 ou 1) peut être collé au nombre suivant (« a8 8 0 00-8 8 », « 0114.845 ») : on le lit caractère par caractère
  const flag = () => {
    const raw = raws[i]
    if (typeof tokens[i] !== 'number' || !/^[01]/.test(raw)) throw new Error('indicateur d\'arc invalide')
    if (raw.length === 1) { i++; return Number(raw) }
    raws[i] = raw.slice(1)
    tokens[i] = Number(raws[i])
    return Number(raw[0])
  }
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++]
    else if (cmd === 'M') cmd = 'L'
    else if (cmd === 'm') cmd = 'l'
    const rel = cmd === cmd.toLowerCase()
    const up = cmd.toUpperCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    if (up === 'Z') { cmds.push(['Z']); x = sx; y = sy; lastC = lastQ = null; continue }
    if (up === 'M') { x = ox + read(); y = oy + read(); sx = x; sy = y; cmds.push(['M', x, y]); lastC = lastQ = null }
    else if (up === 'L') { x = ox + read(); y = oy + read(); cmds.push(['L', x, y]); lastC = lastQ = null }
    else if (up === 'H') { x = ox + read(); cmds.push(['L', x, y]); lastC = lastQ = null }
    else if (up === 'V') { y = oy + read(); cmds.push(['L', x, y]); lastC = lastQ = null }
    else if (up === 'C') {
      const a = [ox + read(), oy + read(), ox + read(), oy + read(), ox + read(), oy + read()]
      cmds.push(['C', ...a]); lastC = [a[2], a[3]]; lastQ = null; x = a[4]; y = a[5]
    } else if (up === 'S') {
      const c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]
      const a = [ox + read(), oy + read(), ox + read(), oy + read()]
      cmds.push(['C', c1[0], c1[1], ...a]); lastC = [a[0], a[1]]; lastQ = null; x = a[2]; y = a[3]
    } else if (up === 'Q' || up === 'T') {
      let q
      if (up === 'Q') q = [ox + read(), oy + read()]
      else q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]
      const e = [ox + read(), oy + read()]
      cmds.push(['C', x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1]), e[0], e[1]])
      lastQ = q; lastC = null; x = e[0]; y = e[1]
    } else if (up === 'A') {
      const rx = read(), ry = read(), rot = read(), large = flag(), sweep = flag()
      const ex = ox + read(), ey = oy + read()
      for (const c of arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey)) cmds.push(['C', ...c])
      x = ex; y = ey; lastC = lastQ = null
    } else throw new Error('commande inconnue ' + cmd)
  }
  return cmds
}
