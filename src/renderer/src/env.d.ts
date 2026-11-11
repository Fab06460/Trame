/// <reference types="vite/client" />

/** Données de la bibliothèque d'icônes : chargées à la demande, typées par `iconLibrary.ts` (le fichier est trop gros pour qu'on le laisse TypeScript l'analyser). */
declare module '*/iconData.json' {
  const data: unknown
  export default data
}

/** Lecture des images (ou du son) d'une piste média : disponible dans Chromium, absente des définitions de TypeScript. */
declare class MediaStreamTrackProcessor<T extends VideoFrame | AudioData = VideoFrame | AudioData> {
  constructor(init: { track: MediaStreamTrack })
  readonly readable: ReadableStream<T>
}
