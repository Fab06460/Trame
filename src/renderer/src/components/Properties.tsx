import { useEditor, selectPage } from '@/store/editor'
import { FONTS, SYSTEM_FONT } from '@/fonts'
import { explain } from '@/pdfFallbacks'
import { suggestFix } from '@/pdfTextCheck'
import { usePdfIssues } from '@/store/pdfIssues'

const PRESETS: Array<[string, number, number]> = [
  ['Post Instagram', 1080, 1080],
  ['Story', 1080, 1920],
  ['Présentation 16:9', 1920, 1080],
  ['A4 (96 dpi)', 794, 1123]
]

export function Properties(): React.JSX.Element {
  const doc = useEditor((s) => s.doc)
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const el = page.elements.find((e) => e.id === selectedIds[0])
  const pdfIssue = usePdfIssues((st) => (el ? st.issues[el.id] : undefined))
  const grouped = page.elements.some((e) => selectedIds.includes(e.id) && e.groupId)
  const { updateElement, setBackground, setSize, moveLayer, duplicateSelected, removeSelected, beginChange, align, distribute, groupSelected, ungroupSelected } =
    useEditor.getState()

  if (!el || !selectedIds.length) {
    return (
      <aside className="panel">
        <h3>Page</h3>
        <label>
          Format
          <select
            value={`${doc.width}x${doc.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number)
              setSize(w, h)
            }}
          >
            {PRESETS.map(([n, w, h]) => (
              <option key={n} value={`${w}x${h}`}>{n} — {w}×{h}</option>
            ))}
            {!PRESETS.some(([, w, h]) => w === doc.width && h === doc.height) && (
              <option value={`${doc.width}x${doc.height}`}>Personnalisé — {doc.width}×{doc.height}</option>
            )}
          </select>
        </label>
        <label>
          Arrière-plan
          <input type="color" value={page.background} onChange={(e) => setBackground(e.target.value)} />
        </label>
      </aside>
    )
  }

  const layerButtons = (
    <>
      <h3>Calques</h3>
      <div className="row">
        <button onClick={() => moveLayer('top')} title="Premier plan">⤒</button>
        <button onClick={() => moveLayer('up')} title="Avancer">↑</button>
        <button onClick={() => moveLayer('down')} title="Reculer">↓</button>
        <button onClick={() => moveLayer('bottom')} title="Arrière-plan">⤓</button>
      </div>
      <div className="row">
        <button onClick={duplicateSelected}>Dupliquer</button>
        <button className="danger" onClick={removeSelected}>Supprimer</button>
      </div>
    </>
  )

  const alignButtons = (
    <>
      <h3>Aligner {selectedIds.length === 1 ? 'sur la page' : 'la sélection'}</h3>
      <div className="row">
        <button onClick={() => align('left')} title="Gauche">⇤</button>
        <button onClick={() => align('hcenter')} title="Centrer horizontalement">⇹</button>
        <button onClick={() => align('right')} title="Droite">⇥</button>
        <button onClick={() => align('top')} title="Haut">⤒</button>
        <button onClick={() => align('vcenter')} title="Centrer verticalement">↕︎</button>
        <button onClick={() => align('bottom')} title="Bas">⤓</button>
      </div>
      {selectedIds.length >= 3 && (
        <div className="row">
          <button onClick={() => distribute('h')}>Répartir ↔︎</button>
          <button onClick={() => distribute('v')}>Répartir ↕︎</button>
        </div>
      )}
    </>
  )

  if (selectedIds.length > 1) {
    return (
      <aside className="panel">
        <h3>{selectedIds.length} éléments</h3>
        <div className="row">
          <button onClick={groupSelected} disabled={grouped && new Set(page.elements.filter((e) => selectedIds.includes(e.id)).map((e) => e.groupId)).size === 1}>
            Grouper
          </button>
          <button onClick={ungroupSelected} disabled={!grouped}>Dissocier</button>
        </div>
        {alignButtons}
        {layerButtons}
      </aside>
    )
  }

  // Les champs continus (couleur, curseur) ouvrent un point d'historique au focus
  const live = (patch: Parameters<typeof updateElement>[1]): void => updateElement(el.id, patch, false)

  return (
    <aside className="panel">
      <h3>{{ rect: 'Rectangle', ellipse: 'Ellipse', text: 'Texte', image: 'Image', path: 'Forme' }[el.type]}</h3>

      {el.type !== 'image' && (
        <label>
          Couleur
          <input type="color" value={el.fill} onPointerDown={beginChange} onChange={(e) => live({ fill: e.target.value })} />
        </label>
      )}

      {el.type === 'text' && (
        <>
          <label>
            Police
            <select
              value={el.fontFamily}
              style={{ fontFamily: el.fontFamily }}
              onChange={(e) => updateElement(el.id, { fontFamily: e.target.value })}
            >
              {el.fontFamily === SYSTEM_FONT && <option value={SYSTEM_FONT}>Système</option>}
              {[...new Set(FONTS.map((f) => f.group))].map((g) => (
                <optgroup key={g} label={g}>
                  {FONTS.filter((f) => f.group === g).map((f) => (
                    <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {pdfIssue && (
            <div className="warn" role="status">
              <strong>⚠ Exporté en image dans le PDF</strong>
              <span>Ce texte s'affichera correctement mais ne sera pas sélectionnable : {explain(pdfIssue.issue)}.</span>
              {(() => {
                const fix = suggestFix(el, pdfIssue.issue)
                return fix ? (
                  <button className="warn-fix" onClick={() => updateElement(el.id, fix.patch)}>
                    {fix.label}
                  </button>
                ) : null
              })()}
            </div>
          )}
          <label>
            Taille
            <input
              type="number"
              min={8}
              max={400}
              value={Math.round(el.fontSize ?? 32)}
              onChange={(e) => updateElement(el.id, { fontSize: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            <button
              className={el.fontStyle?.includes('bold') ? 'active' : ''}
              onClick={() => {
                const it = el.fontStyle?.includes('italic')
                const b = el.fontStyle?.includes('bold')
                updateElement(el.id, { fontStyle: [it ? 'italic' : '', b ? '' : 'bold'].join(' ').trim() || 'normal' })
              }}
            >
              <b>G</b>
            </button>
            <button
              className={el.fontStyle?.includes('italic') ? 'active' : ''}
              onClick={() => {
                const it = el.fontStyle?.includes('italic')
                const b = el.fontStyle?.includes('bold')
                updateElement(el.id, { fontStyle: [it ? '' : 'italic', b ? 'bold' : ''].join(' ').trim() || 'normal' })
              }}
            >
              <i>I</i>
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={el.align === a ? 'active' : ''} onClick={() => updateElement(el.id, { align: a })}>
                {{ left: '⇤', center: '↔︎', right: '⇥' }[a]}
              </button>
            ))}
          </div>
        </>
      )}

      {el.type === 'rect' && (
        <label>
          Arrondi
          <input
            type="range"
            min={0}
            max={Math.min(el.width, el.height) / 2}
            value={el.cornerRadius ?? 0}
            onPointerDown={beginChange}
            onChange={(e) => live({ cornerRadius: Number(e.target.value) })}
          />
        </label>
      )}

      <label>
        Opacité
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={el.opacity}
          onPointerDown={beginChange}
          onChange={(e) => live({ opacity: Number(e.target.value) })}
        />
      </label>

      {alignButtons}
      {layerButtons}
    </aside>
  )
}
