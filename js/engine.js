// SYNC_MARKER: core_imports
// Ce marqueur est pour les importations et déclarations nécessaires
// END_SYNC_MARKER: core_imports

// SYNC_MARKER: core_update
/**
 * Fonction centrale de mise à jour du jeu.
 * @depends config.js:game_constants
 * @depends game.js:position_validation
 * @provides function update()
 */
function update() {
    if (!gameState.roomId || !gameState.playerId || !gameState.gameStarted) return;
    
    // Vérifier si le jeu est terminé
    if (checkGameOver()) return;
    
    const player = gameState.players[gameState.playerId];
    if (!player || !player.alive) return;
    
    let playerMoved = false;
    
    // Gestion des entrées utilisateur
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
    
    // Mettre à jour la position sur Firebase si le joueur a bougé
    if (playerMoved) {
        database.ref(`games/${gameState.roomId}/players/${gameState.playerId}`).update({
            x: player.x,
            y: player.y
        });
    }
    
    // Mettre à jour les explosions et bombes
    updateExplosions();
}
// END_SYNC_MARKER: core_update

// SYNC_MARKER: core_render
/**
 * Fonction centrale de rendu du jeu.
 * @depends config.js:game_constants
 * @provides function render()
 */
function render() {
    // Effacer le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Si pas de jeu en cours, afficher un écran d'attente
    if (!gameState.map || gameState.map.length === 0) {
        renderWaitingScreen();
        return;
    }
    
    // Dessiner la carte
    renderMap();
    
    // Dessiner les explosions
    renderExplosions();
    
    // Dessiner les bombes
    renderBombs();
    
    // Dessiner les joueurs
    renderPlayers();
}

// Écran d'attente
function renderWaitingScreen() {
    ctx.fillStyle = '#006699';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px "Comic Sans MS"';
    ctx.textAlign = 'center';
    ctx.fillText('En attente de la création/connexion à une partie...', canvas.width/2, canvas.height/2);
}

// Rendu de la carte
function renderMap() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const tileType = gameState.map[y][x];
            const tileX = x * TILE_SIZE;
            const tileY = y * TILE_SIZE;
            
            // Couleur selon le type de case
            if (tileType === TILE_TYPES.WALL) {
                // Mur solide (style palmier)
                ctx.fillStyle = '#006633';
            } else if (tileType === TILE_TYPES.BRICK) {
                // Briques destructibles (tonneaux)
                ctx.fillStyle = '#993300';
            } else {
                // Cases vides (sable)
                ctx.fillStyle = '#f9e8b0';
            }
            
            // Dessiner la case
            ctx.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            
            // Ajouter une bordure
            ctx.strokeStyle = '#111';
            ctx.strokeRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
            
            // Ajouter des détails selon le type
            if (tileType === TILE_TYPES.WALL) {
                renderWallTile(tileX, tileY);
            } else if (tileType === TILE_TYPES.BRICK) {
                renderBrickTile(tileX, tileY);
            }
        }
    }
}

// Rendu des tuiles de mur (palmiers)
function renderWallTile(tileX, tileY) {
    // Dessiner un petit palmier
    ctx.fillStyle = '#004d00';
    ctx.fillRect(tileX + 5, tileY + 15, 8, 12);
    ctx.beginPath();
    ctx.moveTo(tileX + 9, tileY + 15);
    ctx.lineTo(tileX + 3, tileY + 5);
    ctx.lineTo(tileX + 15, tileY + 8);
    ctx.lineTo(tileX + 9, tileY + 15);
    ctx.fill();
}

// Rendu des tuiles destructibles (tonneaux)
function renderBrickTile(tileX, tileY) {
    // Dessiner les lignes du tonneau
    ctx.strokeStyle = '#cc6600';
    ctx.beginPath();
    ctx.moveTo(tileX, tileY + 10);
    ctx.lineTo(tileX + TILE_SIZE, tileY + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tileX, tileY + 20);
    ctx.lineTo(tileX + TILE_SIZE, tileY + 20);
    ctx.stroke();
}

// Rendu des joueurs
function renderPlayers() {
    for (const playerId in gameState.players) {
        const playerData = gameState.players[playerId];
        if (playerData && playerData.alive) {
            // Fond du joueur
            ctx.fillStyle = playerData.color;
            ctx.beginPath();
            ctx.arc(playerData.x, playerData.y, playerData.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Visage du personnage
            ctx.fillStyle = 'white';
            // Yeux
            ctx.beginPath();
            ctx.arc(playerData.x - 5, playerData.y - 3, 3, 0, Math.PI * 2);
            ctx.arc(playerData.x + 5, playerData.y - 3, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupilles
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(playerData.x - 5, playerData.y - 3, 1.5, 0, Math.PI * 2);
            ctx.arc(playerData.x + 5, playerData.y - 3, 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Sourire
            ctx.beginPath();
            ctx.arc(playerData.x, playerData.y + 2, 5, 0, Math.PI);
            ctx.stroke();
        }
    }
}
// END_SYNC_MARKER: core_render

// SYNC_MARKER: core_collision
/**
 * Fonctions de vérification de collision centralisées
 * @depends config.js:game_constants
 * @provides function isValidPosition(), checkPlayersInExplosion(), checkBombsInExplosion()
 */
// Vérification de position améliorée
function isValidPosition(x, y) {
    const gridX = Math.floor(x / TILE_SIZE);
    const gridY = Math.floor(y / TILE_SIZE);
    
    // Vérifier si on est dans les limites de la carte
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
        return false;
    }
    
    // Vérifier en tenant compte d'une "hitbox" légèrement plus petite que le joueur
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

// Vérifier si des joueurs sont touchés par l'explosion
function checkPlayersInExplosion(explosionCells) {
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (!player || !player.alive) continue;
        
        // Obtenir la position du joueur sur la grille
        const playerGridX = Math.floor(player.x / TILE_SIZE);
        const playerGridY = Math.floor(player.y / TILE_SIZE);
        
        // Vérifier si le joueur est dans une cellule touchée par l'explosion
        const isHit = explosionCells.some(cell => cell.x === playerGridX && cell.y === playerGridY);
        
        if (isHit) {
            // Marquer le joueur comme mort
            database.ref(`games/${gameState.roomId}/players/${playerId}/alive`).set(false);
        }
    }
}

// Vérifier si d'autres bombes sont touchées par l'explosion
function checkBombsInExplosion(explosionCells, excludeBombId) {
    for (const bomb of gameState.bombs) {
        if (bomb.id === excludeBombId) continue;
        
        // Vérifier si la bombe est dans une cellule touchée par l'explosion
        const isHit = explosionCells.some(cell => cell.x === bomb.x && cell.y === bomb.y);
        
        if (isHit) {
            // Exploser cette bombe immédiatement (réaction en chaîne)
            explodeBomb(bomb);
        }
    }
}
// END_SYNC_MARKER: core_collision

// SYNC_MARKER: core_game_loop
/**
 * Boucle de jeu principale
 * @depends core_update
 * @depends core_render
 */
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}
// END_SYNC_MARKER: core_game_loop
