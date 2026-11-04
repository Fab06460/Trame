import { DEFAULT_ACCENT, DEFAULT_INK, fromRaw, illustrationElements, type Illustration, type RawIllustrations } from '@/illustrations'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'
import type { MessageKey } from '@shared/i18n'

let loading: Promise<Illustration[]> | null = null

/** Charge les illustrations (1 Mo) au premier besoin seulement : elles font un fichier à part dans l'application. */
export function loadIllustrations(): Promise<Illustration[]> {
  loading ??= import('./illustrationData.json').then((m) => fromRaw(m.default as RawIllustrations))
  loading.catch(() => (loading = null)) // un échec de chargement n'est pas mémorisé : on réessaiera
  return loading
}

export const illustrationName = (id: string): string => t(`illus.name.${id}` as MessageKey)

export { DEFAULT_ACCENT, DEFAULT_INK }

/** Insère l'illustration au centre de la page : un groupe de tracés ordinaires (une seule étape d'historique), sélectionné. */
export function insertIllustration(ill: Illustration, colors: { ink: string; accent: string }): void {
  const s = useEditor.getState()
  s.insertChart(illustrationElements(ill, s.doc, colors, illustrationName(ill.id)))
}
