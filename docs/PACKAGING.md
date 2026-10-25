# Packaging et distribution (macOS)

Trame est empaquetée avec **electron-builder** (configuration dans `package.json`, champ `build`).

## Commandes

| Commande        | Résultat                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `npm run pack`  | `dist/mac-arm64/Trame.app` : app non compressée, pour tester rapidement          |
| `npm run dist`  | Build complet + `dist/Trame-<version>-arm64.dmg` et `dist/Trame-<version>-arm64-mac.zip` |

`dist/` est ignoré par git. Le premier build télécharge (et met en cache) l'archive Electron et les outils DMG : **il faut du réseau une fois**, ensuite plus rien (l'application, elle, n'a jamais besoin de réseau).

Pour changer la version de l'application : modifier `version` dans `package.json` (elle apparaît dans les noms de fichiers et dans « À propos »).

## Contenu et taille

L'app fait environ 260 Mo (Electron/Chromium), le DMG environ 116 Mo. Le code applicatif empaqueté (`app.asar`) ne pèse que 3,7 Mo : **toutes les bibliothèques (React, Konva, polices…) sont compilées dans le bundle du renderer par Vite**, elles sont donc déclarées en `devDependencies` et electron-builder ne les recopie pas. Règle : une dépendance importée par le renderer reste en `devDependencies` ; une dépendance **chargée à l'exécution par le process principal** sans être bundlée (module natif, par exemple) doit aller en `dependencies`.

`files` ne contient que `out/**/*` et `package.json` : ne jamais y ajouter de ressource qui doit être lue au runtime sans vérifier qu'elle est bien dans l'asar.

## Architecture ciblée

Seulement **Apple Silicon (arm64)**. Pour un Mac Intel ou un binaire universel, ajouter `x64` (ou utiliser la cible `universal`) dans `build.mac.target[].arch` ; la taille des fichiers double environ. Non testé.

## Signature et Gatekeeper : état actuel

L'app est signée **ad hoc** (`identity: "-"`, `hardenedRuntime: false`), c'est-à-dire **sans certificat Apple** et **sans notarisation**. Conséquences :

- Sur **la machine qui l'a construite**, elle se lance normalement.
- Sur **un autre Mac**, si le DMG/ZIP a été téléchargé (AirDrop, mail, web), macOS affichera un avertissement et refusera de l'ouvrir au double-clic. Contournements pour l'utilisateur : clic droit sur l'app → *Ouvrir* → *Ouvrir*, ou dans *Réglages Système → Confidentialité et sécurité → Ouvrir quand même*, ou `xattr -cr /Applications/Trame.app` dans le Terminal.
- Une signature ad hoc évite que l'app soit déclarée « endommagée » sur Apple Silicon, qui exige au moins une signature valide pour exécuter du code.

Pourquoi `identity: "-"` et pas `null` : avec `null`, electron-builder laisse la signature d'origine d'Electron, devenue incohérente après modification du bundle (`codesign --verify` échoue). Pourquoi `hardenedRuntime: false` : le runtime durci avec une signature ad hoc empêche le chargement de bibliothèques d'Electron (validation des bibliothèques) tant que l'entitlement correspondant n'est pas fourni ; il n'a d'intérêt que pour la notarisation.

### Pour distribuer à d'autres personnes proprement

Il faut un compte **Apple Developer Program** et un certificat **« Developer ID Application »** (distribution hors App Store). Les certificats « Apple Development » et « Apple Distribution » (celui-ci pour le Mac App Store) ne conviennent **pas** à une distribution directe. Ensuite :

1. Installer le certificat Developer ID dans le trousseau.
2. Dans `package.json` : retirer `identity: "-"` (electron-builder trouve le certificat Developer ID tout seul, ou donner son nom) et supprimer `hardenedRuntime: false` (le runtime durci est requis par la notarisation ; electron-builder applique alors ses entitlements par défaut pour Electron, à surcharger via `mac.entitlements` seulement si nécessaire).
3. Notariser : configurer `mac.notarize` avec les identifiants Apple (variables d'environnement `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, **jamais dans le dépôt**).
4. `npm run dist` puis vérifier : `spctl --assess --type execute -vv dist/mac-arm64/Trame.app`.

Ces étapes n'ont pas été exécutées.

## Icône

`build/icon.icns` (et `build/icon.png`) sont générées par `python3 scripts/make-icon.py` (Pillow requis, `iconutil` de macOS pour l'`.icns`). C'est une icône provisoire dessinée par script ; pour la remplacer, fournir un nouvel `icon.icns` dans `build/` (ou modifier le script). Les deux fichiers sont versionnés.

## Identité de l'application

- `appId` : `app.trame.editor` : **identifiant provisoire**. À remplacer par un identifiant en notation DNS inversée dont vous êtes propriétaire (par ex. `fr.votredomaine.trame`) *avant* la première distribution réelle ; le changer ensuite fait considérer l'app comme une autre application par macOS (préférences, droits).
- `productName` : `Trame` (nom du `.app`).

## Association de fichiers `.trame`

Déclarée dans `build.fileAssociations` (extension `trame`, rôle Éditeur, icône de l'app) : electron-builder écrit `CFBundleDocumentTypes` dans l'`Info.plist`. Une fois **Trame installée** (par ex. dans `/Applications`), macOS l'utilise pour double-clic, « Ouvrir avec » et glisser-déposer d'un `.trame` sur son icône ; les projets ouverts alimentent aussi le menu « Ouvrir récent » du Dock. Côté code : événement `open-file` géré dans `main/index.ts` (voir [ARCHITECTURE.md](ARCHITECTURE.md)).

Points à connaître :

- Le **mode développement** (`npm run dev`, Electron générique) n'est pas associé aux fichiers : seul le `.app` empaqueté l'est. Pour tester sans installer : `npm run pack`, puis `open -n -a dist/mac-arm64/Trame.app un-projet.trame`.
- macOS retient les applications qu'il a **vues** : lancer un build de `dist/` l'enregistre auprès de LaunchServices. Si plusieurs copies de Trame existent (dist, Applications, DMG monté), le Finder peut en choisir une inattendue. Pour désenregistrer une copie : `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u chemin/vers/Trame.app`.
- L'icône des fichiers `.trame` est celle de l'application (pas d'icône de document dédiée).
- Tant que l'app n'est pas signée et notarisée, le premier double-clic sur un autre Mac passe d'abord par l'avertissement Gatekeeper (voir plus haut).
- Windows / Linux : non gérés (il faudrait lire le chemin dans `process.argv` et utiliser `app.requestSingleInstanceLock` / `second-instance`).

## Pièges connus

- **`ELECTRON_RUN_AS_NODE`** : si cette variable d'environnement est définie dans votre shell (certains outils et environnements de développement le font), Electron démarre comme un simple Node : l'app quitte aussitôt sans rien afficher, ou `require('electron')` renvoie un chemin au lieu de l'API (`Cannot read properties of undefined (reading 'handle')`). Lancer avec `env -u ELECTRON_RUN_AS_NODE …`. Attention : sur les macOS récents, `open` **transmet l'environnement du shell** à l'application qu'il lance : la variable est donc héritée aussi par `open -a Trame.app` (symptôme : `bad option: --remote-debugging-port`).
- Les `.woff` et `.woff2` des polices sont tous deux copiés dans le bundle ; seuls les `.woff2` sont utilisés par Chromium. Gain possible : quelques Mo.
- Pas de **mise à jour automatique**.
