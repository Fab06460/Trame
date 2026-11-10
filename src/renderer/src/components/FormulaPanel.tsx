import { useEffect, useRef, useState } from 'react'
import { MAX_FORMULA_CHARS, FORMULA_SIZE, renderFormula } from '@/formula'
import { updateFormula } from '@/formulaActions'
import { NumberField } from '@/components/NumberField'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import type { TrameElement } from '@/types'

/** Un bouton de la palette : ce qu'il affiche, le code qu'il insère, et où placer le curseur dans ce code (absent : après). */
type Snippet = { show: string; code: string; caret?: number; className?: string }

const STRUCTURES: Snippet[] = [
  { show: 'a⁄b', code: '\\frac{}{}', caret: 6 },
  { show: 'xⁿ', code: '^{}', caret: 2 },
  { show: 'xₙ', code: '_{}', caret: 2 },
  { show: '√', code: '\\sqrt{}', caret: 6 },
  { show: 'ⁿ√', code: '\\sqrt[]{}', caret: 7 },
  { show: '( )', code: '\\left(  \\right)', caret: 7 },
  { show: '| |', code: '\\left|  \\right|', caret: 7 },
  { show: 'Σ', code: '\\sum_{i=1}^{n}' },
  { show: 'Π', code: '\\prod_{i=1}^{n}' },
  { show: '∫', code: '\\int_{a}^{b}' },
  { show: 'lim', code: '\\lim_{x \\to 0}' },
  { show: 'vec', code: '\\vec{}', caret: 5 },
  { show: 'AB', code: '\\overline{}', caret: 10, className: 'overlined' },
  { show: '⎡⎤', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { show: '{', code: '\\begin{cases} x & x>0 \\\\ 0 & x \\le 0 \\end{cases}' },
  { show: 'Abc', code: '\\text{}', caret: 6 },
  { show: 'H₂O', code: '\\ce{}', caret: 4 }
]
const SYMBOLS: Snippet[] = [
  ['±', '\\pm'], ['×', '\\times'], ['÷', '\\div'], ['·', '\\cdot'], ['≠', '\\neq'], ['≤', '\\leq'], ['≥', '\\geq'], ['≈', '\\approx'], ['∞', '\\infty'],
  ['→', '\\to'], ['⇒', '\\Rightarrow'], ['⇔', '\\Leftrightarrow'], ['∈', '\\in'], ['∀', '\\forall'], ['∃', '\\exists'], ['∂', '\\partial'], ['∇', '\\nabla'], ['ℝ', '\\mathbb{R}'], ['ℕ', '\\mathbb{N}'], ['°', '^{\\circ}']
].map(([show, code]) => ({ show, code: `${code} ` }))
const GREEK: Snippet[] = [
  ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'varepsilon'], ['θ', 'theta'], ['λ', 'lambda'], ['μ', 'mu'], ['π', 'pi'], ['ρ', 'rho'], ['σ', 'sigma'], ['φ', 'varphi'], ['ω', 'omega'],
  ['Δ', 'Delta'], ['Σ', 'Sigma'], ['Φ', 'Phi'], ['Ω', 'Omega']
].map(([show, name]) => ({ show, code: `\\${name} ` }))

/** Message d'un échec de dessin : les cas connus sont traduits, un code LaTeX invalide montre le diagnostic de MathJax. */
function problemKey(error: string): { key: MessageKey; detail?: string } {
  if (error === 'empty') return { key: 'formula.empty' }
  if (error === 'too-long') return { key: 'formula.tooLong' }
  if (error === 'unsupported') return { key: 'formula.unsupported' }
  return { key: 'formula.syntax', detail: error === 'syntax' ? undefined : error }
}

/**
 * Réglages d'une formule sélectionnée : code LaTeX avec aperçu immédiat, palette de symboles et de structures, taille, mode compact. Chaque
 * changement redessine l'élément au même endroit ; une frappe continue ne fait qu'un seul pas d'historique. Un code invalide est signalé
 * avec le diagnostic de MathJax et la formule précédente est gardée.
 */
