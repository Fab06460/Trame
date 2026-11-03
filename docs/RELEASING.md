# Publier une version (et mises à jour automatiques)

Les mises à jour d'une application installée viennent des **versions GitHub** (Releases) du dépôt indiqué par le champ `repository` de `package.json`. L'application ne contacte jamais autre chose : au lancement (si le réglage est coché) et à la demande, elle lit la dernière version publiée, **propose** de la télécharger, puis **propose** de redémarrer pour l'installer. Rien n'est téléchargé ni installé sans clic.

## Mise en place (une seule fois)

1. Créer sur GitHub un dépôt **public** (les versions sont lues sans identifiant ; un dépôt privé exigerait un jeton dans l'application, ce qu'on évite).
2. Remplacer `OWNER` par votre nom d'utilisateur GitHub dans `package.json` (champs `repository.url` et `homepage`). Tant que `OWNER` y figure, l'application affiche « mises à jour non configurées » et ne contacte rien.
3. `git remote add origin https://github.com/<utilisateur>/trame.git` puis `git push -u origin main`.

⚠ Avant le premier envoi, vérifier qu'aucun secret n'est suivi : `git ls-files | grep -E '\.(p12|p8|pem|key)$|\.env'` doit ne rien afficher (`.gitignore` ignore ces fichiers ; l'historique a été nettoyé de `Certificats.p12`).

## À chaque version

1. Augmenter `version` dans `package.json` (ex. `0.2.0`), commiter. **Une version plus élevée que l'installée est indispensable** : c'est ce que compare la mise à jour.
2. Étiqueter et envoyer : `git tag v0.2.0 && git push origin main v0.2.0`. Le workflow `.github/workflows/build.yml` :
   - vérifie que l'étiquette correspond à la version de `package.json` ;
   - lance typecheck et tests ;
   - construit **Windows** (installeur NSIS + zip) et **Linux** (AppImage + tar.gz) et les publie dans une **version brouillon** `v0.2.0` avec `latest.yml` / `latest-linux.yml`.
3. Sur le Mac : `npm run release:mac` (signature Developer ID, notarisation, agrafage, vérifications ; voir PACKAGING.md). Joindre ensuite à la **même version brouillon**, par la page web de la version (« Edit » → glisser les fichiers) : `Trame-0.2.0-arm64.dmg`, `Trame-0.2.0-arm64-mac.zip`, leurs `.blockmap` et **`latest-mac.yml`** (tous dans `dist/`).
4. Relire les notes de version, puis **publier** le brouillon (« Publish release »). C'est cette publication qui rend la mise à jour visible aux applications installées (un brouillon est invisible pour elles).

Ne publiez pas tant que les trois systèmes n'ont pas leurs fichiers : une application qui voit la version publiée mais pas son `latest-*.yml` signale une erreur de mise à jour.

## Ce que fait chaque système

| Système | Mise à jour automatique | Remarque |
| --- | --- | --- |
| macOS (arm64) | oui, **si l'application est signée Developer ID** (`release:mac`) | une application signée « ad hoc » (build quotidien) télécharge mais ne peut pas s'installer : l'application l'indique et propose la page de téléchargement |
| Windows (installeur NSIS) | oui | non signé : SmartScreen peut avertir au premier téléchargement ; la version zip portable ne se met pas à jour seule |
| Linux (AppImage) | oui | l'archive `tar.gz` et les paquets se mettent à jour à la main : l'application ouvre la page des versions |

## Vérifier

- `npm run pack` puis `dist/mac-arm64/Trame.app/Contents/Resources/app-update.yml` doit nommer votre dépôt.
- Installer l'ancienne version, publier la suivante, lancer l'ancienne : « Rechercher maintenant » (Fichier → Mises à jour…, ou ⚙ Réglages → numéro de version) doit proposer la nouvelle.
