import fraData from '@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz?url'
import engData from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'
import deuData from '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz?url'
import spaData from '@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz?url'

/** Langues de reconnaissance, incluses dans l'application (aucun téléchargement). Les codes sont ceux de Tesseract. */
export const OCR_LANGUAGES = ['fra', 'eng', 'deu', 'spa'] as const
export type OcrLanguage = (typeof OCR_LANGUAGES)[number]

/** Adresse des données de chaque langue (le dossier est passé au moteur, qui y cherche `<code>.traineddata.gz`). */
export const OCR_DATA: Record<OcrLanguage, string> = { fra: fraData, eng: engData, deu: deuData, spa: spaData }

/** La langue de reconnaissance qui correspond à la langue de l'interface (français, anglais, allemand, espagnol). */
export function languageForLocale(locale: string): OcrLanguage {
  return ({ fr: 'fra', en: 'eng', de: 'deu', es: 'spa' } as Record<string, OcrLanguage>)[locale.slice(0, 2).toLowerCase()] ?? 'eng'
}

export const isOcrLanguage = (v: unknown): v is OcrLanguage => OCR_LANGUAGES.includes(v as OcrLanguage)
