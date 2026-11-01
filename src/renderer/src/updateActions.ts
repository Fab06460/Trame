import { confirmUnsaved } from '@/fileActions'
import { useUpdate } from '@/store/update'

/** Suit l'état des mises à jour envoyé par le processus principal ; retourne la fonction d'arrêt. */
export function startUpdateWatch(): () => void {
  const stop = window.trame.onUpdateState((s) => useUpdate.getState().set(s))
  void window.trame.getUpdateState().then((s) => useUpdate.getState().set(s)).catch(() => {})
  return stop
}

/** Installe la mise à jour téléchargée : on propose d'abord d'enregistrer le travail, puis l'application se relance. */
export async function installUpdate(): Promise<void> {
  if (!(await confirmUnsaved('close'))) return
  await window.trame.installUpdate()
}
