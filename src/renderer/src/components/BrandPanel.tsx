import { useEffect, useState } from 'react'
import { FONTS } from '@/fonts'
import { MAX_COLORS, MAX_FONTS, MAX_LOGOS } from '@/brandKit'
import { applyColor, applyFont, pickScreenColor, placeLogo } from '@/brandActions'
import { fontName, useBrand } from '@/store/brand'

/** Pastille de couleur : un clic l'applique ; la croix (si `onRemove`) la retire du kit. */
function Swatch({ color, kind, onRemove }: { color: string; kind: 'brand' | 'recent'; onRemove?: () => void }): React.JSX.Element {
  return (
    <span className="swatch-wrap">
      <button className="swatch" data-swatch={kind} style={{ background: color }} title={`${color} — appliquer`} aria-label={`Appliquer ${color}`} onClick={() => applyColor(color)} />
      {onRemove && (
        <button className="swatch-x" data-swatch-remove={color} title="Retirer du kit" aria-label={`Retirer ${color}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

/** Kit de marque : couleurs, polices et logos réutilisables d'un document à l'autre, plus les couleurs récemment utilisées. */
export function BrandPanel(): React.JSX.Element {
  const kit = useBrand((s) => s.kit)
  const recent = useBrand((s) => s.recent)
  const brand = useBrand.getState()
  const [color, setColor] = useState('#7c5cff')
  const [family, setFamily] = useState(FONTS[0].family)
  const hasPipette = 'EyeDropper' in window

  useEffect(() => {
    void useBrand.getState().load()
  }, [])

  const addLogo = async (): Promise<void> => {
    const src = await window.trame.pickImage()
    if (src) brand.addLogo({ id: crypto.randomUUID(), name: `Logo ${kit.logos.length + 1}`, src })
  }

  return (
    <>
      <section>
        <h3>Couleurs de la marque</h3>
        <div className="swatches">
          {kit.colors.map((c) => (
            <Swatch key={c} color={c} kind="brand" onRemove={() => brand.removeColor(c)} />
          ))}
          {kit.colors.length === 0 && <p className="hint">Aucune couleur. Ajoutez celles de votre charte graphique.</p>}
        </div>
        <div className="row">
          <input type="color" data-field="brandColor" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Couleur à ajouter" />
          <button data-action="brand-add-color" disabled={kit.colors.length >= MAX_COLORS} onClick={() => brand.addColor(color)}>
            Ajouter au kit
          </button>
          {hasPipette && (
            <button
              data-action="pipette"
              title="Prélever une couleur à l'écran"
              onClick={async () => {
                const c = await pickScreenColor()
                if (c) setColor(c)
              }}
            >
              Pipette
            </button>
          )}
        </div>
      </section>

      <section>
        <h3>Couleurs récentes</h3>
        <div className="swatches">
          {recent.map((c) => (
            <Swatch key={c} color={c} kind="recent" />
          ))}
          {recent.length === 0 && <p className="hint">Les couleurs que vous appliquez apparaissent ici.</p>}
        </div>
      </section>

      <section>
        <h3>Polices de la marque</h3>
        <div className="stack">
          {kit.fonts.map((f) => (
            <span key={f} className="brand-font">
              <button data-brand-font={f} style={{ fontFamily: f }} title="Appliquer aux textes sélectionnés (ou créer un texte)" onClick={() => applyFont(f)}>
                {fontName(f)}
              </button>
              <button className="swatch-x static" title="Retirer du kit" aria-label={`Retirer ${fontName(f)}`} onClick={() => brand.removeFont(f)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="row">
          <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Police à ajouter" data-field="brandFontSelect">
            {FONTS.map((f) => (
              <option key={f.name} value={f.family}>
                {f.name}
              </option>
            ))}
          </select>
          <button data-action="brand-add-font" disabled={kit.fonts.length >= MAX_FONTS} onClick={() => brand.addFont(family)}>
            Ajouter
          </button>
        </div>
      </section>

      <section>
        <h3>Logos</h3>
        <div className="grid">
          {kit.logos.map((l) => (
            <span key={l.id} className="swatch-wrap logo">
              <button className="logo-btn" data-brand-logo={l.id} title={`${l.name} — insérer`} onClick={() => void placeLogo(l.src)}>
                <img src={l.src} alt={l.name} draggable={false} />
              </button>
              <button className="swatch-x" title="Retirer du kit" aria-label={`Retirer ${l.name}`} onClick={() => brand.removeLogo(l.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <button data-action="brand-add-logo" disabled={kit.logos.length >= MAX_LOGOS} onClick={() => void addLogo()}>
          Ajouter un logo…
        </button>
      </section>
    </>
  )
}
