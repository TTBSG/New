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

- **6 secteurs** : café, boulangerie, restaurant, boutique de vêtements, magasin d'électronique et supérette.
- **4 emplacements**, avec chacun son loyer et sa fréquentation.
- **Produits** : prix de vente, fournisseur (Économique, Standard ou Premium, qui changent la qualité et le coût) et stock cible avec réapprovisionnement automatique.
- **Équipe** : recrutement de candidats renouvelés chaque lundi, compétence, moral, salaires, licenciements avec indemnité, managers et démissions.
- **Clients** : demande calculée selon le prix, la qualité, la réputation, le marketing, le jour de la semaine, la conjoncture et des événements aléatoires.
- **Finances** : compte de résultat, graphiques, prêts bancaires, vente d'entreprises et faillite après 30 jours de trésorerie négative.
- **Sauvegarde automatique** dans le navigateur.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `src/game/sectors.ts` | Données du jeu (secteurs, produits, métiers, emplacements, événements). Pour **ajouter un secteur**, il suffit d'ajouter une entrée ici. |
| `src/game/engine.ts` | Moteur de simulation (journée, clients, stocks, employés, banque). |
| `src/game/engine.test.ts` | Tests automatiques du moteur (`npm test`). |
| `src/ui/` | Écrans de l'application. |

## Commandes

- `npm run dev` : lance le jeu en développement.
- `npm test` : lance les tests.
- `npm run build` : produit la version finale dans `dist/`.
