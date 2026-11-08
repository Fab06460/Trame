import { pageLinks } from '@/links'
import { usePresentation } from '@/store/presentation'
import { useT } from '@/i18n'
import type { TrameDocument, TramePage } from '@/types'

/**
 * Les liens de la page affichée en présentation : une zone invisible par élément lié, à la place de son rectangle englobant (déjà dans
 * l'image de la page). Un clic ouvre l'adresse dans le navigateur du système ou saute à la page visée, sans passer à la page suivante.
 * Posée par-dessus les clips ; désactivée pendant l'annotation à l'écran.
 */
export function PresentationLinks({ doc, page, rect, disabled }: { doc: TrameDocument; page: TramePage; rect: { x: number; y: number; k: number }; disabled: boolean }): React.JSX.Element | null {
  const t = useT()
  const links = pageLinks(doc, page)
  if (!links.length) return null
  return (
    <>
      {links.map(({ el, target, box }) => {
        const label = target.kind === 'url' ? t('pres.link.url', { url: target.url }) : t('pres.link.page', { n: target.index + 1 })
        return (
          <div
            key={el.id}
            className="presentation-link"
            role="link"
            aria-label={label}
            title={label}
            data-pres-link={target.kind === 'url' ? target.url : `page:${target.index + 1}`}
            style={{ left: rect.x + box.x * rect.k, top: rect.y + box.y * rect.k, width: box.width * rect.k, height: box.height * rect.k, pointerEvents: disabled ? 'none' : undefined }}
            onClick={(e) => {
              e.stopPropagation()
              if (target.kind === 'url') void window.trame.openLink(target.url)
              else usePresentation.getState().go(target.index)
            }}
          />
        )
      })}
    </>
  )
}
