// SYNC_MARKER: game_creation
// Créer une nouvelle partie multijoueur
function createGame() {
    // Générer un code de salle si non spécifié
    const roomId = roomInput.value || generateId();
    roomInput.value = roomId;
    gameState.roomId = roomId;
    gameState.playerId = 'player1';
    aiMode = false;
    
    // Créer la partie dans Firebase
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.set({
        map: generateMap(),
        players: {
            player1: createPlayer(0, 0, '#ff6b6b')
        },
        bombs: {},
        explosions: {},
        gameStarted: false
    });
    
    // Rejoindre la partie
    joinGame(roomId, 'player1');
    gameInfo.textContent = `Partie créée ! Code: ${roomId} - En attente d'un autre joueur...`;
}
// END_SYNC_MARKER: game_creation

// SYNC_MARKER: join_game
// Rejoindre une partie existante
function joinExistingGame() {
    const roomId = roomInput.value;
    if (!roomId) {
        alert('Veuillez entrer un code de partie');
        return;
    }
    
    // Vérifier si la partie existe
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.once('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) {
            alert('Partie non trouvée');
            return;
        }
        
        // Vérifier si la partie est complète
        if (gameData.players && gameData.players.player2) {
            alert('Partie déjà complète');
            return;
        }
        
        // Rejoindre en tant que joueur 2
        gameState.roomId = roomId;
        gameState.playerId = 'player2';
        aiMode = false;
        
        // Ajouter le joueur 2 à la partie
        gameRef.child('players/player2').set(createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4'));
        gameRef.child('gameStarted').set(true);
        
        // Rejoindre la partie
        joinGame(roomId, 'player2');
    });
}
// END_SYNC_MARKER: join_game

// SYNC_MARKER: create_single_player
// Créer une partie solo contre l'IA
function createSinglePlayerGame() {
    // Générer un code de salle pour le mode solo
    const roomId = 'solo_' + generateId();
    roomInput.value = roomId;
    gameState.roomId = roomId;
    gameState.playerId = 'player1';
    aiMode = true;
    
    // Créer la partie dans Firebase avec le joueur humain et l'IA
    const gameRef = database.ref(`games/${roomId}`);
    gameRef.set({
        map: generateMap(),
        players: {
            player1: createPlayer(0, 0, '#ff6b6b'),
            [aiPlayerId]: createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4')
        },
        bombs: {},
        explosions: {},
        gameStarted: true
    });
    
    // Rejoindre la partie
    joinGame(roomId, 'player1');
    gameInfo.textContent = `Survivez sur l'île contre le pirate IA - Vous êtes le Rasta Rouge`;
    
    // Démarrer l'IA
    startAI();
}
// END_SYNC_MARKER: create_single_player

// SYNC_MARKER: join_game_setup
// Rejoindre une partie et configurer les écouteurs
function joinGame(roomId, playerId) {
    const gameRef = database.ref(`games/${roomId}`);
    
    // Écouter les changements d'état du jeu
    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;
        
        // Mettre à jour l'état du jeu local
        gameState.map = gameData.map;
        gameState.players = gameData.players || {};
        
        // Convertir les objets bombs et explosions en tableaux
        gameState.bombs = gameData.bombs ? Object.values(gameData.bombs) : [];
        gameState.explosions = gameData.explosions ? Object.values(gameData.explosions) : [];
        
        gameState.gameStarted = gameData.gameStarted;
        
        // Afficher un message quand le jeu commence
        if (gameState.gameStarted) {
            if (aiMode) {
                gameInfo.textContent = `Survivez sur l'île contre le pirate IA - Vous êtes le Rasta Rouge`;
            } else if (gameData.players.player1 && gameData.players.player2) {
                gameInfo.textContent = `Combat sur l'île - Vous êtes le ${playerId === 'player1' ? 'Rasta Rouge' : 'Surfeur Bleu'}`;
            }
        }
    });
    
    // Configurer les déconnexions
    gameRef.child(`players/${playerId}`).onDisconnect().remove();
    database.ref(`.info/connected`).on('value', (snapshot) => {
        if (snapshot.val() === false) return;
        
        // Nettoyer la partie si tous les joueurs sont déconnectés
        gameRef.onDisconnect().remove();
    });
    
    // Cacher les contrôles de salle et cacher les contrôles de jeu jusqu'à la fin
    document.getElementById('roomControls').style.display = 'none';
    document.getElementById('gameControls').style.display = 'none';
}
// END_SYNC_MARKER: join_game_setup

// SYNC_MARKER: restart_game
// Fonction pour redémarrer la partie
function restartGame() {
    // Si on est en mode solo avec IA
    if (aiMode) {
        // Nettoyer l'intervalle de l'IA pour éviter les doublons
        if (aiMoveInterval) {
            clearInterval(aiMoveInterval);
        }
        
        // Régénérer une carte et réinitialiser les joueurs
        const roomId = 'solo_' + generateId();
        gameState.roomId = roomId;
        
        // Créer une nouvelle partie
        const gameRef = database.ref(`games/${roomId}`);
        gameRef.set({
            map: generateMap(),
            players: {
                player1: createPlayer(0, 0, '#ff6b6b'),
                [aiPlayerId]: createPlayer(GRID_SIZE - 1, GRID_SIZE - 1, '#4ecdc4')
            },
            bombs: {},
            explosions: {},
            gameStarted: true
        });
        
        // Rejoindre la partie
        joinGame(roomId, 'player1');
        gameInfo.textContent = `Survivez sur l'île contre le pirate IA - Vous êtes le Rasta Rouge`;
        
        // Démarrer l'IA
        startAI();
        
        // Cacher les contrôles de jeu jusqu'à la fin de partie
        document.getElementById('gameControls').style.display = 'none';
    } else {
        // Pour les parties multijoueur, revenir à l'écran de création de partie
        document.getElementById('roomControls').style.display = 'block';
        document.getElementById('gameControls').style.display = 'none';
        
        // Déconnecter la partie actuelle
        if (gameState.roomId) {
            database.ref(`games/${gameState.roomId}`).off();
        }
        
        // Réinitialiser l'état
        gameState.roomId = null;
        gameState.playerId = null;
        gameState.map = [];
        gameState.players = {};
        gameState.bombs = [];
        gameState.explosions = [];
        gameState.gameStarted = false;
    }
}
// END_SYNC_MARKER: restart_game

// SYNC_MARKER: home_return
// Fonction pour revenir au menu principal
function returnToHome() {
    // Rediriger vers la page d'accueil
    window.location.href = 'index.html';
}
// END_SYNC_MARKER: home_return

// SYNC_MARKER: button_listeners
// On supprime les écouteurs d'événements dupliqués ici pour éviter les conflits
// Ces fonctionnalités sont maintenant gérées dans le script de game.html uniquement
console.log('multiplayer.js chargé - Les écouteurs d\'événements seront gérés par le script principal');
// END_SYNC_MARKER: button_listeners