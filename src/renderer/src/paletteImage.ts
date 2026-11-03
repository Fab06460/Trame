/** Plus grand côté de l'image sur laquelle on compte les couleurs : 128 px suffisent à une palette, et c'est instantané. */
const SAMPLE_SIDE = 128

/** Pixels (RVBA) d'une image réduite, prête pour `extractPalette`. */
export function samplePixels(src: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const k = Math.min(1, SAMPLE_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
    }
    img.onerror = () => reject(new Error('unreadable'))
    img.src = src
  })
}
