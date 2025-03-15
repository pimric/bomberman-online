// Fonctions principales du jeu

// Générer une carte aléatoire
function generateMap() {
    const map = [];
    
    for (let y = 0; y < GRID_SIZE; y++) {
        const row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            if (x % 2 === 0 && y % 2 === 0) {
                row.push(TILE_TYPES.WALL);
            } 
            else if ((x < 2 && y < 2) || (x > GRID_SIZE - 3 && y > GRID_SIZE - 3)) {
                row.push(TILE_TYPES.EMPTY);
            }
            else {
                row.push(Math.random() < 0.7 ? TILE_TYPES.BRICK : TILE_TYPES.EMPTY);
            }
        }
        map.push(row);
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

// Vérifier si une position est valide
function isValidPosition(x, y) {
    const gridX = Math.floor(x / TILE_SIZE);
    const gridY = Math.floor(y / TILE_SIZE);
    
    // Vérifier si on est dans les limites de la carte
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
        return false;
    }
    
    // Vérifier s'il y a un mur ou une brique
    return gameState.map[gridY][gridX] === TILE_TYPES.EMPTY;
}

// Mettre à jour la position du joueur
function updatePlayerPosition(playerData, dx, dy) {
    const newX = playerData.x + dx;
    const newY = playerData.y + dy;
    
    // Vérifier les collisions pour X et Y séparément
    if (isValidPosition(newX, playerData.y)) {
        playerData.x = newX;
    }
    
    if (isValidPosition(playerData.x, newY)) {
        playerData.y = newY;
    }
}

// Mettre à jour l'état du jeu
function update() {
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
        
        // Le reste du code update...
    }
    
    // Vérifier si l'IA est morte (en mode IA)
    if (aiMode && gameState.players[aiPlayerId] && !gameState.players[aiPlayerId].alive) {
        if (aiMoveInterval) {
            clearInterval(aiMoveInterval);
            gameInfo.textContent = `Victoire - Vous avez battu l'IA !`;
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