import { create } from 'zustand'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ImportMode } from '@/pdfImport/importPdf'

/** Fenêtre d'import d'un PDF : le fichier choisi, ses options et l'avancement. */
export const usePdfImport = create<{
  pdf: PDFDocumentProxy | null
  bytes: Uint8Array | null
  name: string
  mode: ImportMode
  pages: number
  progress: { done: number; total: number } | null
  open: (pdf: PDFDocumentProxy, name: string, bytes: Uint8Array) => void
  close: () => void
  set: (p: Partial<{ mode: ImportMode; pages: number; progress: { done: number; total: number } | null }>) => void
}>((set, get) => ({
  pdf: null,
  bytes: null,
  name: '',
  mode: 'editable',
  pages: 1,
  progress: null,
  open: (pdf, name, bytes) => set({ pdf, bytes, name, mode: 'editable', pages: Math.min(pdf.numPages, 50), progress: null }),
  close: () => {
    void get().pdf?.cleanup()
    set({ pdf: null, bytes: null, progress: null })
  },
  set: (p) => set(p)
}))
