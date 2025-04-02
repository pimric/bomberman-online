#!/bin/bash

# Aller dans le répertoire du projet
cd /Users/riclamalice/kDrive2/site\ web/games/bomberman

# Installation de nodemon si nécessaire
if ! command -v nodemon &> /dev/null; then
    echo "Installation de nodemon..."
    npm install -g nodemon
fi

# Créer un script temporaire pour exécuter les commandes git
cat > .git-auto-push.sh << 'EOF'
#!/bin/bash
git add .
git commit -m "Bomberman auto-update $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
echo "Modifications du projet Bomberman poussées automatiquement à $(date '+%H:%M:%S')"
EOF

chmod +x .git-auto-push.sh

# Lancer nodemon pour surveiller les changements dans le répertoire
# Ignorer le répertoire .git et node_modules
echo "Démarrage de la surveillance des fichiers pour le projet Bomberman..."
nodemon --watch . --ignore .git/ --ignore node_modules/ --ext '*' --exec './.git-auto-push.sh'
