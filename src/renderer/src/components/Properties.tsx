import { useEditor, selectPage } from '@/store/editor'
import { FONTS, SYSTEM_FONT } from '@/fonts'
import { explain } from '@/pdfFallbacks'
import { suggestFix } from '@/pdfTextCheck'
import { usePdfIssues } from '@/store/pdfIssues'
import { PositionPanel } from './PositionPanel'
import { NumberField } from './NumberField'
import { ImagePanel } from './ImagePanel'
import { PageSize } from './PageSize'
import { LETTER_SPACING, LINE_HEIGHT } from '@/textStyle'
import { DEFAULT_STROKE_COLOR, STROKE_WIDTH, hasStroke } from '@/strokeStyle'
import { defaultGradient } from '@/gradient'
import { SHADOW_LIMITS, dropShadow, glow } from '@/shadowStyle'

export function Properties(): React.JSX.Element {
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const el = page.elements.find((e) => e.id === selectedIds[0])
  const pdfIssue = usePdfIssues((st) => (el ? st.issues[el.id] : undefined))
  const grouped = page.elements.some((e) => selectedIds.includes(e.id) && e.groupId)
  const { updateElement, setBackground, moveLayer, duplicateSelected, removeSelected, toggleLockSelected, beginChange, align, distribute, groupSelected, ungroupSelected } =
    useEditor.getState()

  if (!el || !selectedIds.length) {
    return (
      <aside className="panel">
        <h3>Page</h3>
        <PageSize />
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
        <button onClick={toggleLockSelected} title="Verrouiller / déverrouiller la position (⌘L)">
          {page.elements.filter((e) => selectedIds.includes(e.id)).every((e) => e.locked) ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
        </button>
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
        <PositionPanel />
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

      {el.type === 'image' && <ImagePanel el={el} />}

      {(el.type === 'rect' || el.type === 'ellipse' || el.type === 'path') && (
        <div className="seg" role="group" aria-label="Type de remplissage">
          <button
            data-fill="solid"
            aria-pressed={!el.gradient}
            className={!el.gradient ? 'active' : ''}
            // revenir à une couleur unie garde la première couleur du dégradé (pas de saut de couleur)
            onClick={() => el.gradient && updateElement(el.id, { gradient: undefined, fill: el.gradient.from })}
          >
            Uni
          </button>
          <button
            data-fill="gradient"
            aria-pressed={!!el.gradient}
            className={el.gradient ? 'active' : ''}
            onClick={() => !el.gradient && updateElement(el.id, { gradient: defaultGradient(el.fill) })}
          >
            Dégradé
          </button>
        </div>
      )}

      {el.gradient && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'path') ? (
        <>
          <label>
            Type
            <select
              data-field="gradType"
              value={el.gradient.type}
              onChange={(e) => updateElement(el.id, { gradient: { ...el.gradient!, type: e.target.value as 'linear' | 'radial' } })}
            >
              <option value="linear">Linéaire</option>
              <option value="radial">Radial</option>
            </select>
          </label>
          <div className="stroke-row">
            <input
              type="color"
              data-field="gradFrom"
              title="Première couleur"
              value={el.gradient.from}
              onPointerDown={beginChange}
              onChange={(e) => live({ gradient: { ...el.gradient!, from: e.target.value } })}
            />
            <button
              data-flag="gradSwap"
              title="Inverser les couleurs"
              onClick={() => updateElement(el.id, { gradient: { ...el.gradient!, from: el.gradient!.to, to: el.gradient!.from } })}
            >
              ⇄
            </button>
            <input
              type="color"
              data-field="gradTo"
              title="Seconde couleur"
              value={el.gradient.to}
              onPointerDown={beginChange}
              onChange={(e) => live({ gradient: { ...el.gradient!, to: e.target.value } })}
            />
          </div>
          {el.gradient.type === 'linear' && (
            <NumberField
              label="Angle"
              field="gradAngle"
              value={el.gradient.angle}
              min={0}
              max={360}
              step={5}
              suffix="°"
              onCommit={(v) => updateElement(el.id, { gradient: { ...el.gradient!, angle: ((v % 360) + 360) % 360 } })}
            />
          )}
        </>
      ) : (
        el.type !== 'image' && (
          <label>
            Couleur
            <input type="color" value={el.fill} onPointerDown={beginChange} onChange={(e) => live({ fill: e.target.value })} />
          </label>
        )
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
          <NumberField label="Taille" field="fontSize" value={el.fontSize ?? 32} min={8} max={400} suffix="px" onCommit={(v) => updateElement(el.id, { fontSize: v })} />
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
          <div className="row">
            {(
              [
                ['underline', 'Souligné', <u key="u">S</u>],
                ['strike', 'Barré', <s key="s">B</s>],
                ['uppercase', 'MAJUSCULES', <span key="a">AA</span>]
              ] as const
            ).map(([flag, title, glyph]) => (
              <button
                key={flag}
                data-flag={flag}
                aria-pressed={!!el[flag]}
                className={el[flag] ? 'active' : ''}
                title={title}
                // `undefined` : la clé disparaît du fichier quand l'option est retirée
                onClick={() => updateElement(el.id, { [flag]: el[flag] ? undefined : true })}
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="num-grid">
            <NumberField label="Interlettrage" field="letterSpacing" value={el.letterSpacing ?? 0} min={LETTER_SPACING.min} max={LETTER_SPACING.max} step={0.5} suffix="px" onCommit={(v) => updateElement(el.id, { letterSpacing: v || undefined })} />
            <NumberField label="Interligne" field="lineHeight" value={el.lineHeight ?? LINE_HEIGHT.default} min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} step={0.05} suffix="×" onCommit={(v) => updateElement(el.id, { lineHeight: v === LINE_HEIGHT.default ? undefined : v })} />
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

      <h3>Contour</h3>
      <div className="stroke-row">
        <input
          type="color"
          data-field="stroke"
          title="Couleur du contour"
          value={el.stroke ?? DEFAULT_STROKE_COLOR}
          onPointerDown={beginChange}
          // choisir une couleur sans épaisseur donne un contour visible (2 px) plutôt qu'un changement invisible
          onChange={(e) => live({ stroke: e.target.value, ...((el.strokeWidth ?? 0) > 0 ? {} : { strokeWidth: 2 }) })}
        />
        <NumberField
          label="Épaisseur"
          field="strokeWidth"
          value={el.strokeWidth ?? 0}
          min={STROKE_WIDTH.min}
          max={STROKE_WIDTH.max}
          step={1}
          suffix="px"
          onCommit={(v) => updateElement(el.id, v > 0 ? { strokeWidth: v, stroke: el.stroke ?? DEFAULT_STROKE_COLOR } : { strokeWidth: undefined, stroke: undefined, strokeDashed: undefined })}
        />
        <button
          data-flag="strokeDashed"
          aria-pressed={!!el.strokeDashed}
          className={el.strokeDashed ? 'active' : ''}
          disabled={!hasStroke(el)}
          title="Contour en tirets"
          onClick={() => updateElement(el.id, { strokeDashed: el.strokeDashed ? undefined : true })}
        >
          ┅
        </button>
      </div>

      <h3>Ombre</h3>
      {(() => {
        const sh = el.shadow
        const mode = !sh ? 'none' : sh.offsetX === 0 && sh.offsetY === 0 ? 'glow' : 'drop'
        const patchShadow = (patch: Partial<NonNullable<typeof sh>>): void => updateElement(el.id, { shadow: { ...sh!, ...patch } })
        return (
          <>
            <div className="seg three" role="group" aria-label="Type d'ombre">
              <button data-shadow="none" aria-pressed={mode === 'none'} className={mode === 'none' ? 'active' : ''} onClick={() => updateElement(el.id, { shadow: undefined })}>Aucune</button>
              <button data-shadow="drop" aria-pressed={mode === 'drop'} className={mode === 'drop' ? 'active' : ''} onClick={() => mode !== 'drop' && updateElement(el.id, { shadow: dropShadow() })}>Ombre</button>
              {/* la lueur reprend la couleur de l'élément pour rester lisible sur n'importe quel fond */}
              <button data-shadow="glow" aria-pressed={mode === 'glow'} className={mode === 'glow' ? 'active' : ''} onClick={() => mode !== 'glow' && updateElement(el.id, { shadow: glow(el.gradient?.from ?? el.fill) })}>Lueur</button>
            </div>
            {sh && (
              <>
                <div className="stroke-row">
                  <input type="color" data-field="shadowColor" title="Couleur de l'ombre" value={sh.color} onPointerDown={beginChange} onChange={(e) => live({ shadow: { ...sh, color: e.target.value } })} />
                  <NumberField label="Flou" field="shadowBlur" value={sh.blur} min={SHADOW_LIMITS.blur.min} max={SHADOW_LIMITS.blur.max} suffix="px" onCommit={(v) => patchShadow({ blur: v })} />
                  <NumberField label="Intensité" field="shadowOpacity" value={Math.round(sh.opacity * 100)} min={0} max={100} suffix="%" onCommit={(v) => patchShadow({ opacity: v / 100 })} />
                </div>
                <div className="num-grid">
                  <NumberField label="Décalage X" field="shadowX" value={sh.offsetX} min={SHADOW_LIMITS.offset.min} max={SHADOW_LIMITS.offset.max} suffix="px" onCommit={(v) => patchShadow({ offsetX: v })} />
                  <NumberField label="Décalage Y" field="shadowY" value={sh.offsetY} min={SHADOW_LIMITS.offset.min} max={SHADOW_LIMITS.offset.max} suffix="px" onCommit={(v) => patchShadow({ offsetY: v })} />
                </div>
              </>
            )}
          </>
        )
      })()}

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

      <PositionPanel />
      {alignButtons}
      {layerButtons}
    </aside>
  )
}
