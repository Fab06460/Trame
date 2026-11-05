const SIDE = 200
const cache = new Map<string, string>()
let running = 0
const waiting: Array<() => void> = []
const MAX_PARALLEL = 3

const slot = (): Promise<void> =>
  new Promise((resolve) => {
    const go = (): void => {
      running++
      resolve()
    }
    if (running < MAX_PARALLEL) go()
    else waiting.push(go)
  })
const release = (): void => {
  running--
  waiting.shift()?.()
}

const decode = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image illisible'))
    img.src = src
  })

/** Vignette (data URL réduite à 200 px) d'une image de la bibliothèque ; lue à la demande, trois à la fois, gardée en mémoire. `null` si illisible. */
export async function mediaThumb(path: string, version = ''): Promise<string | null> {
  const key = `${version}|${path}`
  const hit = cache.get(key)
  if (hit) return hit
  await slot()
  try {
    const data = await window.trame.readMedia(path)
    if (!data) return null
    const img = await decode(data)
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth || SIDE, img.naturalHeight || SIDE))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((img.naturalWidth || SIDE) * k))
    canvas.height = Math.max(1, Math.round((img.naturalHeight || SIDE) * k))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL(data.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png', 0.8)
    cache.set(key, url)
    return url
  } catch {
    return null
  } finally {
    release()
  }
}
