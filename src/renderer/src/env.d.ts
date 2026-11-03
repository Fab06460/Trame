/// <reference types="vite/client" />

/** Données de la bibliothèque d'icônes : chargées à la demande, typées par `iconLibrary.ts` (le fichier est trop gros pour qu'on le laisse TypeScript l'analyser). */
declare module '*/iconData.json' {
  const data: unknown
  export default data
}
