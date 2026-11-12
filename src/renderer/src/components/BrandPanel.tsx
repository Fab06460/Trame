import { useEffect, useMemo, useState } from 'react'
import { allFonts, FONTS } from '@/fonts'
import { useFonts } from '@/store/fonts'
import { MAX_COLORS, MAX_FONTS, MAX_KITS, MAX_KIT_NAME, MAX_LOGOS } from '@/brandKit'
import { InfoTip } from './InfoTip'
import { applyColor, applyFont, pickScreenColor, placeLogo } from '@/brandActions'
import { fontName, useBrand } from '@/store/brand'
import { useT } from '@/i18n'
import { useStyleMatch } from '@/store/styleMatch'
import { useEditor } from '@/store/editor'
import { isEnforced } from '@/protection'
import { collectColors, replaceColor } from '@/recolor'

/** Pastille de couleur : un clic l'applique ; la croix (si `onRemove`) la retire du kit. */
function Swatch({ color, kind, onRemove, onAdd, onReplace }: { color: string; kind: 'brand' | 'recent' | 'document'; onRemove?: () => void; onAdd?: () => void; onReplace?: () => void }): React.JSX.Element {
  const t = useT()
  return (
    <span className="swatch-wrap">
      <button className="swatch" data-swatch={kind} style={{ background: color }} title={t('brand.apply', { color })} aria-label={t('brand.apply.label', { color })} onClick={() => applyColor(color)} />
      {onAdd && (
        <button className="swatch-x swatch-add" data-swatch-add={color} title={t('brand.doc.addToKit', { color })} aria-label={t('brand.doc.addToKit', { color })} onClick={onAdd}>
          +
        </button>
      )}
      {onReplace && (
        <button className="swatch-x swatch-replace" data-swatch-replace={color} title={t('brand.doc.replace', { color })} aria-label={t('brand.doc.replace', { color })} onClick={onReplace}>
          ⇄
        </button>
      )}
      {onRemove && (
        <button className="swatch-x" data-swatch-remove={color} title={t('brand.removeFromKit')} aria-label={t('brand.remove.label', { name: color })} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

/** Kit de marque : couleurs, polices et logos réutilisables d'un document à l'autre, plus les couleurs récemment utilisées. */
export function BrandPanel(): React.JSX.Element {
  const t = useT()
  useFonts((s) => s.version)
  const kit = useBrand((s) => s.kit)
  const library = useBrand((s) => s.library)
  const kitName = library.kits.find((k) => k.id === library.active)?.name ?? ''
  const [naming, setNaming] = useState<null | { mode: 'new' | 'rename'; value: string }>(null)
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null)
  const recent = useBrand((s) => s.recent)
  const brand = useBrand.getState()
  const [color, setColor] = useState('#7c5cff')
  const [family, setFamily] = useState(FONTS[0].family)
  const hasPipette = 'EyeDropper' in window
  const doc = useEditor((s) => s.doc)
  const unlocked = useEditor((s) => s.templateUnlocked)
  const docColors = useMemo(() => collectColors(doc, new Set(doc.pages.map((p) => p.id))).map((c) => c.color), [doc])
  const [replacing, setReplacing] = useState<string | null>(null)
  const [replaceWith, setReplaceWith] = useState('#7c5cff')
  const replaceNow = (): void => {
    if (!replacing) return
    useEditor.getState().editDocument((d) => replaceColor(d, replacing, replaceWith, isEnforced(d, unlocked)).doc)
    useBrand.getState().noteColor(replaceWith)
    setReplacing(null)
  }

  useEffect(() => {
    void useBrand.getState().load()
  }, [])

  const addLogo = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src && !brand.addLogo({ id: crypto.randomUUID(), name: t('brand.logoName', { n: kit.logos.length + 1 }), src })) setNote({ text: t('brand.logo.full'), warn: true })
  }

  const validateName = (): void => {
    if (!naming) return
    if (naming.mode === 'new') brand.createKit(naming.value || t('brand.kit.default'))
    else brand.renameKit(library.active, naming.value)
    setNaming(null)
  }
  const removeKit = async (): Promise<void> => {
    if (await window.trame.confirm(t('brand.kit.delete.title', { name: kitName }), t('brand.kit.delete.detail'), t('brand.kit.delete'))) brand.deleteKit(library.active)
  }
  const importKit = async (): Promise<void> => {
    const res = await brand.importKit()
    if (res === null) return
    setNote(res === false ? { text: t('brand.kit.invalid'), warn: true } : { text: t('brand.kit.imported.ok', { name: res }), warn: false })
  }
  const exportKit = async (): Promise<void> => {
    if (await brand.exportKit()) setNote({ text: t('brand.kit.exported'), warn: false })
  }

  return (
    <>
      <section data-brand-kits>
        <h3>{t('brand.kit.section')}<InfoTip>{t('brand.kit.hint')}</InfoTip></h3>
        {naming ? (
          <div className="kit-row">
            <input
              type="text"
              data-field="brandKitName"
              autoFocus
              maxLength={MAX_KIT_NAME}
              value={naming.value}
              placeholder={t('brand.kit.name')}
              aria-label={t('brand.kit.name')}
              onChange={(e) => setNaming({ ...naming, value: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') validateName()
                if (e.key === 'Escape') setNaming(null)
              }}
            />
            <button data-action="brand-kit-name-ok" className="primary" onClick={validateName}>{t(naming.mode === 'new' ? 'brand.kit.create' : 'brand.kit.renameDo')}</button>
            <button data-action="brand-kit-name-cancel" onClick={() => setNaming(null)}>{t('brand.doc.cancel')}</button>
          </div>
        ) : (
          <>
            <div className="kit-row">
              <select data-field="brandKitSelect" value={library.active} aria-label={t('brand.kit.select')} onChange={(e) => brand.selectKit(e.target.value)}>
                {library.kits.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
              <button data-action="brand-kit-new" disabled={library.kits.length >= MAX_KITS} title={library.kits.length >= MAX_KITS ? t('brand.kit.full', { n: MAX_KITS }) : undefined} onClick={() => setNaming({ mode: 'new', value: '' })}>{t('brand.kit.new')}</button>
            </div>
            <div className="kit-row">
              <button data-action="brand-kit-rename" onClick={() => setNaming({ mode: 'rename', value: kitName })}>{t('brand.kit.rename')}</button>
              <button data-action="brand-kit-duplicate" disabled={library.kits.length >= MAX_KITS} onClick={() => brand.duplicateKit(library.active)}>{t('brand.kit.duplicate')}</button>
              <button data-action="brand-kit-delete" disabled={library.kits.length <= 1} title={library.kits.length <= 1 ? t('brand.kit.delete.last') : undefined} onClick={() => void removeKit()}>{t('brand.kit.delete')}</button>
            </div>
            <div className="kit-row">
              <button data-action="brand-kit-export" onClick={() => void exportKit()}>{t('brand.kit.export')}</button>
              <button data-action="brand-kit-import" disabled={library.kits.length >= MAX_KITS} onClick={() => void importKit()}>{t('brand.kit.import')}</button>
            </div>
          </>
        )}
        {note && <p className={note.warn ? 'warn' : 'hint'} role="status" data-brand-note>{note.text}</p>}
      </section>

      <section>
        <h3>{t('brand.colors')}</h3>
        <div className="swatches">
          {kit.colors.map((c) => (
            <Swatch key={c} color={c} kind="brand" onRemove={() => brand.removeColor(c)} />
          ))}
          {kit.colors.length === 0 && <p className="hint">{t('brand.colors.empty')}</p>}
        </div>
        <button data-action="style-open-brand" title={t('style.open.title')} onClick={() => useStyleMatch.getState().show()}>{t('style.brand')}</button>
        <div className="row">
          <input type="color" data-field="brandColor" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t('brand.color.add.label')} />
          <button data-action="brand-add-color" disabled={kit.colors.length >= MAX_COLORS} onClick={() => brand.addColor(color)}>
            {t('brand.addToKit')}
          </button>
          {hasPipette && (
            <button
              data-action="pipette"
              title={t('brand.pipette.title')}
              onClick={async () => {
                const c = await pickScreenColor()
                if (c) setColor(c)
              }}
            >
              {t('brand.pipette')}
            </button>
          )}
        </div>
      </section>

      <section data-brand-document>
        <h3>{t('brand.doc')}</h3>
        <div className="swatches">
          {docColors.map((c) => (
            <Swatch
              key={c}
              color={c}
              kind="document"
              onAdd={kit.colors.includes(c) || kit.colors.length >= MAX_COLORS ? undefined : () => brand.addColor(c)}
              onReplace={() => {
                setReplacing(c)
                setReplaceWith(c)
              }}
            />
          ))}
          {docColors.length === 0 && <p className="hint">{t('brand.doc.empty')}</p>}
        </div>
        {replacing && (
          <div className="row" data-brand-replace>
            <span className="swatch inline" style={{ background: replacing }} />
            <input type="color" data-field="replaceColor" value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} aria-label={t('brand.doc.replaceBy', { color: replacing })} />
            <button data-action="doc-color-replace" onClick={replaceNow}>{t('brand.doc.replaceDo')}</button>
            <button data-action="doc-color-cancel" onClick={() => setReplacing(null)}>{t('brand.doc.cancel')}</button>
          </div>
        )}
      </section>

      <section>
        <h3>{t('brand.recent')}</h3>
        <div className="swatches">
          {recent.map((c) => (
            <Swatch key={c} color={c} kind="recent" />
          ))}
          {recent.length === 0 && <p className="hint">{t('brand.recent.empty')}</p>}
        </div>
      </section>

      <section>
        <h3>{t('brand.fonts')}</h3>
        <div className="stack">
          {kit.fonts.map((f) => (
            <span key={f} className="brand-font">
              <button data-brand-font={f} style={{ fontFamily: f }} title={t('brand.font.apply')} onClick={() => applyFont(f)}>
                {fontName(f)}
              </button>
              <button className="swatch-x static" title={t('brand.removeFromKit')} aria-label={t('brand.remove.label', { name: fontName(f) })} onClick={() => brand.removeFont(f)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="row">
          <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label={t('brand.font.add.label')} data-field="brandFontSelect">
            {allFonts().map((f) => (
              <option key={f.name} value={f.family}>
                {f.name}
              </option>
            ))}
          </select>
          <button data-action="brand-add-font" disabled={kit.fonts.length >= MAX_FONTS} onClick={() => brand.addFont(family)}>
            {t('brand.add')}
          </button>
        </div>
        <button data-action="brand-more-fonts" onClick={() => useFonts.getState().setDialog(true)}>
          {t('brand.moreFonts')}
        </button>
      </section>

      <section>
        <h3>{t('brand.logos')}</h3>
        <div className="grid">
          {kit.logos.map((l) => (
            <span key={l.id} className="swatch-wrap logo">
              <button className="logo-btn" data-brand-logo={l.id} title={t('brand.logo.insert', { name: l.name })} onClick={() => void placeLogo(l.src)}>
                <img src={l.src} alt={l.name} draggable={false} />
              </button>
              <button className="swatch-x" title={t('brand.removeFromKit')} aria-label={t('brand.remove.label', { name: l.name })} onClick={() => brand.removeLogo(l.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <button data-action="brand-add-logo" disabled={kit.logos.length >= MAX_LOGOS} onClick={() => void addLogo()}>
          {t('brand.logo.add')}
        </button>
      </section>
    </>
  )
}
