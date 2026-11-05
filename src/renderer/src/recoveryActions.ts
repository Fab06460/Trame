import { documentJson } from '@/fileActions'
import { createScheduler } from '@/autosave'
import { parseDocument, useEditor } from '@/store/editor'
import { create } from 'zustand'
import type { RecoveryInfo } from '../../preload'
import { t } from '@/i18n'

/** Copies de secours laissées par une session interrompue, à proposer à l'ouverture ; vide = rien à proposer. */
export const useRecovery = create<{ items: RecoveryInfo[]; set: (items: RecoveryInfo[]) => void }>((set) => ({ items: [], set: (items) => set({ items }) }))

/** Délai de répit après une modification, puis attente maximale : l'écriture d'un document lourd reste rare. */
const DEBOUNCE_MS = 5000
const MAX_WAIT_MS = 30000

/**
 * Tant que le document a des modifications non enregistrées, en garde une copie de secours à intervalles réguliers ;
 * dès qu'il est enregistré ou remplacé, la copie est effacée. Retourne la fonction d'arrêt.
 */
export function startAutosave(): () => void {
  // une copie a été demandée (même si l'écriture n'est pas terminée) : l'effacement doit attendre la fin de cette écriture
  let touched = false
  let inflight: Promise<unknown> = Promise.resolve()
  const scheduler = createScheduler({
    debounceMs: DEBOUNCE_MS,
    maxWaitMs: MAX_WAIT_MS,
    run: async () => {
      const { doc, dirty, filePath } = useEditor.getState()
      if (!dirty) return
      touched = true
      inflight = window.trame.writeRecovery(documentJson(doc, false), filePath, doc.name).catch(() => false)
      await inflight
    }
  })
  const stop = useEditor.subscribe((s, prev) => {
    if (s.dirty) {
      if (s.doc !== prev.doc || !prev.dirty) scheduler.change()
    } else if (prev.dirty) {
      scheduler.cancel()
      if (touched) {
        touched = false
        inflight = inflight.then(() => window.trame.clearRecovery())
      }
    }
  })
  return () => {
    stop()
    scheduler.cancel()
  }
}

/** Cherche les copies de secours d'une session interrompue (au démarrage). */
export async function checkRecovery(): Promise<void> {
  const items = await window.trame.listRecoverable().catch(() => [])
  useRecovery.getState().set(items)
}

/** Reprend une copie : le document est chargé comme modifié (rien n'est écrit tant qu'on n'enregistre pas), puis la copie est retirée de la liste. */
export async function resumeRecovery(info: RecoveryInfo): Promise<boolean> {
  const json = await window.trame.readRecovery(info.id)
  if (!json) {
    await window.trame.showError(t('recovery.failed'), t('recovery.unreadable'))
    await discardRecovery(info)
    return false
  }
  try {
    const doc = parseDocument(json)
    useEditor.getState().loadDocument(doc, info.path)
    // chargé « modifié » : fermer sans enregistrer pose la question, et l'enregistrement remplace le fichier d'origine
    useEditor.setState({ dirty: true })
  } catch (err) {
    await window.trame.showError(t('recovery.failed'), err instanceof Error ? err.message : String(err))
    return false
  }
  await discardRecovery(info)
  return true
}

export async function discardRecovery(info: RecoveryInfo): Promise<void> {
  await window.trame.discardRecovery(info.id)
  useRecovery.getState().set(useRecovery.getState().items.filter((i) => i.id !== info.id))
}
