// Fonctions principales du jeu

// Générer une carte aléatoire avec des chemins garantis
function generateMap() {
    const map = [];
    
    // Initialiser la carte avec des murs fixes et le reste vide
    for (let y = 0; y < GRID_SIZE; y++) {
        const row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            if (x % 2 === 0 && y % 2 === 0) {
                // Murs fixes qui ne peuvent pas être détruits
                row.push(TILE_TYPES.WALL);
            } else {
                // Tout le reste est vide au départ
                row.push(TILE_TYPES.EMPTY);
            }
        }
        map.push(row);
    }
    
    // Garantir des zones de départ vides pour les joueurs
    // Pour le joueur 1 (coin supérieur gauche)
    map[0][0] = TILE_TYPES.EMPTY;
    map[0][1] = TILE_TYPES.EMPTY;
    map[1][0] = TILE_TYPES.EMPTY;
    
    // Pour l'IA ou le joueur 2 (coin inférieur droit)
    map[GRID_SIZE-1][GRID_SIZE-1] = TILE_TYPES.EMPTY;
    map[GRID_SIZE-1][GRID_SIZE-2] = TILE_TYPES.EMPTY;
    map[GRID_SIZE-2][GRID_SIZE-1] = TILE_TYPES.EMPTY;
    
    // Ajouter des briques destructibles de manière aléatoire
    // mais en s'assurant qu'il y a toujours un chemin possible
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Si c'est un emplacement vide (pas un mur fixe) et pas dans les zones de départ
            if (map[y][x] === TILE_TYPES.EMPTY && 
                !((x <= 1 && y <= 1) || (x >= GRID_SIZE-2 && y >= GRID_SIZE-2))) {
                
                // Probabilité de 60% d'avoir une brique
                if (Math.random() < 0.6) {
                    map[y][x] = TILE_TYPES.BRICK;
                }
            }
        }
    }
    
    // Garantir un chemin entre le coin supérieur gauche et le coin inférieur droit
    // en utilisant un algorithme simple qui crée un chemin en zigzag
    
    // Chemin horizontal
    for (let x = 2; x < GRID_SIZE - 2; x += 2) {
        // Si c'est un indice pair, on s'assure qu'il y a un passage horizontal
        map[1][x] = TILE_TYPES.EMPTY;
    }
    
    // Chemin vertical
    for (let y = 3; y < GRID_SIZE - 1; y += 2) {
        // On s'assure qu'il y a un passage vertical
        map[y][GRID_SIZE - 2] = TILE_TYPES.EMPTY;
    }
    
    return map;
}

// Créer un joueur
function createPlayer(x, y, color) {
    return {
        x: x * TILE_SIZE + TILE_SIZE / 2,
        y: y * TILE_SIZE + TILE_SIZE / 2,
        radius: TILE_SIZE / 2 - 4,
        color: color,
        maxBombs: 1,
        bombRange: 1,
        alive: true
    };
}

// Générer un ID unique
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Vérification de position améliorée
function isValidPosition(x, y) {
    const gridX = Math.floor(x / TILE_SIZE);
    const gridY = Math.floor(y / TILE_SIZE);
    
    // Vérifier si on est dans les limites de la carte
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
        return false;
    }
    
    // Vérifier en tenant compte d'une "hitbox" légèrement plus petite que le joueur
    // pour éviter de "coller" aux murs
    const margin = 2; // Marge en pixels
    
    // Vérifier les quatre coins du joueur avec la marge
    const points = [
        { x: x - TILE_SIZE/2 + margin, y: y - TILE_SIZE/2 + margin }, // Coin supérieur gauche
        { x: x + TILE_SIZE/2 - margin, y: y - TILE_SIZE/2 + margin }, // Coin supérieur droit
        { x: x - TILE_SIZE/2 + margin, y: y + TILE_SIZE/2 - margin }, // Coin inférieur gauche
        { x: x + TILE_SIZE/2 - margin, y: y + TILE_SIZE/2 - margin }  // Coin inférieur droit
    ];
    
    // Vérifier chaque point
    for (const point of points) {
        const pointGridX = Math.floor(point.x / TILE_SIZE);
        const pointGridY = Math.floor(point.y / TILE_SIZE);
        
        // Si ce point est hors des limites ou sur un obstacle
        if (pointGridX < 0 || pointGridX >= GRID_SIZE || 
            pointGridY < 0 || pointGridY >= GRID_SIZE ||
            gameState.map[pointGridY][pointGridX] !== TILE_TYPES.EMPTY) {
            return false;
        }
    }
    
    return true;
}

// Mettre à jour la position du joueur avec une meilleure gestion des collisions
function updatePlayerPosition(playerData, dx, dy) {
    // Essayer de bouger sur les deux axes indépendamment
    const newX = playerData.x + dx;
    const newY = playerData.y + dy;
    
    // Essayer d'abord le mouvement complet
    if (isValidPosition(newX, newY)) {
        playerData.x = newX;
        playerData.y = newY;
        return;
    }
    
    // Si le mouvement complet échoue, essayer juste horizontalement
    if (dx !== 0 && isValidPosition(newX, playerData.y)) {
        playerData.x = newX;
    }
    
    // Puis essayer juste verticalement
    if (dy !== 0 && isValidPosition(playerData.x, newY)) {
        playerData.y = newY;
    }
}

