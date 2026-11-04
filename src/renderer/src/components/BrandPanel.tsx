import { useEffect, useMemo, useState } from 'react'
import { allFonts, FONTS } from '@/fonts'
import { useFonts } from '@/store/fonts'
import { MAX_COLORS, MAX_FONTS, MAX_LOGOS } from '@/brandKit'
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
    if (src) brand.addLogo({ id: crypto.randomUUID(), name: t('brand.logoName', { n: kit.logos.length + 1 }), src })
  }

  return (
    <>
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
