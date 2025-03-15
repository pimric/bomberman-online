// Logique d'intelligence artificielle

// Variables de l'IA
let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;

// Démarrer l'IA
function startAI() {
    if (aiMoveInterval) clearInterval(aiMoveInterval);
    
    aiMoveInterval = setInterval(() => {
        if (!gameState.gameStarted || !aiMode) return;
        
        const aiPlayer = gameState.players[aiPlayerId];
        if (!aiPlayer || !aiPlayer.alive) {
            clearInterval(aiMoveInterval);
            return;
        }
        
        // Logique de mouvement de l'IA
        moveAI(aiPlayer);
        
        // Possibilité de placer une bombe (aléatoirement)
        if (Math.random() < 0.1) { // 10% de chance à chaque mise à jour
            placeAIBomb(aiPlayer);
        }
    }, AI_MOVE_DELAY);
}

// Déplacer l'IA
function moveAI(aiPlayer) {
    // Obtenir la position actuelle de l'IA sur la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Directions possibles: haut, bas, gauche, droite
    const directions = [
        { dx: 0, dy: -PLAYER_SPEED }, // haut
        { dx: 0, dy: PLAYER_SPEED },  // bas
        { dx: -PLAYER_SPEED, dy: 0 }, // gauche
        { dx: PLAYER_SPEED, dy: 0 }   // droite
    ];
    
    // Filtrer les directions valides (sans obstacle)
    const validDirections = directions.filter(dir => {
        const newX = aiPlayer.x + dir.dx;
        const newY = aiPlayer.y + dir.dy;
        return isValidPosition(newX, newY);
    });
}

// L'IA place une bombe
function placeAIBomb(aiPlayer) {
    // Obtenir la position de la grille
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier si une bombe est déjà présente à cet endroit
    const bombsAtPosition = gameState.bombs.filter(bomb => 
        bomb.x === gridX && bomb.y === gridY
    );
    
    // Compte le nombre de bombes actives de l'IA
    const activeBombs = gameState.bombs.filter(bomb => 
        bomb.playerId === aiPlayerId
    );
    
    // Placer la bombe si possible
    if (bombsAtPosition.length === 0 && activeBombs.length < aiPlayer.maxBombs) {
        const newBomb = {
            id: generateId(),
            playerId: aiPlayerId,
            x: gridX,
            y: gridY,
            range: aiPlayer.bombRange,
            timer: Date.now() + BOMB_TIMER
        };
        
        // Ajouter la bombe au jeu
        database.ref(`games/${gameState.roomId}/bombs`).push(newBomb);
    }
}
    
    // Si aucune direction valide, rester immobile
    if (validDirections.length === 0) return;
    
    // Intelligence simple: chercher à s'approcher du joueur humain
    const player = gameState.players['player1'];
    
    // Si le joueur humain est proche, avoir une chance d'échapper ou de poser une bombe
    const distanceToPlayer = Math.sqrt(
        Math.pow((player.x - aiPlayer.x) / TILE_SIZE, 2) + 
        Math.pow((player.y - aiPlayer.y) / TILE_SIZE, 2)
    );
    
    let chosenDirection;
    
    if (distanceToPlayer < 3 && Math.random() < 0.7) {
        // Échapper au joueur (aller dans la direction opposée)
        const playerDirX = player.x > aiPlayer.x ? 1 : -1;
        const playerDirY = player.y > aiPlayer.y ? 1 : -1;
        
        // Chercher une direction qui s'éloigne du joueur
        const escapeDirs = validDirections.filter(dir => {
            return (dir.dx * playerDirX <= 0) || (dir.dy * playerDirY <= 0);
        });
        
        chosenDirection = escapeDirs.length > 0 
            ? escapeDirs[Math.floor(Math.random() * escapeDirs.length)]
            : validDirections[Math.floor(Math.random() * validDirections.length)];
            
        // Forte chance de poser une bombe
        if (Math.random() < 0.3) {
            placeAIBomb(aiPlayer);
        }
    } else {
        // Se déplacer vers le joueur
        validDirections.sort((a, b) => {
            const distA = Math.abs((aiPlayer.x + a.dx - player.x) / TILE_SIZE) + 
                         Math.abs((aiPlayer.y + a.dy - player.y) / TILE_SIZE);
            const distB = Math.abs((aiPlayer.x + b.dx - player.x) / TILE_SIZE) + 
                         Math.abs((aiPlayer.y + b.dy - player.y) / TILE_SIZE);
            return distA - distB;
        });
        
        // Ajouter du hasard pour que l'IA ne soit pas trop prévisible
        chosenDirection = Math.random() < 0.7 
            ? validDirections[0] // 70% de chance de prendre la meilleure direction
            : validDirections[Math.floor(Math.random() * validDirections.length)];
    }
    
    // Appliquer le mouvement
    const newX = aiPlayer.x + chosenDirection.dx;
    const newY = aiPlayer.y + chosenDirection.dy;
    
    // Mettre à jour la position de l'IA
    aiPlayer.x = newX;
    aiPlayer.y = newY;
    
    // Synchroniser avec Firebase
    database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
        x: aiPlayer.x,
        y: aiPlayer.y
    });