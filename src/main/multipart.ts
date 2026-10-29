/** Corps `multipart/form-data` (Cloudflare et OpenAI exigent ce format pour envoyer une image). Pur, sans dépendance. */

export interface MultipartFile {
  field: string
  filename: string
  contentType: string
  bytes: Uint8Array
}

const clean = (s: string): string => s.replace(/[\r\n"\\]/g, '_')

export function buildMultipart(fields: Record<string, string | number>, files: MultipartFile[], boundary = `----trame${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`): { body: Buffer; contentType: string } {
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${clean(name)}"\r\n\r\n${String(value)}\r\n`, 'utf-8'))
  }
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${clean(f.field)}"; filename="${clean(f.filename)}"\r\nContent-Type: ${clean(f.contentType)}\r\n\r\n`, 'utf-8'), Buffer.from(f.bytes), Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}