export function FormulaPanel({ el }: { el: TrameElement }): React.JSX.Element | null {
  const t = useT()
  const spec = el.formula
  const [text, setText] = useState(spec?.latex ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number | null>(null)
  const started = useRef(false) // la suite d'une frappe n'ajoute pas de pas d'historique
  const latest = useRef(el)
  latest.current = el

  // une autre formule est sélectionnée, ou l'élément change de l'extérieur (annuler, rétablir) : le champ suit
  useEffect(() => {
    setText(spec?.latex ?? '')
    setProblem(null)
    started.current = false
  }, [el.id, spec?.latex])
  useEffect(() => () => void (timer.current !== null && window.clearTimeout(timer.current)), [])
  if (!spec) return null

  const apply = (latex: string): void => {
    const first = !started.current
    const r = updateFormula(latest.current, { latex }, first)
    if (r) setProblem(r.error)
    else {
      started.current = true
      setProblem(null)
    }
  }
  const change = (latex: string): void => {
    setText(latex)
    if (timer.current !== null) window.clearTimeout(timer.current)
    // l'aperçu suit la frappe, mais on attend une courte pause : MathJax redessine toute la formule
    timer.current = window.setTimeout(() => {
      timer.current = null
      apply(latex)
    }, 250)
    // un code vide ou trop long est signalé tout de suite, sans attendre
    const quick = !latex.trim() ? 'empty' : latex.length > MAX_FORMULA_CHARS ? 'too-long' : null
    if (quick) setProblem(quick)
  }
  const insert = (s: Snippet): void => {
    const ta = area.current
    const a = ta?.selectionStart ?? text.length
    const b = ta?.selectionEnd ?? text.length
    const next = text.slice(0, a) + s.code + text.slice(b)
    const caret = a + (s.caret ?? s.code.length)
    started.current = false // un bouton de la palette est un pas d'historique à lui
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setText(next)
    apply(next)
    window.requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(caret, caret)
    })
  }
  const shown = problem ? problemKey(problem) : null
  const live = renderFormula(spec.latex, spec.display)
  const natural = live.ok && live.widthEm > 0 ? el.width / live.widthEm : spec.size

  return (
    <div data-formula-panel>
      <h3>{t('formula.panel')}</h3>
      <label>
        {t('formula.latex')}
        <textarea
          ref={area}
          data-field="formulaLatex"
          rows={3}
          spellCheck={false}
          maxLength={MAX_FORMULA_CHARS + 200}
          value={text}
          onChange={(e) => change(e.target.value)}
          onBlur={() => {
            started.current = false
          }}
        />
      </label>
      {shown && (
        <div className="warn" role="status" data-formula-problem={problem}>
          {t(shown.key)}
          {shown.detail ? <code> {shown.detail}</code> : null}
        </div>
      )}
      <div className="formula-palette" role="group" aria-label={t('formula.structures')} data-formula-palette="structures">
        {STRUCTURES.map((s) => (
          <button key={s.code} className={s.className} title={s.code.replace(/\s+/g, ' ')} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>{s.show}</button>
        ))}
      </div>
      <div className="formula-palette" role="group" aria-label={t('formula.symbols')} data-formula-palette="symbols">
        {SYMBOLS.map((s) => (
          <button key={s.code} title={s.code.trim()} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>{s.show}</button>
        ))}
      </div>
      <div className="formula-palette" role="group" aria-label={t('formula.greek')} data-formula-palette="greek">
        {GREEK.map((s) => (
          <button key={s.code} title={s.code.trim()} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>{s.show}</button>
        ))}
      </div>
      <NumberField
        label={t('formula.size')}
        field="formulaSize"
        value={Math.round(natural)}
        min={FORMULA_SIZE.min}
        max={FORMULA_SIZE.max}
        suffix="px"
        onCommit={(v) => updateFormula(el, { size: v })}
        onLive={(v, first) => updateFormula(latest.current, { size: v }, first)}
      />
      <label className="check">
        <input type="checkbox" data-field="formulaDisplay" checked={!spec.display} onChange={(e) => updateFormula(el, { display: !e.target.checked })} /> {t('formula.compact')}
      </label>
      <p className="hint">{t('formula.hint')}</p>
    </div>
  )
}
