import { COLUMN_GAP, columnGapOf, columnsOf } from '@/columnStyle'
import { isFlipExempt } from '@/flip'
import { sameTypeIds } from '@/selection'
import { TransitionPanel } from './TransitionPanel'
import { useEditor, selectPage } from '@/store/editor'
import { allFonts, SYSTEM_FONT } from '@/fonts'
import { useFonts } from '@/store/fonts'
import { explain } from '@/pdfFallbacks'
import { suggestFix } from '@/pdfTextCheck'
import { usePdfIssues } from '@/store/pdfIssues'
import { PositionPanel } from './PositionPanel'
import { NumberField } from './NumberField'
import { ImagePanel } from './ImagePanel'
import { useBrand } from '@/store/brand'
import { PageSize } from './PageSize'
import { PrintSetupPanel } from './PrintSetupPanel'
import { ProtectionControls, TemplateBanner } from './TemplatePanel'
import { contentLocked, isEnforced } from '@/protection'
import { LETTER_SPACING, LINE_HEIGHT } from '@/textStyle'
import { DEFAULT_STROKE_COLOR, STROKE_WIDTH, hasStroke } from '@/strokeStyle'
import { defaultGradient } from '@/gradient'
import { SHADOW_LIMITS, dropShadow, glow } from '@/shadowStyle'
import { useT } from '@/i18n'
import type { MessageKey } from '@shared/i18n'
import { TextAiHelp } from './TextAiHelp'
import { ChartPanel } from './ChartPanel'
import { QrPanel } from './QrPanel'
import { fieldsIn } from '@/mailMerge'

const MORE_FONTS = '__more-fonts__'

