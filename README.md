# Business Empire

Jeu mobile de gestion d'entreprises, inspiré de Big Ambitions, Business Tycoon, Coffee Inc 2 et Life Sim.

## Jouer sur téléphone

Le jeu est publié automatiquement sur **https://ttbsg.github.io/New/** à chaque mise à jour.

Pour l'installer comme une application :
- **iPhone (Safari)** : bouton Partager, puis « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮, puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».

## Jouer sur ordinateur (développement)

```bash
npm install
npm run dev
```

Ouvrez ensuite l'adresse affichée (par exemple http://localhost:5173) dans le navigateur. Pour jouer sur votre téléphone, il doit être sur le même réseau Wi-Fi et vous lancez `npm run dev -- --host`.

## Ce que contient le prototype

- **Une ville isométrique** de 4 quartiers. Chaque local à louer a son adresse, son loyer et sa fréquentation. On se déplace au doigt, on zoome à deux doigts, et des calques « Fréquentation » et « Loyers » aident à choisir l'emplacement.
- **Le téléphone du jeu** : toute la gestion passe par des applis (Messages, Commerces, Banque, Compta, Recrut', Actus, Réglages), avec un widget de trésorerie et des notifications. D'autres applis sont prévues (Fournisseurs, Immo, Bourse, Logistique).
- **Messages et décisions** : employés qui demandent une augmentation, fournisseurs qui proposent des affaires, propriétaires qui augmentent le loyer, presse, conseils de démarrage. Chaque choix a des conséquences, et une demande ignorée finit par expirer. Le jeu se met en pause quand une décision arrive.
- **6 secteurs** : café, boulangerie, restaurant, boutique de vêtements, magasin d'électronique et supérette.
- **Produits** : prix de vente, fournisseur (Économique, Standard ou Premium, qui changent la qualité et le coût) et stock cible avec réapprovisionnement automatique.
- **Équipe** : recrutement de candidats renouvelés chaque lundi, compétence, moral, salaires, licenciements avec indemnité, managers et démissions.
- **Clients** : demande calculée selon le prix, la qualité, la réputation, le marketing, le jour de la semaine, la conjoncture et des événements aléatoires.
- **Finances** : compte de résultat, graphiques, prêts bancaires, vente d'entreprises et faillite après 30 jours de trésorerie négative.
- **Sauvegarde automatique** dans le navigateur.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `src/game/sectors.ts` | Données du jeu (secteurs, produits, métiers, emplacements, événements). Pour **ajouter un secteur**, il suffit d'ajouter une entrée ici. |
| `src/game/city.ts` | Génération de la ville (parcelles, rues, adresses, loyers, fréquentation). |
| `src/game/messages.ts` | Messagerie : événements, choix et conséquences. |
| `src/game/engine.ts` | Moteur de simulation (journée, clients, stocks, employés, banque). |
| `src/game/engine.test.ts` | Tests automatiques du moteur (`npm test`). |
| `src/ui/` | Écrans de l'application. |
| `src/ui/city/` | Rendu isométrique de la ville et gestes (glisser, pincer, toucher). |
| `src/ui/phone/` | Le téléphone du jeu et ses applis. |
| `src/ui/icons.tsx` | Jeu d'icônes maison. |
| `src/index.css` | Charte graphique (couleurs, formes, composants). |

## Commandes

- `npm run dev` : lance le jeu en développement.
- `npm test` : lance les tests.
- `npm run build` : produit la version finale dans `dist/`.
