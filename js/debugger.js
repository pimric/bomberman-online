// Script de débogage pour aider à identifier les problèmes dans Island Bomber
// Ce script doit être chargé en premier pour pouvoir tracer l'ensemble du chargement

// Configuration du débogage
const DEBUG = true;
const DEBUG_LEVEL = 2; // 0: désactivé, 1: erreurs seulement, 2: avertissements, 3: info, 4: tout

// Remplacer les fonctions console par des versions améliorées
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
};

// Fonction de journalisation améliorée
function enhancedLog(type, ...args) {
    if (!DEBUG) return;
    
    const timestamp = new Date().toISOString().substring(11, 23);
    const prefix = `[${timestamp}][${type.toUpperCase()}]`;
    
    switch(type) {
        case 'error':
            if (DEBUG_LEVEL >= 1) originalConsole.error(prefix, ...args);
            break;
        case 'warn':
            if (DEBUG_LEVEL >= 2) originalConsole.warn(prefix, ...args);
            break;
        case 'info':
            if (DEBUG_LEVEL >= 3) originalConsole.info(prefix, ...args);
            break;
        case 'debug':
            if (DEBUG_LEVEL >= 4) originalConsole.log(prefix, ...args);
            break;
        default:
            if (DEBUG_LEVEL >= 3) originalConsole.log(prefix, ...args);
    }
}

// Remplacer les fonctions console
console.log = (...args) => enhancedLog('info', ...args);
console.warn = (...args) => enhancedLog('warn', ...args);
console.error = (...args) => enhancedLog('error', ...args);
console.info = (...args) => enhancedLog('info', ...args);
console.debug = (...args) => enhancedLog('debug', ...args);

// Fonction pour tracer les chargements de scripts
function logScriptLoaded(scriptName) {
    console.log(`Script chargé: ${scriptName}`);
}

// Fonction pour tester si une fonction est disponible
function checkFunction(functionName, expectedType = 'function') {
    const exists = typeof window[functionName] === expectedType;
    if (!exists) {
        console.error(`La fonction ${functionName} n'est pas disponible!`);
    } else {
        console.debug(`Fonction ${functionName} disponible`);
    }
    return exists;
}

// Fonction pour tester si un objet est disponible
function checkObject(objectName) {
    const exists = typeof window[objectName] !== 'undefined';
    if (!exists) {
        console.error(`L'objet ${objectName} n'est pas disponible!`);
    } else {
        console.debug(`Objet ${objectName} disponible`);
    }
    return exists;
}

// Fonction pour vérifier si un élément DOM existe
function checkElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`L'élément DOM avec l'ID ${elementId} n'est pas trouvé!`);
    } else {
        console.debug(`Élément DOM ${elementId} trouvé`);
    }
    return !!element;
}

// Déclarer un objet global pour suivre l'état de chargement
window.debugState = {
    scriptsLoaded: [],
    functionsAvailable: {},
    domReady: false,
    gameInitialized: false
};

// Vérifier quand le DOM est prêt
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM entièrement chargé');
    window.debugState.domReady = true;
    checkElementsAvailability();
});

// Vérifier quand la page est complètement chargée
window.addEventListener('load', function() {
    console.log('Page entièrement chargée (window.onload)');
    checkFunctionsAvailability();
});

// Vérifie la disponibilité des éléments DOM critiques
function checkElementsAvailability() {
    const criticalElements = [
        'createBtn', 
        'joinBtn', 
        'singlePlayerBtn', 
        'restartBtn', 
        'homeBtn', 
        'gameCanvas', 
        'gameInfo', 
        'roomInput'
    ];
    
    criticalElements.forEach(checkElement);
}

// Vérifie la disponibilité des fonctions critiques
function checkFunctionsAvailability() {
    const criticalFunctions = [
        'createGame',
        'joinExistingGame',
        'createSinglePlayerGame',
        'restartGame',
        'returnToHome',
        'gameLoop',
        'update',
        'render',
        'placeBomb',
        'explodeBomb',
        'startAI'
    ];
    
    const criticalObjects = [
        'gameState',
        'database',
        'TILE_TYPES',
        'canvas',
        'ctx'
    ];
    
    criticalFunctions.forEach(funcName => {
        window.debugState.functionsAvailable[funcName] = checkFunction(funcName);
    });
    
    criticalObjects.forEach(checkObject);
}

// Pour tester des fonctions individuelles
window.testFunction = function(functionName, ...args) {
    try {
        console.log(`Test de la fonction ${functionName}...`);
        if (typeof window[functionName] === 'function') {
            const result = window[functionName](...args);
            console.log(`Fonction ${functionName} exécutée avec succès`, result);
            return result;
        } else {
            console.error(`La fonction ${functionName} n'existe pas`);
        }
    } catch (error) {
        console.error(`Erreur lors de l'exécution de ${functionName}:`, error);
    }
};

// Initialiser l'état de débogage
console.log('Script de débogage chargé');