// Mettre à jour l'état du jeu
function update() {
    if (!gameState.roomId || !gameState.playerId || !gameState.gameStarted) return;
    
    const player = gameState.players[gameState.playerId];
    if (!player || !player.alive) {
        // Si le joueur est mort et qu'on est en mode IA, afficher le message approprié
        if (aiMode && aiMoveInterval) {
            clearInterval(aiMoveInterval);
            gameInfo.textContent = `Game Over - Vous avez perdu !`;
            // Assurer que les boutons de contrôle sont visibles
            document.getElementById('gameControls').style.display = 'block';
        }
        return;
    }
    
    // Vérifier si l'IA est morte (en mode IA)
    if (aiMode && gameState.players[aiPlayerId] && !gameState.players[aiPlayerId].alive) {
        if (aiMoveInterval) {
            clearInterval(aiMoveInterval);
            gameInfo.textContent = `Victoire - Vous avez battu l'IA !`;
            // Assurer que les boutons de contrôle sont visibles
            document.getElementById('gameControls').style.display = 'block';
        }
    }
    
    let playerMoved = false;
    
    // Mouvement selon le joueur
    if (gameState.playerId === 'player1') {
        // Joueur 1 (ZQSD)
        if (gameState.keys['z']) {
            updatePlayerPosition(player, 0, -PLAYER_SPEED);
            playerMoved = true;
        }
        if (gameState.keys['s']) {
            updatePlayerPosition(player, 0, PLAYER_SPEED);
            playerMoved = true;
        }
        if (gameState.keys['q']) {
            updatePlayerPosition(player, -PLAYER_SPEED, 0);
            playerMoved = true;
        }
        if (gameState.keys['d']) {
            updatePlayerPosition(player, PLAYER_SPEED, 0);
            playerMoved = true;
        }
    } else {
        // Joueur 2 (Flèches)
        if (gameState.keys['ArrowUp']) {
            updatePlayerPosition(player, 0, -PLAYER_SPEED);
            playerMoved = true;
        }
        if (gameState.keys['ArrowDown']) {
            updatePlayerPosition(player, 0, PLAYER_SPEED);
            playerMoved = true;
        }
        if (gameState.keys['ArrowLeft']) {
            updatePlayerPosition(player, -PLAYER_SPEED, 0);
            playerMoved = true;
        }
        if (gameState.keys['ArrowRight']) {
            updatePlayerPosition(player, PLAYER_SPEED, 0);
            playerMoved = true;
        }
    }
    
    // Mettre à jour la position sur Firebase si le joueur a bougé
    if (playerMoved) {
        database.ref(`games/${gameState.roomId}/players/${gameState.playerId}`).update({
            x: player.x,
            y: player.y
        });
    }
    
    // Mettre à jour les explosions
    updateExplosions();
}

// Dessiner le jeu
function render() {
    // Effacer le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Si pas de jeu en cours, afficher un écran d'attente
    if (!gameState.map || gameState.map.length === 0) {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('En attente de la création/connexion à une partie...', canvas.width/2, canvas.height/2);
        return;
    }
    
    // Dessiner la carte
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const tileType = gameState.map[y][x];
            const tileX = x * TILE_SIZE;
            const tileY = y * TILE_SIZE;
            
            // Couleur selon le type de case
            if (tileType === TILE_TYPES.WALL) {
                ctx.fillStyle = '#333';
            } else if (tileType === TILE_TYPES.BRICK) {
                ctx.fillStyle = '#8B4513';
            } else {
                ctx.fillStyle = '#222';
            }
            
            // Dessiner la case
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            
            // Ajouter une bordure
            ctx.strokeStyle = '#111';
            ctx.strokeRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
        }
    }
    
    // Dessiner les explosions
    renderExplosions();
    
    // Dessiner les bombes
    renderBombs();
    
    // Dessiner les joueurs
    for (const playerId in gameState.players) {
        const playerData = gameState.players[playerId];
        if (playerData && playerData.alive) {
            ctx.fillStyle = playerData.color;
            ctx.beginPath();
            ctx.arc(playerData.x, playerData.y, playerData.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Gérer les entrées clavier
window.addEventListener('keydown', (e) => {
    gameState.keys[e.key] = true;
    
    // Touche espace pour poser une bombe
    if (e.key === ' ' && gameState.gameStarted) {
        placeBomb();
    }
});

window.addEventListener('keyup', (e) => {
    gameState.keys[e.key] = false;
});

// Nettoyage lors de la fermeture de la page
window.addEventListener('beforeunload', () => {
    if (aiMoveInterval) {
        clearInterval(aiMoveInterval);
    }
});

// Boucle de jeu principale
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

// Démarrer le jeu
gameLoop();