import type Konva from 'konva'

export interface StageHandle {
  stage: Konva.Stage
  transformer: Konva.Transformer
  /** zone du design dans le stage, en pixels écran */
  rect: { x: number; y: number; width: number; height: number }
  scale: number
}

let current: StageHandle | null = null

export const registerStage = (h: StageHandle | null): void => {
  current = h
}

/** Exporte le design en pleine résolution (sans poignées de sélection). */
export function exportDataUrl(type: 'image/png' | 'image/jpeg'): string | null {
  if (!current) return null
  const { stage, transformer, rect, scale } = current
  const visible = transformer.visible()
  transformer.visible(false)
  const url = stage.toDataURL({
    mimeType: type,
    quality: 0.92,
    pixelRatio: 1 / scale,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  })
  transformer.visible(visible)
  return url
}