export function Properties(): React.JSX.Element {
  const t = useT()
  useFonts((s) => s.version) // la liste des polices change quand on en ajoute ou retire
  const fonts = allFonts()
  const page = useEditor(selectPage)
  const selectedIds = useEditor((s) => s.selectedIds)
  const el = page.elements.find((e) => e.id === selectedIds[0])
  const pdfIssue = usePdfIssues((st) => (el ? st.issues[el.id] : undefined))
  const enforced = useEditor((s) => isEnforced(s.doc, s.templateUnlocked))
  const selection = page.elements.filter((e) => selectedIds.includes(e.id))
  const grouped = page.elements.some((e) => selectedIds.includes(e.id) && e.groupId)
  const { updateElement, setBackground, moveLayer, duplicateSelected, removeSelected, toggleLockSelected, beginChange, align, distribute, flipSelected, selectSameType, groupSelected, ungroupSelected } =
    useEditor.getState()

  if (!el || !selectedIds.length) {
    return (
      <aside className="panel">
        <TemplateBanner />
        <h3>{t('prop.page')}</h3>
        <PageSize />
        <PrintSetupPanel />
        <label>
          {t('prop.background')}
          <input type="color" value={page.background} onChange={(e) => setBackground(e.target.value)} onBlur={(e) => useBrand.getState().noteColor(e.target.value)} />
        </label>
        <TransitionPanel />
      </aside>
    )
  }

  // élément figé par le modèle : rien à modifier ici (le bandeau propose « Modifier le modèle »)
  if (selection.some((e) => contentLocked(e, enforced))) {
    return (
      <aside className="panel">
        <TemplateBanner />
        <h3>{selection.length > 1 ? t('prop.elements', { count: selection.length }) : t('prop.templateElement')}</h3>
        <p className="hint" data-template-notice>
          🔐 {selection.length > 1 ? t('prop.locked.many') : t('prop.locked.one')}
        </p>
        <p className="hint">{t('prop.locked.hint')}</p>
      </aside>
    )
  }
  const protectedSel = enforced && selection.some((e) => e.protect)

  // tout ce qui est du même type que la sélection (si elle est d'un seul type)
  const sameType = selection.length && selection.every((e) => e.type === selection[0].type) ? sameTypeIds(page.elements, selection[0]) : []

  const layerButtons = (
    <>
      <h3>{t('prop.layers')}</h3>
      <div className="row">
        <button onClick={() => moveLayer('top')} title={t('prop.layer.top')}>⤒</button>
        <button onClick={() => moveLayer('up')} title={t('prop.layer.up')}>↑</button>
        <button onClick={() => moveLayer('down')} title={t('prop.layer.down')}>↓</button>
        <button onClick={() => moveLayer('bottom')} title={t('prop.layer.bottom')}>⤓</button>
      </div>
      <div className="row">
        <button disabled={protectedSel} onClick={toggleLockSelected} title={t('prop.lock.title')}>
          {page.elements.filter((e) => selectedIds.includes(e.id)).every((e) => e.locked) ? t('prop.unlock') : t('prop.lock')}
        </button>
        <button disabled={protectedSel} onClick={duplicateSelected}>{t('prop.duplicate')}</button>
        <button className="danger" disabled={protectedSel} onClick={removeSelected}>{t('prop.delete')}</button>
      </div>
      {sameType.length > selectedIds.length && (
        <button data-action="select-same" title={t('prop.selectSame.title')} onClick={() => selectSameType(selection[0].id)}>
          {t('prop.selectSame', { count: sameType.length })}
        </button>
      )}
    </>
  )

  const flippable = selection.some((e) => !isFlipExempt(e, page.elements))

  const alignButtons = (
    <>
      <h3>{selectedIds.length === 1 ? t('prop.align.page') : t('prop.align.selection')}</h3>
      <div className="row">
        <button onClick={() => align('left')} title={t('prop.align.left')}>⇤</button>
        <button onClick={() => align('hcenter')} title={t('prop.align.hcenter')}>⇹</button>
        <button onClick={() => align('right')} title={t('prop.align.right')}>⇥</button>
        <button onClick={() => align('top')} title={t('prop.align.top')}>⤒</button>
        <button onClick={() => align('vcenter')} title={t('prop.align.vcenter')}>↕︎</button>
        <button onClick={() => align('bottom')} title={t('prop.align.bottom')}>⤓</button>
      </div>
      {selectedIds.length >= 3 && (
        <div className="row">
          <button onClick={() => distribute('h')}>{t('prop.distribute.h')}</button>
          <button onClick={() => distribute('v')}>{t('prop.distribute.v')}</button>
        </div>
      )}
      <div className="row">
        <button data-action="flip-h" disabled={!flippable} title={t('prop.flip.h.title')} onClick={() => flipSelected('h')}>{t('prop.flip.h')}</button>
        <button data-action="flip-v" disabled={!flippable} title={t('prop.flip.v.title')} onClick={() => flipSelected('v')}>{t('prop.flip.v')}</button>
      </div>
    </>
  )

  // un QR code (groupe dont le premier élément porte son contenu) : ses réglages d'abord
  const qrAnchor = selection.find((e) => e.qr && e.groupId && selection.every((x) => x.groupId === e.groupId))
  if (qrAnchor) {
    return (
      <aside className="panel">
        <TemplateBanner />
        <QrPanel key={qrAnchor.id} anchor={qrAnchor} />
        <PositionPanel />
        {alignButtons}
        {layerButtons}
      </aside>
    )
  }

  // un graphique ou un tableau (groupe dont le premier élément porte sa description) : ses réglages d'abord
  const chartAnchor = selection.find((e) => e.chart && e.groupId && selection.every((x) => x.groupId === e.groupId))
  if (chartAnchor) {
    return (
      <aside className="panel">
        <TemplateBanner />
        <ChartPanel key={chartAnchor.id} anchor={chartAnchor} />
        <PositionPanel />
        {alignButtons}
        {layerButtons}
      </aside>
    )
  }

  if (selectedIds.length > 1) {
    return (
      <aside className="panel">
        <TemplateBanner />
        <h3>{t('prop.elements', { count: selectedIds.length })}</h3>
        <div className="row">
          <button onClick={groupSelected} disabled={grouped && new Set(page.elements.filter((e) => selectedIds.includes(e.id)).map((e) => e.groupId)).size === 1}>
            {t('prop.group')}
          </button>
          <button onClick={ungroupSelected} disabled={!grouped}>{t('prop.ungroup')}</button>
        </div>
        <PositionPanel />
        {alignButtons}
        {layerButtons}
        <ProtectionControls />
      </aside>
    )
  }

  // Les champs continus (couleur, curseur) ouvrent un point d'historique au focus
  const live = (patch: Parameters<typeof updateElement>[1]): void => updateElement(el.id, patch, false)

  return (
    <aside className="panel">
      <TemplateBanner />
      <h3>{t(`prop.type.${el.type}`)}</h3>

      {el.type === 'image' && <ImagePanel el={el} />}

      {(el.type === 'rect' || el.type === 'ellipse' || el.type === 'path') && (
        <div className="seg" role="group" aria-label={t('prop.fillType')}>
          <button
            data-fill="solid"
            aria-pressed={!el.gradient}
            className={!el.gradient ? 'active' : ''}
            // revenir à une couleur unie garde la première couleur du dégradé (pas de saut de couleur)
            onClick={() => el.gradient && updateElement(el.id, { gradient: undefined, fill: el.gradient.from })}
          >
            {t('prop.fill.solid')}
          </button>
          <button
            data-fill="gradient"
            aria-pressed={!!el.gradient}
            className={el.gradient ? 'active' : ''}
            onClick={() => !el.gradient && updateElement(el.id, { gradient: defaultGradient(el.fill) })}
          >
            {t('prop.fill.gradient')}
          </button>
        </div>
      )}

      {el.gradient && (el.type === 'rect' || el.type === 'ellipse' || el.type === 'path') ? (
        <>
          <label>
            {t('prop.gradient.type')}
            <select
              data-field="gradType"
              value={el.gradient.type}
              onChange={(e) => updateElement(el.id, { gradient: { ...el.gradient!, type: e.target.value as 'linear' | 'radial' } })}
            >
              <option value="linear">{t('prop.gradient.linear')}</option>
              <option value="radial">{t('prop.gradient.radial')}</option>
            </select>
          </label>
          <div className="stroke-row">
            <input
              type="color"
              data-field="gradFrom"
              title={t('prop.gradient.from')}
              value={el.gradient.from}
              onPointerDown={beginChange}
              onChange={(e) => live({ gradient: { ...el.gradient!, from: e.target.value } })}
            />
            <button
              data-flag="gradSwap"
              title={t('prop.gradient.swap')}
              onClick={() => updateElement(el.id, { gradient: { ...el.gradient!, from: el.gradient!.to, to: el.gradient!.from } })}
            >
              ⇄
            </button>
            <input
              type="color"
              data-field="gradTo"
              title={t('prop.gradient.to')}
              value={el.gradient.to}
              onPointerDown={beginChange}
              onChange={(e) => live({ gradient: { ...el.gradient!, to: e.target.value } })}
            />
          </div>
          {el.gradient.type === 'linear' && (
            <NumberField
              label={t('prop.gradient.angle')}
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
            {t('prop.color')}
            <input type="color" value={el.fill} onPointerDown={beginChange} onChange={(e) => live({ fill: e.target.value })} onBlur={(e) => useBrand.getState().noteColor(e.target.value)} />
          </label>
        )
      )}

      {el.type === 'text' && (
        <>
          <label>
            {t('prop.font')}
            <select
              value={el.fontFamily}
              style={{ fontFamily: el.fontFamily }}
              data-field="fontFamily"
              onChange={(e) => (e.target.value === MORE_FONTS ? useFonts.getState().setDialog(true) : updateElement(el.id, { fontFamily: e.target.value }))}
            >
              {el.fontFamily === SYSTEM_FONT && <option value={SYSTEM_FONT}>{t('prop.font.system')}</option>}
              {el.fontFamily && el.fontFamily !== SYSTEM_FONT && !fonts.some((f) => f.family === el.fontFamily) && <option value={el.fontFamily}>{t('prop.font.missing', { name: el.fontFamily.split(',')[0].replace(/"/g, '') })}</option>}
              {[...new Set(fonts.map((f) => f.group))].map((g) => (
                <optgroup key={g} label={t(`font.group.${g}` as MessageKey)}>
                  {fonts.filter((f) => f.group === g).map((f) => (
                    <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={MORE_FONTS}>{t('prop.font.more')}</option>
            </select>
          </label>
          {pdfIssue && (
            <div className="warn" role="status">
              <strong>{t('prop.pdfIssue.title')}</strong>
              <span>{t('prop.pdfIssue.text', { reason: explain(pdfIssue.issue) })}</span>
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
          <NumberField label={t('prop.size')} field="fontSize" value={el.fontSize ?? 32} min={8} max={400} suffix="px" onCommit={(v) => updateElement(el.id, { fontSize: v })} />
          <div className="row">
            <button
              className={el.fontStyle?.includes('bold') ? 'active' : ''}
              title={t('prop.bold')}
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
              title={t('prop.italic')}
              onClick={() => {
                const it = el.fontStyle?.includes('italic')
                const b = el.fontStyle?.includes('bold')
                updateElement(el.id, { fontStyle: [it ? '' : 'italic', b ? 'bold' : ''].join(' ').trim() || 'normal' })
              }}
            >
              <i>I</i>
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={el.align === a ? 'active' : ''} title={t(`prop.textAlign.${a}`)} onClick={() => updateElement(el.id, { align: a })}>
                {{ left: '⇤', center: '↔︎', right: '⇥' }[a]}
              </button>
            ))}
          </div>
          <div className="row">
            {(
              [
                ['underline', 'prop.underline', <u key="u">S</u>],
                ['strike', 'prop.strike', <s key="s">B</s>],
                ['uppercase', 'prop.uppercase', <span key="a">AA</span>]
              ] as const
            ).map(([flag, title, glyph]) => (
              <button
                key={flag}
                data-flag={flag}
                aria-pressed={!!el[flag]}
                className={el[flag] ? 'active' : ''}
                title={t(title)}
                // `undefined` : la clé disparaît du fichier quand l'option est retirée
                onClick={() => updateElement(el.id, { [flag]: el[flag] ? undefined : true })}
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="row">
            {(
              [
                ['bullet', 'prop.list.bullet', '•'],
                ['number', 'prop.list.number', '1.']
              ] as const
            ).map(([kind, title, glyph]) => (
              <button
                key={kind}
                data-list={kind}
                aria-pressed={el.list === kind}
                className={el.list === kind ? 'active' : ''}
                title={t(title)}
                onClick={() => updateElement(el.id, { list: el.list === kind ? undefined : kind })}
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="row" role="group" aria-label={t('prop.columns')}>
            <span className="row-label">{t('prop.columns')}</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                data-columns={n}
                aria-pressed={columnsOf(el) === n}
                className={columnsOf(el) === n ? 'active' : ''}
                title={t('prop.columns.n', { n })}
                onClick={() => updateElement(el.id, { columns: n === 1 ? undefined : n, ...(n === 1 ? { columnGap: undefined } : {}) })}
              >
                {n}
              </button>
            ))}
          </div>
          {columnsOf(el) > 1 && (
            <NumberField label={t('prop.columnGap')} field="columnGap" value={columnGapOf(el)} min={COLUMN_GAP.min} max={COLUMN_GAP.max} suffix="px" onCommit={(v) => updateElement(el.id, { columnGap: v })} />
          )}
          <div className="num-grid">
            <NumberField label={t('prop.letterSpacing')} field="letterSpacing" value={el.letterSpacing ?? 0} min={LETTER_SPACING.min} max={LETTER_SPACING.max} step={0.5} suffix="px" onCommit={(v) => updateElement(el.id, { letterSpacing: v || undefined })} />
            <NumberField label={t('prop.lineHeight')} field="lineHeight" value={el.lineHeight ?? LINE_HEIGHT.default} min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} step={0.05} suffix="×" onCommit={(v) => updateElement(el.id, { lineHeight: v === LINE_HEIGHT.default ? undefined : v })} />
          </div>
          {fieldsIn(el.text ?? '').length > 0 && (
            <label className="choice-row" title={t('prop.mergeFit.hint')}>
              <input type="checkbox" data-field="mergeFit" checked={!!el.mergeFit} onChange={(e) => updateElement(el.id, { mergeFit: e.target.checked ? true : undefined })} /> {t('prop.mergeFit')}
            </label>
          )}
          <TextAiHelp el={el} enforced={enforced} />
        </>
      )}

      {el.type === 'rect' && (
        <label>
          {t('prop.cornerRadius')}
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

      <h3>{t('prop.stroke')}</h3>
      <div className="stroke-row">
        <input
          type="color"
          data-field="stroke"
          title={t('prop.stroke.color')}
          value={el.stroke ?? DEFAULT_STROKE_COLOR}
          onPointerDown={beginChange}
          // choisir une couleur sans épaisseur donne un contour visible (2 px) plutôt qu'un changement invisible
          onChange={(e) => live({ stroke: e.target.value, ...((el.strokeWidth ?? 0) > 0 ? {} : { strokeWidth: 2 }) })}
        />
        <NumberField
          label={t('prop.stroke.width')}
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
          title={t('prop.stroke.dashed')}
          onClick={() => updateElement(el.id, { strokeDashed: el.strokeDashed ? undefined : true })}
        >
          ┅
        </button>
      </div>

      <h3>{t('prop.shadow')}</h3>
      {(() => {
        const sh = el.shadow
        const mode = !sh ? 'none' : sh.offsetX === 0 && sh.offsetY === 0 ? 'glow' : 'drop'
        const patchShadow = (patch: Partial<NonNullable<typeof sh>>): void => updateElement(el.id, { shadow: { ...sh!, ...patch } })
        return (
          <>
            <div className="seg three" role="group" aria-label={t('prop.shadow.type')}>
              <button data-shadow="none" aria-pressed={mode === 'none'} className={mode === 'none' ? 'active' : ''} onClick={() => updateElement(el.id, { shadow: undefined })}>{t('prop.shadow.none')}</button>
              <button data-shadow="drop" aria-pressed={mode === 'drop'} className={mode === 'drop' ? 'active' : ''} onClick={() => mode !== 'drop' && updateElement(el.id, { shadow: dropShadow() })}>{t('prop.shadow.drop')}</button>
              {/* la lueur reprend la couleur de l'élément pour rester lisible sur n'importe quel fond */}
              <button data-shadow="glow" aria-pressed={mode === 'glow'} className={mode === 'glow' ? 'active' : ''} onClick={() => mode !== 'glow' && updateElement(el.id, { shadow: glow(el.gradient?.from ?? el.fill) })}>{t('prop.shadow.glow')}</button>
            </div>
            {sh && (
              <>
                <div className="stroke-row">
                  <input type="color" data-field="shadowColor" title={t('prop.shadow.color')} value={sh.color} onPointerDown={beginChange} onChange={(e) => live({ shadow: { ...sh, color: e.target.value } })} />
                  <NumberField label={t('prop.shadow.blur')} field="shadowBlur" value={sh.blur} min={SHADOW_LIMITS.blur.min} max={SHADOW_LIMITS.blur.max} suffix="px" onCommit={(v) => patchShadow({ blur: v })} />
                  <NumberField label={t('prop.shadow.opacity')} field="shadowOpacity" value={Math.round(sh.opacity * 100)} min={0} max={100} suffix="%" onCommit={(v) => patchShadow({ opacity: v / 100 })} />
                </div>
                <div className="num-grid">
                  <NumberField label={t('prop.shadow.x')} field="shadowX" value={sh.offsetX} min={SHADOW_LIMITS.offset.min} max={SHADOW_LIMITS.offset.max} suffix="px" onCommit={(v) => patchShadow({ offsetX: v })} />
                  <NumberField label={t('prop.shadow.y')} field="shadowY" value={sh.offsetY} min={SHADOW_LIMITS.offset.min} max={SHADOW_LIMITS.offset.max} suffix="px" onCommit={(v) => patchShadow({ offsetY: v })} />
                </div>
              </>
            )}
          </>
        )
      })()}

      <label>
        {t('prop.opacity')}
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
      <ProtectionControls />
    </aside>
  )
}
