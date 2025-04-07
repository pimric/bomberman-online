// IA très simple qui ne fait qu'avancer et reculer

// Variables de l'IA
let aiMode = false;
let aiPlayerId = 'playerAI';
let aiMoveInterval;
let aiDirection = 1; // 1 pour avancer, -1 pour reculer

// Démarrer l'IA
function startAI() {
    console.log("Démarrage de l'IA simple");
    if (aiMoveInterval) clearInterval(aiMoveInterval);
    
    // Petit délai avant de commencer à bouger
    setTimeout(() => {
        aiMoveInterval = setInterval(() => {
            if (!gameState.gameStarted || !aiMode) return;
            
            const aiPlayer = gameState.players[aiPlayerId];
            if (!aiPlayer || !aiPlayer.alive) {
                clearInterval(aiMoveInterval);
                return;
            }
            
            // Faire un mouvement simple
            moveAISimple(aiPlayer);
            
        }, 500); // Délai entre les mouvements
    }, 1000); // Attendre 1 seconde avant de commencer
}

// Fait simplement avancer et reculer l'IA
function moveAISimple(aiPlayer) {
    // Position actuelle
    const gridX = Math.floor(aiPlayer.x / TILE_SIZE);
    const gridY = Math.floor(aiPlayer.y / TILE_SIZE);
    
    // Vérifier si on peut continuer dans la direction actuelle
    const newY = gridY + aiDirection;
    
    // Si on atteint un bord ou un obstacle, inverser la direction
    if (newY < 0 || newY >= GRID_SIZE || 
        gameState.map[newY][gridX] !== TILE_TYPES.EMPTY) {
        aiDirection *= -1; // Inverser la direction
    }
    
    // Appliquer le mouvement vers le haut ou vers le bas
    const dy = aiDirection * PLAYER_SPEED;
    
    // Vérifier si le mouvement est valide
    const newPlayerY = aiPlayer.y + dy;
    if (isValidPosition(aiPlayer.x, newPlayerY)) {
        aiPlayer.y = newPlayerY;
        
        // Synchroniser avec Firebase
        database.ref(`games/${gameState.roomId}/players/${aiPlayerId}`).update({
            y: aiPlayer.y
        });
    } else {
        // Si bloqué, inverser la direction
        aiDirection *= -1;
    }
}