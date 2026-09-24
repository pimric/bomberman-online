# Prompts Gemini — personnages à tête d'animal

Référence à joindre à chaque prompt : `assets/src/personnage.png`
(https://raw.githubusercontent.com/pimric/bomberman-online/main/assets/src/personnage.png).
Fichiers attendus : `assets/src/perso_<animal>.png` (goeland, poisson, tortue, crabe, flamant, dauphin).

Contraintes du découpage (`tools/build_sprites.py`) :
- 3 lignes de 7 personnages, même mise en page que la référence (face, dos, profil vers la droite).
- Fond magenta pur #FF00FF, personnages bien séparés.
- Maillot **bleu vif** #1E5BFF (et non rouge comme la référence) : c'est la couleur recolorée
  pour les 4 joueurs, elle ne doit se trouver nulle part ailleurs (crabe et flamant sont rouges/roses).

## Bloc commun (déjà inclus dans chaque prompt ci-dessous)

> Planche de sprites pour un jeu vidéo 2D (style chibi cartoon, contours bruns épais, couleurs plates, comme l'image jointe). Reprends EXACTEMENT la mise en page de l'image jointe : 3 lignes de 7 personnages, mêmes poses, mêmes proportions, même taille, même espacement. Ligne 1 : vue de face (7 poses identiques à la référence). Ligne 2 : vue de dos (7 poses identiques à la référence). Ligne 3 : vue de profil tournée vers la droite, les 7 étapes du cycle de marche de la référence.
> Le corps est le même que la référence (femme, peau, bras, jambes, pieds nus) mais la tête humaine est remplacée par [TÊTE]. Elle porte des lunettes de soleil noires sur les 21 images (visibles de face et de profil, branche visible de dos si possible).
> Maillot de bain une pièce BLEU VIF uni (#1E5BFF), sans motif, identique sur les 21 images. Aucune autre partie du personnage n'est bleu vif.
> Fond uni magenta pur #FF00FF partout, sans dégradé, sans ombre au sol, sans texte, sans cadre, sans numéro. Les 21 personnages sont bien séparés, jamais collés. Même personnage et mêmes couleurs sur les 21 images. La tête doit rester lisible en tout petit (32 pixels) : formes simples, contrastes francs, pas de détails fins.

## Les 6 prompts
(voir le message de la session ou copier le bloc commun en remplaçant [TÊTE])

- **Goéland** : une tête de goéland blanche, dessus du crâne gris clair, gros bec jaune avec une tache rouge au bout, petit air malicieux.
- **Poisson-clown** : une tête de poisson-clown orange vif avec deux larges bandes blanches bordées de noir, petites nageoires orange sur les côtés de la tête, bouche souriante.
- **Tortue** : une tête de tortue de mer vert olive avec quelques écailles plus claires, bec arrondi, sourire tranquille.
- **Crabe** : une tête de crabe ronde rouge orangé, deux yeux ronds sur de courts pédoncules au-dessus des lunettes, petite bouche souriante (mains humaines, pas de pinces).
- **Flamant rose** : une tête de flamant rose avec un cou court et stylisé (pour garder la même hauteur que la référence), bec recourbé rose clair à bout noir.
- **Dauphin** : une tête de dauphin gris clair (pas bleu), ventre et menton blanc cassé, rostre court et arrondi, grand sourire.
