import { create } from 'zustand'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ImportMode } from '@/pdfImport/importPdf'
import type { OcrLanguage } from '@/ocr/languages'

/** Fenêtre d'import d'un PDF : le fichier choisi, ses options et l'avancement. */
export const usePdfImport = create<{
  pdf: PDFDocumentProxy | null
  bytes: Uint8Array | null
  name: string
  mode: ImportMode
  pages: number
  progress: { done: number; total: number } | null
  /** le PDF semble scanné (aucun texte sur ses premières pages) */
  scanned: boolean
  /** reconnaître le texte des pages sans texte (OCR), et dans quelle langue */
  ocr: boolean
  ocrLanguage: OcrLanguage
  /** arrête l'import en cours */
  abort: AbortController | null
  open: (pdf: PDFDocumentProxy, name: string, bytes: Uint8Array, scanned?: boolean) => void
  close: () => void
  set: (p: Partial<{ mode: ImportMode; pages: number; progress: { done: number; total: number } | null; ocr: boolean; ocrLanguage: OcrLanguage; abort: AbortController | null }>) => void
}>((set, get) => ({
  pdf: null,
  bytes: null,
  name: '',
  mode: 'editable',
  pages: 1,
  progress: null,
  scanned: false,
  ocr: false,
  ocrLanguage: 'eng',
  abort: null,
  open: (pdf, name, bytes, scanned = false) => set({ pdf, bytes, name, mode: 'editable', pages: Math.min(pdf.numPages, 50), progress: null, scanned, ocr: scanned, abort: null }),
  close: () => {
    void get().pdf?.cleanup()
    set({ pdf: null, bytes: null, progress: null, abort: null })
  },
  set: (p) => set(p)
}))
