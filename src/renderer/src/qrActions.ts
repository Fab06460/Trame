import { DEFAULT_QR, qrElements, qrKept, type QrResult, type QrSpec } from '@/qr'
import { useEditor } from '@/store/editor'
import { t } from '@/i18n'
import type { TrameElement } from '@/types'

/** Insère un QR code d'exemple, centré sur la page, au tiers de son plus petit côté. Ses réglages s'ouvrent dans le panneau de droite. */
export function insertQr(): void {
  const { doc } = useEditor.getState()
  const side = Math.round(Math.min(doc.width, doc.height) * 0.33)
  const res = qrElements({ ...DEFAULT_QR, text: t('qr.sample') }, { x: Math.round((doc.width - side) / 2), y: Math.round((doc.height - side) / 2), width: side, height: side })
  if (res) useEditor.getState().insertChart(res.elements)
}

/** Redessine le QR code de ce fond avec des réglages modifiés, dans le même cadre. Retourne null (rien ne change) si le contenu est vide ou trop long. */
export function updateQr(anchor: TrameElement, patch: Partial<QrSpec>): QrResult | null {
  if (!anchor.qr) return null
  const res = qrElements({ ...anchor.qr, ...patch }, { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height }, { rotation: anchor.rotation, keep: qrKept(anchor) })
  if (res) useEditor.getState().replaceChart(anchor.id, res.elements)
  return res
}
