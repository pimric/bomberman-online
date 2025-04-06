// SYNC_MARKER: game_creation
// Créer une nouvelle partie multijoueur
function createGame() {
    console.log("Création d'une nouvelle partie multijoueur");
    
    // Vérifier que les éléments nécessaires sont disponibles
    if (!roomInput || !gameInfo || !database) {
        console.error("Références manquantes", {roomInput, gameInfo, database});
        alert("Erreur: Impossible de créer une partie (références manquantes)");
        return;
    }
    
    try {
        // Générer un code de salle si non spécifié
        const roomId = roomInput.value || generateId();
        roomInput.value = roomId;
        gameState.roomId = roomId;
        gameState.playerId = 'player1';
        aiMode = false;
        
        console.log("Création d'une nouvelle partie avec l'ID:", roomId);
        
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
    } catch (error) {
        console.error("Erreur lors de la création de la partie:", error);
        gameInfo.textContent = "Erreur lors de la création de la partie. Réessayez.";
    }
}
// END_SYNC_MARKER: game_creation

// SYNC_MARKER: join_game
// Rejoindre une partie existante
function joinExistingGame() {
    console.log("Tentative de rejoindre une partie existante");
    
    // Vérifier que les éléments nécessaires sont disponibles
    if (!roomInput || !gameInfo || !database) {
        console.error("Références manquantes", {roomInput, gameInfo, database});
        alert("Erreur: Impossible de rejoindre une partie (références manquantes)");
        return;
    }
    
    const roomId = roomInput.value;
    if (!roomId) {
        alert('Veuillez entrer un code de partie');
        return;
    }
    
    try {
        console.log("Vérification de l'existence de la partie:", roomId);
        
        // Vérifier si la partie existe
        const gameRef = database.ref(`games/${roomId}`);
        gameRef.once('value', (snapshot) => {
            const gameData = snapshot.val();
            if (!gameData) {
                alert('Partie non trouvée');
                return;
            }
            
            console.log("Partie trouvée, vérification de la disponibilité");
            
            // Vérifier si la partie est complète
            if (gameData.players && gameData.players.player2) {
                alert('Partie déjà complète');
                return;
            }
            
            console.log("Rejoindre en tant que joueur 2");
            
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
    } catch (error) {
        console.error("Erreur lors de la connexion à la partie:", error);
        gameInfo.textContent = "Erreur lors de la connexion à la partie. Réessayez.";
    }
}
// END_SYNC_MARKER: join_game

// SYNC_MARKER: create_single_player
// Créer une partie solo contre l'IA
function createSinglePlayerGame() {
    console.log("Création d'une partie solo contre l'IA");
    
    // Vérifier que les éléments nécessaires sont disponibles
    if (!roomInput || !gameInfo || !database) {
        console.error("Références manquantes", {roomInput, gameInfo, database});
        alert("Erreur: Impossible de créer une partie solo (références manquantes)");
        return;
    }
    
    try {
        // Générer un code de salle pour le mode solo
        const roomId = 'solo_' + generateId();
        roomInput.value = roomId;
        gameState.roomId = roomId;
        gameState.playerId = 'player1';
        aiMode = true;
        
        console.log("Création d'une partie solo avec l'ID:", roomId);
        
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
        console.log("Démarrage de l'IA");
        startAI();
    } catch (error) {
        console.error("Erreur lors de la création de la partie solo:", error);
        gameInfo.textContent = "Erreur lors de la création de la partie solo. Réessayez.";
    }
}
// END_SYNC_MARKER: create_single_player

// SYNC_MARKER: join_game_setup
// Rejoindre une partie et configurer les écouteurs
function joinGame(roomId, playerId) {
    console.log(`Rejoindre la partie ${roomId} en tant que ${playerId}`);
    
    try {
        const gameRef = database.ref(`games/${roomId}`);
        
        // Écouter les changements d'état du jeu
        gameRef.on('value', (snapshot) => {
            const gameData = snapshot.val();
            if (!gameData) {
                console.warn("Aucune donnée reçue pour la partie", roomId);
                return;
            }
            
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
        const roomControls = document.getElementById('roomControls');
        const gameControls = document.getElementById('gameControls');
        
        if (roomControls) roomControls.style.display = 'none';
        if (gameControls) gameControls.style.display = 'none';
        
        console.log("Configuration de la partie terminée");
    } catch (error) {
        console.error("Erreur lors de la configuration de la partie:", error);
        if (gameInfo) gameInfo.textContent = "Erreur lors de la configuration de la partie. Rafraîchissez la page.";
    }
}
// END_SYNC_MARKER: join_game_setup

// SYNC_MARKER: restart_game
// Fonction pour redémarrer la partie
function restartGame() {
    console.log("Redémarrage de la partie");
    
    try {
        // Si on est en mode solo avec IA
        if (aiMode) {
            console.log("Redémarrage d'une partie solo avec IA");
            
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
            const gameControls = document.getElementById('gameControls');
            if (gameControls) gameControls.style.display = 'none';
        } else {
            console.log("Retour à l'écran de création de partie");
            
            // Pour les parties multijoueur, revenir à l'écran de création de partie
            const roomControls = document.getElementById('roomControls');
            const gameControls = document.getElementById('gameControls');
            
            if (roomControls) roomControls.style.display = 'block';
            if (gameControls) gameControls.style.display = 'none';
            
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
    } catch (error) {
        console.error("Erreur lors du redémarrage de la partie:", error);
        if (gameInfo) gameInfo.textContent = "Erreur lors du redémarrage. Rafraîchissez la page.";
    }
}
// END_SYNC_MARKER: restart_game

// SYNC_MARKER: home_return
// Fonction pour revenir au menu principal
function returnToHome() {
    console.log("Retour à l'accueil");
    
    try {
        // Nettoyage avant redirection
        if (aiMoveInterval) {
            clearInterval(aiMoveInterval);
        }
        
        if (gameState.roomId) {
            // Déconnecter les écouteurs Firebase
            database.ref(`games/${gameState.roomId}`).off();
            
            // Supprimer le joueur de la partie
            if (gameState.playerId) {
                database.ref(`games/${gameState.roomId}/players/${gameState.playerId}`).remove();
            }
        }
        
        // Rediriger vers la page d'accueil
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erreur lors du retour à l'accueil:", error);
        alert("Erreur lors du retour à l'accueil. Réessayez.");
    }
}
// END_SYNC_MARKER: home_return

// SYNC_MARKER: button_listeners
// Cette section est volontairement laissée vide car les écouteurs d'événements 
// sont maintenant gérés exclusivement dans le script principal de game.html
// pour éviter les conflits et les duplications.
console.log('multiplayer.js chargé - Les écouteurs d\'événements sont gérés par le script principal de game.html');
// END_SYNC_MARKER: button_listeners

// Signaler que le script a été chargé avec succès
logScriptLoaded('multiplayer.js');