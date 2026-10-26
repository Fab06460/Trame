/** Aides sur le DOM XML d'un fichier OOXML : indépendantes du préfixe d'espace de noms (`a:`, `p:`, `r:`…), seul le nom local compte. */

let parser: ((text: string) => Document) | null = null

/** Remplace l'analyseur XML (les tests, qui n'ont pas de DOMParser, y branchent @xmldom/xmldom). */
export function setXmlParser(fn: (text: string) => Document): void {
  parser = fn
}

export function parseXml(text: string): Document {
  if (parser) return parser(text)
  return new DOMParser().parseFromString(text, 'application/xml')
}

const nameOf = (n: Node): string => (n as Element).localName ?? n.nodeName.split(':').pop() ?? ''

/** Éléments enfants directs (de nom local `name` si donné). */
export function kids(el: Element | null | undefined, name?: string): Element[] {
  const out: Element[] = []
  if (!el) return out
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || nameOf(n) === name)) out.push(n as Element)
  return out
}

/** Premier enfant direct, ou suite de noms pour descendre (`kid(sp, 'spPr', 'xfrm', 'off')`). */
export function kid(el: Element | null | undefined, ...path: string[]): Element | null {
  let cur: Element | null | undefined = el
  for (const name of path) {
    cur = kids(cur, name)[0]
    if (!cur) return null
  }
  return cur ?? null
}

export const nameOfEl = (el: Element): string => nameOf(el)

/** Valeur d'un attribut : nom exact (« r:embed »), sinon nom local (« embed ») quel que soit le préfixe. */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null
  if (el.hasAttribute(name)) return el.getAttribute(name)
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    if ((a.localName ?? a.name.split(':').pop()) === name) return a.value
  }
  return null
}

export function num(el: Element | null | undefined, name: string): number | null {
  const v = attr(el, name)
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Descendants (à toute profondeur) de nom local `name`. */
export function deep(el: Element | null | undefined, name: string): Element[] {
  const out: Element[] = []
  const walk = (e: Element): void => {
    for (let n = e.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue
      if (nameOf(n) === name) out.push(n as Element)
      walk(n as Element)
    }
  }
  if (el) walk(el)
  return out
}

export const textOf = (el: Element | null | undefined): string => el?.textContent ?? ''
