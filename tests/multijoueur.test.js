// Test multijoueur automatique : des Chrome headless (un par joueur) jouent
// une partie réelle sur la base Firebase, dans une salle de test supprimée à la fin.
// FIREBASE_MOCK=1 (npm run test:local) : base simulée en mémoire (tests/mock),
// pour les machines sans accès à Firebase. CHROME=<chemin> : autre navigateur.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const GAME_DIR = path.join(__dirname, '..');
// Navigateur : variable CHROME, sinon le premier trouvé parmi les
// emplacements habituels (Chrome ou Edge sous Windows, y compris installé
// sans droits admin dans le profil ; Chrome/Chromium sous Linux et macOS).
const CHROME = process.env.CHROME || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => p && fs.existsSync(p));
if (!CHROME) {
    console.error('Aucun Chrome ni Edge trouvé : indique son chemin avec la variable CHROME.');
    process.exit(1);
}
const hub = process.env.FIREBASE_MOCK === '1' ? require('./mock/hub').createHub() : null;
const PORT = 8765;
const ROOM = 'mptest_' + Date.now();
const TILE = 32; // TILE_SIZE du jeu

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
    const file = path.join(GAME_DIR, decodeURIComponent(req.url.split('?')[0]) || '/');
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
});

async function openPlayer(label, query = '') {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    if (hub) await hub.attach(page, browser);
    const errors = [];
    const logs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('console', m => {
        const t = m.text();
        if (m.type() === 'error' && !t.includes('404')) errors.push(t);
        if (t.includes('MORT') || t.includes('IA fuite')) logs.push(t);
    });
    await page.goto(`http://localhost:${PORT}/game.html${query}`, { waitUntil: 'networkidle2' });
    return { label, browser, page, errors, logs };
}

const gridOf = (page, id) => page.evaluate(id => {
    const p = gameState.players[id];
    return p ? { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE), alive: p.alive } : null;
}, id);

(async () => {
    await new Promise(r => server.listen(PORT, r));
    const A = await openPlayer('A(player1)', '?manches=2&maree=600');
    const B = await openPlayer('B(player2)');

    try {
        // --- Création / connexion --------------------------------------
        await A.page.type('#roomInput', ROOM);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });

        await B.page.type('#roomInput', ROOM);
        await B.page.click('#joinBtn');
        // Salle d'attente : l'hôte lance quand B est arrivé
        await A.page.waitForFunction(() => gameState.players.player2 && !document.getElementById('launchBtn').disabled, { timeout: 10000 });
        await B.page.waitForFunction(() => document.getElementById('lobbyHint').textContent !== '', { timeout: 10000 });
        const lobbyB = await B.page.$eval('#lobbyHint', e => e.textContent);
        check('Salle d’attente : B attend le lancement par l’hôte', lobbyB.includes('attente'), `B="${lobbyB}"`);
        await A.page.click('#launchBtn');
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.gameStarted === true && gameState.players.player1 && gameState.players.player2,
            { timeout: 10000 })));
        check('Les deux onglets voient la partie démarrée avec 2 joueurs', true);
        // Décompte 3-2-1 : personne ne bouge avant la fin
        const blocked = await A.page.evaluate(() => countdownActive());
        check('Décompte actif au démarrage', blocked);
        await Promise.all([A, B].map(P => P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 })));

        const a1 = await gridOf(A.page, 'player1'), a2 = await gridOf(A.page, 'player2');
        const b1 = await gridOf(B.page, 'player1'), b2 = await gridOf(B.page, 'player2');
        check('Spawns corrects des deux côtés', a1.x === 0 && a1.y === 0 && a2.x === 14 && a2.y === 14 &&
            b1.x === 0 && b1.y === 0 && b2.x === 14 && b2.y === 14,
            `A voit p1=(${a1.x},${a1.y}) p2=(${a2.x},${a2.y}) / B voit p1=(${b1.x},${b1.y}) p2=(${b2.x},${b2.y})`);

        // Compteurs d'écritures Firebase (vus depuis A) : 1 explosion par bombe attendue
        await A.page.evaluate(room => {
            window.__expl = 0;
            database.ref(`games/${room}/explosions`).on('child_added', () => window.__expl++);
        }, ROOM);

        // --- Déplacement de player1 visible chez B ------------------------
        const dirKey = await A.page.evaluate(() =>
            isGridAccessible(1, 0) ? 'ArrowRight' : (isGridAccessible(0, 1) ? 'ArrowDown' : null));
        if (dirKey) {
            await A.page.keyboard.down(dirKey);
            await sleep(150);
            await A.page.keyboard.up(dirKey);
            await sleep(1000);
            const aLocal = await gridOf(A.page, 'player1');
            const bView = await gridOf(B.page, 'player1');
            check('Déplacement de player1 synchronisé chez B',
                (aLocal.x !== 0 || aLocal.y !== 0) && aLocal.x === bView.x && aLocal.y === bView.y,
                `A=(${aLocal.x},${aLocal.y}) B voit (${bView.x},${bView.y})`);
        } else {
            check('Déplacement de player1 synchronisé chez B', false, 'aucune case libre à côté du spawn');
        }

        // --- Affichage lissé de player2 chez A pendant que B marche ---------
        const bKey = await B.page.evaluate(() =>
            isGridAccessible(13, 14) ? 'ArrowLeft' : (isGridAccessible(14, 13) ? 'ArrowUp' : null));
        if (bKey) {
            const samplesPromise = A.page.evaluate(() => new Promise(resolve => {
                const pts = [];
                const start = performance.now();
                (function frame() {
                    const p = gameState.players.player2;
                    pts.push(getDisplayPosition('player2', p));
                    if (performance.now() - start < 1500) requestAnimationFrame(frame);
                    else resolve({ pts, final: { x: p.x, y: p.y } });
                })();
            }));
            await sleep(250); // laisser l'échantillonnage démarrer avant que B bouge
            await B.page.keyboard.down(bKey);
            await sleep(450); // ~2 cases
            await B.page.keyboard.up(bKey);
            const { pts, final } = await samplesPromise;
            let maxJump = 0;
            for (let i = 1; i < pts.length; i++) {
                maxJump = Math.max(maxJump, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
            }
            const last = pts[pts.length - 1];
            const moved = Math.hypot(last.x - pts[0].x, last.y - pts[0].y);
            // Sans lissage : sauts de ~16px (une demi-case par sync de 100ms)
            check('Adversaire affiché sans sauts chez A', moved >= 32 && maxJump <= 8,
                `déplacement affiché=${moved.toFixed(0)}px, plus grand saut=${maxJump.toFixed(1)}px sur ${pts.length} images`);
            check('Affichage lissé rejoint la vraie position',
                Math.hypot(last.x - final.x, last.y - final.y) < 1,
                `affiché=(${last.x.toFixed(0)},${last.y.toFixed(0)}) réel=(${final.x},${final.y})`);
            check('Position finale de player2 reçue au centre d’une case',
                (final.x - TILE / 2) % TILE === 0 && (final.y - TILE / 2) % TILE === 0,
                `réel=(${final.x},${final.y})`);
        } else {
            check('Adversaire affiché sans sauts chez A', false, 'aucune case libre à côté du spawn de B');
        }

        // --- Bombe de A : visible chez B, explose UNE fois, tue B dans la flamme
        const bombCell = await gridOf(A.page, 'player1');
        await A.page.keyboard.press(' ');
        await B.page.waitForFunction(() => gameState.bombs.length === 1, { timeout: 2000 })
            .then(() => check('Bombe de A visible chez B', true))
            .catch(() => check('Bombe de A visible chez B', false));

        // A s'éloigne (téléport de test) sur une case vide hors ligne/colonne de la bombe
        const safe = await A.page.evaluate(({ bx, by }) => {
            for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
                if (gameState.map[y][x] === TILE_TYPES.EMPTY && Math.abs(x - bx) > 3 && Math.abs(y - by) > 3) {
                    const p = gameState.players.player1;
                    const px = x * TILE_SIZE + TILE_SIZE / 2, py = y * TILE_SIZE + TILE_SIZE / 2;
                    Object.assign(p, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
                    return { x, y };
                }
            }
            return null;
        }, { bx: bombCell.x, by: bombCell.y });

        await B.page.waitForFunction(() => gameState.explosions.length > 0, { timeout: 5000 });
        check('Explosion de A visible chez B', true);

        // B entre dans la flamme active (téléport de test sur la case de la bombe)
        await B.page.evaluate(({ bx, by }) => {
            const p = gameState.players.player2;
            const px = bx * TILE_SIZE + TILE_SIZE / 2, py = by * TILE_SIZE + TILE_SIZE / 2;
            Object.assign(p, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
        }, { bx: bombCell.x, by: bombCell.y });
        await sleep(1500);

        const expl = await A.page.evaluate(() => window.__expl);
        check('Une seule explosion créée pour une bombe', expl === 1, `explosions écrites=${expl}`);

        const b2dead = await gridOf(B.page, 'player2');
        const a2dead = await gridOf(A.page, 'player2');
        check('player2 meurt dans la flamme (vu par B et par A)', b2dead.alive === false && a2dead.alive === false,
            `B voit alive=${b2dead.alive}, A voit alive=${a2dead.alive}`);
        const a1alive = await gridOf(A.page, 'player1');
        check('player1 (réfugié en ' + (safe ? `${safe.x},${safe.y}` : '?') + ') survit', a1alive.alive === true);

        // --- Manche 1 terminée (match en 2 manches gagnantes) -------------
        await A.page.waitForFunction(() => gameState.match && gameState.match.roundOver, { timeout: 5000 });
        let infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        let infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('Fin de manche affichée des deux côtés', infoA.includes('Manche gagnée') && infoB.includes('Manche perdue'),
            `A="${infoA}" / B="${infoB}"`);
        const endHidden = await A.page.$eval('#gameControls', e => e.style.display === 'none');
        check('Pas d’écran de fin de match après une seule manche', endHidden);

        // --- Manche 2 : nouvelle carte, joueurs replacés, score 1-0 ---------
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.match && gameState.match.round === 2 && !gameState.match.roundOver, { timeout: 8000 })));
        const r2 = await Promise.all([A, B].map(P => P.page.evaluate(() => ({
            scores: gameState.match.scores,
            p1: [Math.floor(gameState.players.player1.x / TILE_SIZE), Math.floor(gameState.players.player1.y / TILE_SIZE), gameState.players.player1.alive],
            p2: [Math.floor(gameState.players.player2.x / TILE_SIZE), Math.floor(gameState.players.player2.y / TILE_SIZE), gameState.players.player2.alive],
            countdown: countdownActive()
        }))));
        check('Manche 2 : score 1-0 des deux côtés',
            r2.every(r => r.scores.player1 === 1 && r.scores.player2 === 0), JSON.stringify(r2.map(r => r.scores)));
        check('Manche 2 : joueurs revenus vivants à leur coin',
            r2.every(r => r.p1.join() === '0,0,true' && r.p2.join() === '14,14,true'),
            JSON.stringify(r2.map(r => [r.p1, r.p2])));
        check('Manche 2 : nouveau décompte', r2.every(r => r.countdown));

        // --- player2 meurt encore : fin du match ----------------------------
        await Promise.all([A, B].map(P => P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 })));
        await B.page.evaluate(() => database.ref(`games/${gameState.roomId}/players/player2/alive`).set(false));
        await A.page.waitForFunction(() => gameState.match && gameState.match.matchWinner, { timeout: 5000 });
        await sleep(300);
        infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('Écran de fin de match correct des deux côtés',
            infoA.includes('Victoire') && infoA.includes('2 à 0') && infoB.includes('Défaite') && infoB.includes('0 à 2'),
            `A="${infoA}" / B="${infoB}"`);

        // --- Revanche dans la même salle ------------------------------------
        await sleep(1000); // écran de fin cliquable après l'animation de mort
        await A.page.click('#restartBtn');
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.match && gameState.match.round === 3 && !gameState.match.matchWinner, { timeout: 8000 })));
        const rematch = await B.page.evaluate(() => gameState.match.scores);
        check('Revanche : même salle, scores remis à 0', rematch.player1 === 0 && rematch.player2 === 0, JSON.stringify(rematch));
    } catch (e) {
        check('Déroulement du test', false, e.message);
    } finally {
        for (const P of [A, B]) {
            check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
            P.logs.forEach(l => console.log(`   [${P.label}] ${l}`));
        }
        await A.page.evaluate(room => database.ref(`games/${room}`).remove(), ROOM).catch(() => {});
        await A.browser.close();
        await B.browser.close();
    }

    await scenarioDeconnexion();
    await scenarioReconnexion();
    await scenarioArrierePlan();
    await scenarioSalleAttente();
    await scenarioQuatreJoueurs();
    await scenarioSolo();
    await scenarioSoloTroisIA();
    await scenarioReglages();
    await scenarioCartes();
    await scenarioEquipes();
    await scenarioTactile();
    await scenarioPauseEtTirsAmis();
    await scenarioMaree();
    await scenarioPouvoirs();

    server.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} tests OK — salles de test supprimées`);
    process.exit(failed ? 1 : 0);
})();

// Pouvoirs du lot 2, testés dans une partie solo sur une île préparée :
// coup de pied, détonateur, flamme perçante, malus « commandes inversées ».
async function scenarioPouvoirs() {
    const P = await openPlayer('Pouvoirs', '?maree=600');
    let room = null;
    const setPlayer = (fields) => P.page.evaluate(f => {
        const me = gameState.players.player1;
        Object.assign(me, f);
        return database.ref(`games/${gameState.roomId}/players/player1`).update(f);
    }, fields);
    const teleport = (x, y) => P.page.evaluate(({ x, y }) => {
        const me = gameState.players.player1;
        const px = x * TILE_SIZE + TILE_SIZE / 2, py = y * TILE_SIZE + TILE_SIZE / 2;
        Object.assign(me, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
    }, { x, y });
    const press = async (key, ms = 60) => { await P.page.keyboard.down(key); await sleep(ms); await P.page.keyboard.up(key); };
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        // IA figée et mise à l'écart, ligne du haut entièrement dégagée
        await P.page.evaluate(() => {
            clearInterval(aiMoveInterval);
            const row = {};
            for (let x = 0; x < GRID_SIZE; x++) { row[x] = TILE_TYPES.EMPTY; gameState.map[0][x] = TILE_TYPES.EMPTY; }
            return database.ref(`games/${gameState.roomId}/map/0`).set(row);
        });

        // --- Coup de pied : bombe en (2,0), joueur en (1,0) pousse à droite
        await setPlayer({ canKick: true });
        await teleport(2, 0);
        await press(' ');
        await P.page.waitForFunction(() => gameState.bombs.some(b => b.x === 2 && b.y === 0), { timeout: 2000 });
        await teleport(1, 0);
        await press('ArrowRight');
        await sleep(1200);
        const kicked = await P.page.evaluate(() => {
            const b = gameState.bombs[0];
            const me = gameState.players.player1;
            return { bomb: b && [b.x, b.y], me: [Math.floor(me.x / TILE_SIZE), Math.floor(me.y / TILE_SIZE)] };
        });
        check('Coup de pied : la bombe glisse jusqu’au bord', kicked.bomb && kicked.bomb[0] === 14 && kicked.bomb[1] === 0,
            JSON.stringify(kicked));
        // touche encore enfoncée après le coup : il peut suivre la bombe d'une
        // case (comportement classique), mais pas la dépasser
        check('Coup de pied : le joueur ne traverse pas la bombe', kicked.me[1] === 0 && kicked.me[0] <= 2, JSON.stringify(kicked.me));
        await P.page.waitForFunction(() => gameState.bombs.length === 0 && gameState.explosions.length === 0, { timeout: 6000 });

        // --- Détonateur : la bombe n'explose pas seule, Entrée la déclenche
        await setPlayer({ canKick: false, hasDetonator: true });
        await teleport(4, 0);
        await press(' ');
        await teleport(8, 0);
        await sleep(3500); // plus que la mèche normale
        const stillThere = await P.page.evaluate(() => gameState.bombs.filter(b => b.remote).length);
        check('Détonateur : bombe toujours là après 3,5 s', stillThere === 1, `bombes télécommandées=${stillThere}`);
        await teleport(4, 12); // à l'abri
        await press('Enter');
        await sleep(300);
        const detonated = await P.page.evaluate(() => ({ bombs: gameState.bombs.length, expl: gameState.explosions.length }));
        check('Détonateur : Entrée la fait exploser', detonated.bombs === 0 && detonated.expl === 1, JSON.stringify(detonated));
        await P.page.waitForFunction(() => gameState.explosions.length === 0, { timeout: 3000 });

        // --- Flamme perçante : 2 tonneaux alignés détruits d'un coup
        await setPlayer({ hasDetonator: false, pierce: true, bombRange: 3 });
        await P.page.evaluate(() => {
            gameState.map[0][6] = TILE_TYPES.BRICK;
            gameState.map[0][7] = TILE_TYPES.BRICK;
            return database.ref(`games/${gameState.roomId}/map/0`).update({ 6: TILE_TYPES.BRICK, 7: TILE_TYPES.BRICK });
        });
        await teleport(5, 0);
        await press(' ');
        await teleport(4, 12);
        await P.page.waitForFunction(() => gameState.explosions.length > 0, { timeout: 5000 });
        await sleep(200);
        const pierced = await P.page.evaluate(() => [gameState.map[0][6], gameState.map[0][7]]);
        check('Flamme perçante : deux tonneaux alignés détruits', pierced[0] === 0 && pierced[1] === 0, // 0 = sable
            JSON.stringify(pierced));
        await P.page.waitForFunction(() => gameState.explosions.length === 0, { timeout: 3000 });

        // --- Malus « commandes inversées » : flèche droite = pas à gauche
        await setPlayer({ pierce: false, malus: 'inverse', malusUntil: Date.now() + 5000 });
        await P.page.evaluate(() => { gameState.players.player1.malusUntil = Date.now() + 5000; });
        await teleport(10, 0);
        await press('ArrowRight');
        await sleep(400);
        const inv = await gridOf(P.page, 'player1');
        check('Malus : commandes inversées', inv.x === 9 && inv.y === 0, `position=(${inv.x},${inv.y})`);
        const hudMalus = await P.page.$('#hud .powers i.malus');
        check('Malus affiché sur la fiche joueur', !!hudMalus);
    } catch (e) {
        check('Déroulement du scénario pouvoirs', false, e.message);
    } finally {
        check('Aucune erreur JS (pouvoirs)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Marée montante : réglée à 0,5 s après le décompte. Le joueur reste
// immobile dans son coin, qui est inondé en premier : il doit se noyer, et
// la case doit devenir infranchissable.
async function scenarioMaree() {
    const P = await openPlayer('Marée', '?manches=1&maree=0.5');
    let room = null;
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        const before = await P.page.evaluate(() => isFlooded(7, 7));
        check('Marée : le centre de l’île n’est pas inondé', !before);
        await P.page.waitForFunction(() => !gameState.players.player1.alive, { timeout: 5000 })
            .then(() => check('Marée : le joueur resté dans son coin se noie', true))
            .catch(() => check('Marée : le joueur resté dans son coin se noie', false));
        const blocked = await P.page.evaluate(() => !isGridAccessible(0, 0) && isFlooded(0, 0));
        check('Marée : case inondée infranchissable', blocked);
        check('Marée : cause de la mort journalisée', P.logs.some(l => l.includes('noyé')), P.logs.join(' | '));
    } catch (e) {
        check('Déroulement du scénario marée', false, e.message);
    } finally {
        check('Aucune erreur JS (marée)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Fumée du mode solo : la partie démarre, l'IA bouge et pose des bombes,
// sans erreur JS ; la salle solo est supprimée en quittant.
async function scenarioSolo() {
    const P = await openPlayer('Solo');
    let room = null;
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.players.player2, { timeout: 10000 });
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        room = await P.page.evaluate(() => gameState.roomId);
        const start = await gridOf(P.page, 'player2');
        await P.page.evaluate(() => {
            window.__aiBombs = 0;
            database.ref(`games/${gameState.roomId}/bombs`).on('child_added', s => {
                if (s.val().playerId === 'player2') window.__aiBombs++;
            });
        });
        // Cases visitées (pas seulement départ/arrivée : dans son coin, l'IA
        // pose, se met à l'abri en diagonale puis revient sur sa case)
        const visited = new Set([`${start.x},${start.y}`]);
        for (let i = 0; i < 40; i++) {
            await sleep(200);
            const g = await gridOf(P.page, 'player2');
            if (g) visited.add(`${g.x},${g.y}`);
        }
        const bombs = await P.page.evaluate(() => window.__aiBombs);
        check('Solo : l\'IA se déplace', visited.size >= 2,
            `${visited.size} case(s) visitée(s) en 8s : ${[...visited].join(' ')}`);
        check('Solo : l\'IA pose des bombes', bombs > 0, `${bombs} bombe(s) en 8s`);
    } catch (e) {
        check('Déroulement du scénario solo', false, e.message);
    } finally {
        check('Aucune erreur JS en solo', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        P.logs.forEach(l => console.log(`   [Solo] ${l}`));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Un joueur quitte en cours de partie : l'autre doit garder la partie et être
// prévenu ; quand le dernier part, la partie doit disparaître de Firebase.
async function scenarioDeconnexion() {
    const room = ROOM + '_deco';
    const A = await openPlayer('A2(player1)', '?grace=3');
    const B = await openPlayer('B2(player2)');
    let observer = null;
    try {
        await A.page.type('#roomInput', room);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });
        await B.page.type('#roomInput', room);
        await B.page.click('#joinBtn');
        await A.page.waitForFunction(() => gameState.players.player2 && !document.getElementById('launchBtn').disabled, { timeout: 10000 });
        await A.page.click('#launchBtn');
        await A.page.waitForFunction(() => gameState.gameStarted && gameState.players.player2, { timeout: 10000 });

        await B.browser.close(); // B ferme brutalement sa page
        await A.page.waitForFunction(() => gameState.players.player2 && gameState.players.player2.offline, { timeout: 15000 });
        await sleep(300);
        const waitingA = await A.page.$eval('#gameInfo', e => e.textContent);
        check('A voit B déconnecté et attend son retour', waitingA.includes('déconnecté'), `A="${waitingA}"`);
        await A.page.waitForFunction(() => !gameState.players.player2, { timeout: 15000 })
            .then(() => check('Départ de B détecté chez A', true))
            .catch(() => check('Départ de B détecté chez A', false, 'player2 toujours présent après 10s'));

        await sleep(300);
        const infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        check('A est prévenu que l\'adversaire a quitté', infoA.includes('quitté'), `A="${infoA}"`);

        const stillThere = await A.page.evaluate(r =>
            database.ref(`games/${r}/map`).once('value').then(s => s.exists()), room);
        check('La partie existe toujours après le départ de B', stillThere);

        // A part à son tour : il était le dernier, la partie doit être supprimée
        await A.browser.close();
        observer = await openPlayer('observateur');
        let gone = false;
        for (let i = 0; i < 20 && !gone; i++) {
            gone = await observer.page.evaluate(r =>
                database.ref(`games/${r}`).once('value').then(s => !s.exists()), room);
            if (!gone) await sleep(500);
        }
        check('La partie est supprimée quand le dernier joueur part', gone);
    } catch (e) {
        check('Déroulement du scénario déconnexion', false, e.message);
    } finally {
        for (const P of [A, B]) {
            check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        }
        const cleaner = observer || await openPlayer('nettoyage');
        await cleaner.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        for (const P of [A, B, cleaner]) await P.browser.close().catch(() => {});
    }
}

// Partie à 4 : trois humains (3 navigateurs) + une IA bouche-trou ajoutée
// par l'hôte dans la salle d'attente, simulée par l'onglet de l'hôte.
async function scenarioQuatreJoueurs() {
    const room = ROOM + '_4j';
    const A = await openPlayer('A4(player1)', '?manches=2&maree=600&grace=2');
    const B = await openPlayer('B4(player2)');
    const C = await openPlayer('C4(player3)');
    const all = [A, B, C];
    try {
        await A.page.type('#roomInput', room);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });
        for (const P of [B, C]) {
            await P.page.type('#roomInput', room);
            await P.page.click('#joinBtn');
            await P.page.waitForFunction(() => gameState.playerId && gameState.players[gameState.playerId], { timeout: 10000 });
        }
        const ids = await Promise.all([B, C].map(P => P.page.evaluate(() => gameState.playerId)));
        check('4 joueurs : B et C prennent les places 2 et 3', ids[0] === 'player2' && ids[1] === 'player3', ids.join(','));

        // L'hôte complète la dernière place avec une IA
        await A.page.waitForSelector('[data-add-ai="player4"]', { timeout: 5000 });
        await A.page.click('[data-add-ai="player4"]');
        await C.page.waitForFunction(() => document.querySelectorAll('#lobbySlots li:not(.free)').length === 4, { timeout: 5000 })
            .then(() => check('4 joueurs : salle d’attente pleine vue par C', true))
            .catch(() => check('4 joueurs : salle d’attente pleine vue par C', false));
        const guestButtons = await B.page.evaluate(() => !!document.querySelector('[data-add-ai]') ||
            document.getElementById('launchBtn').offsetParent !== null);
        const hostLaunch = await A.page.evaluate(() => document.getElementById('launchBtn').offsetParent !== null);
        check('4 joueurs : seul l’hôte gère les IA et le lancement', !guestButtons && hostLaunch);

        await A.page.click('#launchBtn');
        await Promise.all(all.map(P => P.page.waitForFunction(
            () => gameState.gameStarted && ['player1', 'player2', 'player3', 'player4'].every(id => gameState.players[id]),
            { timeout: 10000 })));
        const views = await Promise.all(all.map(P => P.page.evaluate(() => ['player1', 'player2', 'player3', 'player4'].map(id => {
            const p = gameState.players[id];
            return `${Math.floor(p.x / TILE_SIZE)},${Math.floor(p.y / TILE_SIZE)}${p.ai ? ':IA' : ''}`;
        }).join(' '))));
        const expected = '0,0 14,14 14,0 0,14:IA';
        check('4 joueurs : les 4 coins, vus pareil par les 3 onglets', views.every(v => v === expected), views.join(' / '));
        const suits = await A.page.evaluate(() => PLAYER_IDS.map(id => gameState.players[id].suit));
        check('4 joueurs : 4 maillots de couleurs différentes', new Set(suits).size === 4, suits.join(','));
        const corners = await A.page.evaluate(() => Object.values(PLAYER_SLOTS).map(s => gameState.map[s.y][s.x]).join(','));
        check('4 joueurs : les 4 coins de départ sont du sable', corners === '0,0,0,0', corners);
        const cards = await C.page.$$eval('#hud .player-card', els => els.map(e => e.querySelector('.name').firstChild.textContent.trim()));
        check('4 joueurs : 4 fiches chez C, la sienne en premier', cards.length === 4 && cards[0] === 'Joueur vert' && cards.includes("L'IA"),
            cards.join(', '));

        await Promise.all(all.map(P => P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 })));

        // L'IA de l'hôte bouge, et C la voit bouger
        const seen = new Set();
        for (let i = 0; i < 25; i++) {
            const g = await gridOf(C.page, 'player4');
            seen.add(`${g.x},${g.y}`);
            await sleep(200);
        }
        check('4 joueurs : l’IA bouche-trou bouge (vue par C)', seen.size >= 2, [...seen].join(' '));
        // On la fige pour la suite (elle pourrait tuer quelqu'un au hasard)
        await A.page.evaluate(() => stopAI());

        // B meurt : 3 survivants, la manche continue
        await B.page.evaluate(() => database.ref(`games/${gameState.roomId}/players/player2/alive`).set(false));
        await sleep(1200);
        const stillOn = await A.page.evaluate(() => !gameState.match.roundOver);
        check('4 joueurs : une mort sur 4 ne termine pas la manche', stillOn);

        // C quitte en pleine manche : la partie continue pour les autres
        await C.browser.close();
        await A.page.waitForFunction(() => !gameState.players.player3, { timeout: 15000 });
        await sleep(300);
        const afterLeave = await Promise.all([A, B].map(P => P.page.$eval('#gameInfo', e => e.textContent)));
        check('4 joueurs : le départ de C ne termine pas la partie', afterLeave.every(t => !t.includes('quitté')), afterLeave.join(' / '));

        // L'IA meurt : A, seul survivant, gagne la manche
        await A.page.evaluate(() => {
            gameState.players.player4.alive = false;
            return database.ref(`games/${gameState.roomId}/players/player4/alive`).set(false);
        });
        await A.page.waitForFunction(() => gameState.match.roundOver, { timeout: 5000 });
        await sleep(300);
        const infoA = await A.page.$eval('#gameInfo', e => e.textContent);
        const infoB = await B.page.$eval('#gameInfo', e => e.textContent);
        check('4 joueurs : fin de manche, le vainqueur est nommé',
            infoA.startsWith('Manche gagnée') && infoB.includes('Le joueur rouge marque'), `A="${infoA}" / B="${infoB}"`);

        // Manche 2 : C, parti, n'est pas replacé
        await Promise.all([A, B].map(P => P.page.waitForFunction(
            () => gameState.match.round === 2 && !gameState.match.roundOver, { timeout: 8000 })));
        const r2 = await B.page.evaluate(() => ({ players: Object.keys(gameState.players).sort().join(','), scores: gameState.match.scores }));
        check('4 joueurs : manche 2 sans le joueur parti', r2.players === 'player1,player2,player4' && r2.scores.player1 === 1 && !('player3' in r2.scores),
            JSON.stringify(r2));
    } catch (e) {
        check('Déroulement du scénario 4 joueurs', false, e.message);
    } finally {
        for (const P of all) {
            check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
            P.logs.forEach(l => console.log(`   [${P.label}] ${l}`));
        }
        await A.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        for (const P of all) await P.browser.close().catch(() => {});
    }
}

// Solo contre 3 IA : 4 joueurs, les IA se battent aussi entre elles et
// continuent quand le joueur humain est mort.
async function scenarioSoloTroisIA() {
    const P = await openPlayer('Solo 3 IA');
    let room = null;
    try {
        await P.page.click('[data-ai-count="3"]');
        await P.page.click('[data-character="crabe"]');
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && Object.keys(gameState.players).length === 4, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        const ais = await P.page.evaluate(() => aiIds().sort().join(','));
        check('Solo 3 IA : 3 IA dans les places 2 à 4', ais === 'player2,player3,player4', ais);
        const looks = await P.page.evaluate(() => ['player1', 'player2', 'player3', 'player4'].map(id => gameState.players[id].character));
        check('Personnages : le joueur a le crabe, les IA 3 autres animaux différents',
            looks[0] === 'crabe' && new Set(looks).size === 4 && looks.slice(1).every(c => ['goeland', 'poisson', 'tortue', 'crabe', 'flamant', 'dauphin'].includes(c)), looks.join(','));
        const tint = await P.page.evaluate(() => {
            const c = tintedFrame('goeland_down_0', 'rouge', 'bleu');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let red = 0, blue = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 200) continue;
                if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) red++;
                if (d[i + 2] > 180 && d[i] < 90) blue++;
            }
            return { red, blue };
        });
        check('Personnages : maillot recoloré (bleu → rouge)', tint.red > 100 && tint.blue < 10, JSON.stringify(tint));
        const info = await P.page.$eval('#gameInfo', e => e.textContent);
        check('Solo 3 IA : message de partie', info.includes('contre 3 IA'), info);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });

        // Le joueur meurt tout de suite : les IA doivent continuer à jouer
        await P.page.evaluate(() => {
            gameState.players.player1.alive = false;
            return database.ref(`games/${gameState.roomId}/players/player1/alive`).set(false);
        });
        // Cases visitées (pas seulement départ/arrivée : une IA sort de son
        // coin, pose, et revient s'y abriter en moins de 3 s)
        const visited = new Set();
        for (let i = 0; i < 20; i++) {
            const cells = await P.page.evaluate(() => aiIds().map(id =>
                `${id}@${Math.floor(gameState.players[id].x / TILE_SIZE)},${Math.floor(gameState.players[id].y / TILE_SIZE)}`));
            cells.forEach(c => visited.add(c));
            await sleep(200);
        }
        const movedAis = new Set([...visited].map(c => c.split('@')[0])).size;
        const cellCount = visited.size;
        check('Solo 3 IA : les IA continuent après la mort du joueur', cellCount >= 5,
            `${cellCount} cases (IA@case) visitées en 4 s par ${movedAis} IA`);
        const hudCards = await P.page.$$eval('#hud .player-card', els => els.length);
        check('Solo 3 IA : 4 fiches joueurs', hudCards === 4, `${hudCards}`);
    } catch (e) {
        check('Déroulement du scénario solo 3 IA', false, e.message);
    } finally {
        check('Aucune erreur JS (solo 3 IA)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        P.logs.slice(0, 6).forEach(l => console.log(`   [Solo 3 IA] ${l}`));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Réglages de la partie (menu) : recopiés dans le match, et le tirage des
// bonus ne sort que les types autorisés.
async function scenarioReglages() {
    const P = await openPlayer('Réglages', '');
    let room = null;
    try {
        const menuOnly = await P.page.evaluate(() => getComputedStyle(document.querySelector('.arena')).display === 'none');
        check('Menu : pas d’île vide sous le choix de partie', menuOnly);
        await P.page.type('#nameInput', 'Paulo');
        await P.page.click('[data-setting="roundsToWin"] [data-value="1"]');
        await P.page.click('[data-setting="bonusRate"] [data-value="beaucoup"]');
        await P.page.click('[data-bonus="6"]'); // pas de noix pourrie
        await P.page.click('[data-bonus="2"]'); // ni de vitesse
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        // l'île réapparaît à l'image suivante (updateHud)
        await P.page.waitForFunction(() => !document.body.classList.contains('in-menu'), { timeout: 3000 }).catch(() => {});
        const m = await P.page.evaluate(() => ({ r: gameState.match.roundsToWin, rate: gameState.match.bonusRate, types: gameState.match.bonusTypes,
            arena: getComputedStyle(document.querySelector('.arena')).display !== 'none' }));
        check('Réglages recopiés dans le match', m.r === 1 && m.rate === 0.8 && m.types === '0,1,3,4,5', JSON.stringify(m));
        check('Partie lancée : le plateau réapparaît', m.arena);
        const pseudo = await P.page.evaluate(() => ({ card: document.querySelector('#hud .player-card .name').firstChild.textContent.trim(),
            info: document.getElementById('gameInfo').textContent, stored: gameState.players.player1.name }));
        check('Pseudo : sur la fiche et dans le message', pseudo.card === 'Paulo' && pseudo.info.includes('Vous êtes Paulo') && pseudo.stored === 'Paulo',
            JSON.stringify(pseudo));
        const drawn = await P.page.evaluate(async () => {
            for (let i = 0; i < 40; i++) spawnBonus(i % 15, 7);
            await new Promise(r => setTimeout(r, 300));
            return [...new Set(gameState.bonuses.map(b => b.type))].sort().join(',');
        });
        check('Tirage des bonus limité aux types choisis', drawn.length > 0 && !drawn.split(',').some(t => t === '2' || t === '6'), `types tirés : ${drawn}`);
        const saved = await P.page.evaluate(() => localStorage.getItem('islandBomber.settings'));
        check('Réglages retenus dans le navigateur', saved && saved.includes('"roundsToWin":1'), saved);
    } catch (e) {
        check('Déroulement du scénario réglages', false, e.message);
    } finally {
        check('Aucune erreur JS (réglages)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Cartes à thème : une partie solo par carte (?carte=…), IA figée, et la
// mécanique déclenchée pour de vrai.
async function scenarioCartes() {
    async function withMap(theme, fn) {
        const P = await openPlayer('Carte ' + theme, `?carte=${theme}&maree=600`);
        let room = null;
        try {
            await P.page.click('#singlePlayerBtn');
            await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
            room = await P.page.evaluate(() => gameState.roomId);
            await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
            // IA figée et écartée, ligne 1 dégagée (sans palmier ni élément)
            await P.page.evaluate(() => {
                stopAI();
                const row = {};
                for (let x = 0; x < GRID_SIZE; x++) {
                    row[x] = TILE_TYPES.EMPTY;
                    gameState.map[1][x] = TILE_TYPES.EMPTY;
                    delete gameState.features[featKey(x, 1)];
                    database.ref(`games/${gameState.roomId}/features/${featKey(x, 1)}`).remove();
                }
                return database.ref(`games/${gameState.roomId}/map/1`).set(row);
            });
            const theme2 = await P.page.evaluate(() => currentTheme());
            check(`Carte ${theme} : thème de la manche`, theme2 === theme, theme2);
            await fn(P);
        } catch (e) {
            check(`Déroulement de la carte ${theme}`, false, e.message);
        } finally {
            check(`Aucune erreur JS (carte ${theme})`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
            if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
            await P.browser.close();
        }
    }
    const teleport = (P, x, y) => P.page.evaluate(({ x, y }) => {
        const me = gameState.players.player1;
        const px = x * TILE_SIZE + TILE_SIZE / 2, py = y * TILE_SIZE + TILE_SIZE / 2;
        Object.assign(me, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
    }, { x, y });
    const setFeature = (P, x, y, f) => P.page.evaluate(({ x, y, f }) => {
        gameState.features[featKey(x, y)] = f;
        return database.ref(`games/${gameState.roomId}/features/${featKey(x, y)}`).set(f);
    }, { x, y, f });

    await withMap('ponton', async P => {
        await setFeature(P, 6, 1, { t: 'crack', s: 1 });
        await teleport(P, 6, 1);
        await P.page.keyboard.press(' ');
        await teleport(P, 6, 13);
        await P.page.waitForFunction(() => isHole(6, 1), { timeout: 5000 }).catch(() => {});
        const hole = await P.page.evaluate(() => ({ hole: isHole(6, 1), acc: isGridAccessible(6, 1) }));
        check('Ponton : la planche fragile casse en trou infranchissable', hole.hole && !hole.acc, JSON.stringify(hole));
        await P.page.waitForFunction(() => gameState.explosions.length === 0, { timeout: 3000 });
        await teleport(P, 6, 1);
        await sleep(300);
        const dead = await P.page.evaluate(() => gameState.players.player1.alive === false);
        check('Ponton : tomber dans un trou tue', dead && P.logs.some(l => l.includes('trou')), P.logs.slice(-1).join(''));
    });

    await withMap('volcan', async P => {
        await setFeature(P, 6, 1, { t: 'crack', s: 1 });
        await teleport(P, 6, 1);
        await P.page.keyboard.press(' ');
        await teleport(P, 6, 13);
        await P.page.waitForFunction(() => gameState.explosions.length > 0, { timeout: 5000 });
        await sleep(200);
        const f = await P.page.evaluate(() => featureAt(6, 1));
        check('Volcan : une explosion fissure plus, sans trou', f && f.s === 2 && !f.h, JSON.stringify(f));
    });

    await withMap('lagon', async P => {
        await setFeature(P, 5, 1, { t: 'current', d: 'r' });
        await teleport(P, 5, 1);
        await sleep(900);
        const g = await gridOf(P.page, 'player1');
        check('Lagon : le courant entraîne le joueur arrêté', g.x === 6 && g.y === 1, `position=(${g.x},${g.y})`);
    });

    await withMap('jungle', async P => {
        await setFeature(P, 5, 1, { t: 'burrow', to: '11_1' });
        await setFeature(P, 11, 1, { t: 'burrow', to: '5_1' });
        await teleport(P, 4, 1);
        await P.page.keyboard.down('ArrowRight');
        await sleep(120);
        await P.page.keyboard.up('ArrowRight');
        await sleep(600);
        const g = await gridOf(P.page, 'player1');
        check('Jungle : le terrier téléporte à l’autre bout', g.x === 11 && g.y === 1, `position=(${g.x},${g.y})`);
        await sleep(500);
        const g2 = await gridOf(P.page, 'player1');
        check('Jungle : pas de va-et-vient entre terriers', g2.x === 11, `position=(${g2.x},${g2.y})`);
    });

    await withMap('tempete', async P => {
        await P.page.evaluate(() => startAI()); // la boucle IA ne gêne pas : la tempête dépend de l'hôte
        await P.page.evaluate(() => stopAI());
        await P.page.waitForFunction(() => gameState.storm.length > 0, { timeout: 6000 })
            .then(() => check('Tempête : l’hôte fait tomber des noix de coco', true))
            .catch(() => check('Tempête : l’hôte fait tomber des noix de coco', false));
        await teleport(P, 7, 1);
        await P.page.evaluate(() => {
            const ref = database.ref(`games/${gameState.roomId}/storm`).push();
            return ref.set({ id: ref.key, x: 7, y: 1, at: serverNow() + 300 });
        });
        await sleep(900);
        const dead = await P.page.evaluate(() => gameState.players.player1.alive === false);
        check('Tempête : une noix de coco sur la tête tue', dead && P.logs.some(l => l.includes('noix de coco')), P.logs.slice(-1).join(''));
    });

    await withMap('grotte', async P => {
        await sleep(400);
        const dark = await P.page.evaluate(() => {
            if (!darkCanvas) return null;
            // coin opposé (loin du joueur et, a priori, des lumières) : sombre
            const d = darkCanvas.getContext('2d').getImageData(GRID_SIZE * TILE_SIZE - 20, GRID_SIZE * TILE_SIZE - 60, 1, 1).data;
            const me = darkCanvas.getContext('2d').getImageData(16, 16, 1, 1).data;
            return { far: d[3], me: me[3] };
        });
        check('Grotte : noir au loin, clair autour du joueur', dark && dark.far > 150 && dark.me < 60, JSON.stringify(dark));
    });
}

// Équipes 2 contre 2 en solo : vous + une IA (haut) contre deux IA (bas),
// maillot choisi = couleur de votre équipe, la manche va à l'équipe survivante.
async function scenarioEquipes() {
    const P = await openPlayer('Équipes', '?manches=2&maree=600');
    let room = null;
    try {
        await P.page.click('[data-setting="mode"] [data-value="equipes"]');
        await P.page.click('[data-suit="violet"]');
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && Object.keys(gameState.players).length === 4, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        const suits = await P.page.evaluate(() => PLAYER_IDS.map(id => gameState.players[id].suit).join(','));
        check('Équipes : maillot choisi pour mon équipe, autre couleur en face', suits === 'violet,bleu,violet,bleu', suits);
        const allies = await P.page.evaluate(() => ({ ally: isEnemy('player3', 'player1'), foe: isEnemy('player3', 'player2') }));
        check('Équipes : l’IA coéquipière ne vise pas le joueur', allies.ally === false && allies.foe === true, JSON.stringify(allies));
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        await P.page.evaluate(() => {
            stopAI();
            for (const id of ['player2', 'player4']) {
                gameState.players[id].alive = false;
                database.ref(`games/${gameState.roomId}/players/${id}/alive`).set(false);
            }
        });
        await P.page.waitForFunction(() => gameState.match.roundOver, { timeout: 5000 });
        await sleep(300);
        const r = await P.page.evaluate(() => ({ w: gameState.match.lastWinner, s: gameState.match.scores,
            info: document.getElementById('gameInfo').textContent }));
        check('Équipes : la manche va à l’équipe survivante, les deux marquent',
            r.w === 'A' && r.s.player1 === 1 && r.s.player3 === 1 && r.s.player2 === 0 && r.info.startsWith('Manche gagnée - 1 à 0'),
            JSON.stringify(r));
        const hud = await P.page.$$eval('#hud .player-card .name', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
        check('Équipes : fiches avec l’équipe, sans nom de personnage', hud[0].includes('vous') && hud[0].includes('équipe violette') &&
            !hud.some(t => /Goéland|Crabe|Tortue|Dauphin|Poisson|Flamant|Baigneuse/.test(t)), hud.join(' | '));
    } catch (e) {
        check('Déroulement du scénario équipes', false, e.message);
    } finally {
        check('Aucune erreur JS (équipes)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Commandes tactiles (?tactile=1) : glisser sur la croix fait marcher, le
// bouton pose une bombe ; sans le paramètre (ordinateur), rien n'apparaît.
async function scenarioTactile() {
    const D = await openPlayer('Ordinateur', '');
    try {
        await D.page.click('#singlePlayerBtn');
        await D.page.waitForFunction(() => gameState.gameStarted, { timeout: 10000 });
        const hidden = await D.page.evaluate(() => getComputedStyle(document.getElementById('touchPad')).display === 'none' &&
            !document.body.classList.contains('touch'));
        check('Tactile : commandes cachées sur ordinateur', hidden);
        const room = await D.page.evaluate(() => gameState.roomId);
        await D.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
    } catch (e) {
        check('Déroulement du scénario ordinateur', false, e.message);
    } finally {
        await D.browser.close();
    }

    const P = await openPlayer('Tactile', '?tactile=1&maree=600');
    let room = null;
    try {
        await P.page.setViewport({ width: 390, height: 844 });
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        await P.page.evaluate(() => stopAI());
        const layout = await P.page.evaluate(() => {
            const r = id => document.getElementById(id).getBoundingClientRect();
            const board = document.querySelector('.board-frame').getBoundingClientRect();
            return { board: board.bottom, pad: r('touchPad').top, bomb: r('touchBomb').top,
                fits: r('touchPad').bottom <= innerHeight && r('touchBomb').bottom <= innerHeight && board.right <= innerWidth };
        });
        check('Tactile : croix et bouton sous le plateau, dans l’écran', layout.pad >= layout.board && layout.fits, JSON.stringify(layout));

        const dir = await P.page.evaluate(() => isGridAccessible(1, 0) ? 'right' : 'down');
        const pad = await (await P.page.$('#touchPad')).boundingBox();
        const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
        await P.page.mouse.move(cx, cy);
        await P.page.mouse.down();
        await P.page.mouse.move(dir === 'right' ? cx + 55 : cx, dir === 'right' ? cy : cy + 55, { steps: 3 });
        await sleep(150);
        await P.page.mouse.up();
        await sleep(400);
        const g = await gridOf(P.page, 'player1');
        const keysReleased = await P.page.evaluate(() => !gameState.keys.ArrowRight && !gameState.keys.ArrowDown);
        check('Tactile : la croix fait avancer d’une case, puis s’arrête', (g.x === 1 || g.y === 1) && keysReleased,
            `position=(${g.x},${g.y}) touches relâchées=${keysReleased}`);

        await P.page.click('#touchBomb');
        await P.page.waitForFunction(() => gameState.bombs.some(b => b.playerId === 'player1'), { timeout: 2000 })
            .then(() => check('Tactile : le bouton pose une bombe', true))
            .catch(() => check('Tactile : le bouton pose une bombe', false));
    } catch (e) {
        check('Déroulement du scénario tactile', false, e.message);
    } finally {
        check('Aucune erreur JS (tactile)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }
}

// Pause en solo (tout est figé puis décalé) ; tirs amis désactivés en
// équipes (la bombe d'un coéquipier ne blesse pas).
async function scenarioPauseEtTirsAmis() {
    const P = await openPlayer('Pause', '?maree=600');
    let room = null;
    try {
        await P.page.click('#singlePlayerBtn');
        await P.page.waitForFunction(() => gameState.gameStarted && gameState.match, { timeout: 10000 });
        room = await P.page.evaluate(() => gameState.roomId);
        await P.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        await P.page.evaluate(() => stopAI());
        await P.page.keyboard.press(' ');
        await P.page.waitForFunction(() => gameState.bombs.length === 1, { timeout: 2000 });
        const start = await P.page.evaluate(() => gameState.match.roundStart);
        await P.page.keyboard.press('p');
        await sleep(4000);
        const during = await P.page.evaluate(() => ({ bombs: gameState.bombs.length, paused: isPaused(),
            btn: document.getElementById('pauseBtn').textContent }));
        check('Pause : la bombe n’explose pas pendant la pause', during.bombs === 1 && during.paused && during.btn === 'Reprendre',
            JSON.stringify(during));
        await P.page.keyboard.press('p');
        await sleep(300);
        const shifted = await P.page.evaluate(s => gameState.match.roundStart - s, start);
        check('Pause : la marée est décalée de la durée de la pause', shifted >= 3800 && shifted <= 5000, `${shifted} ms`);
        await P.page.waitForFunction(() => gameState.bombs.length === 0, { timeout: 5000 })
            .then(() => check('Pause : la bombe explose après la reprise', true))
            .catch(() => check('Pause : la bombe explose après la reprise', false));
    } catch (e) {
        check('Déroulement du scénario pause', false, e.message);
    } finally {
        check('Aucune erreur JS (pause)', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        if (room) await P.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await P.browser.close();
    }

    const T = await openPlayer('Tirs amis', '?maree=600&mode=equipes');
    room = null;
    try {
        await T.page.click('[data-setting="friendlyFire"] [data-value="non"]');
        await T.page.click('#singlePlayerBtn');
        await T.page.waitForFunction(() => gameState.gameStarted && Object.keys(gameState.players).length === 4, { timeout: 10000 });
        room = await T.page.evaluate(() => gameState.roomId);
        await T.page.waitForFunction(() => !countdownActive(), { timeout: 8000 });
        // bombe du joueur en (1,0), coéquipière (IA, player3) posée juste à côté,
        // le joueur à l'abri : seule la coéquipière est dans les flammes
        await T.page.evaluate(() => {
            stopAI();
            const place = (id, x, y) => {
                const p = gameState.players[id];
                const px = x * TILE_SIZE + TILE_SIZE / 2, py = y * TILE_SIZE + TILE_SIZE / 2;
                Object.assign(p, { x: px, y: py, fromX: px, fromY: py, toX: px, toY: py, moving: false });
            };
            gameState.map[0][1] = TILE_TYPES.EMPTY;
            gameState.map[0][2] = TILE_TYPES.EMPTY;
            place('player1', 1, 0);
            placeBomb();
            place('player1', 7, 7);
            gameState.map[7][7] = TILE_TYPES.EMPTY;
            place('player3', 2, 0);
        });
        await T.page.waitForFunction(() => gameState.explosions.length > 0, { timeout: 5000 });
        await sleep(600);
        const alive = await T.page.evaluate(() => ({ ff: gameState.match.friendlyFire, mate: gameState.players.player3.alive }));
        check('Tirs amis désactivés : la bombe d’un coéquipier ne tue pas', alive.ff === false && alive.mate === true, JSON.stringify(alive));
    } catch (e) {
        check('Déroulement du scénario tirs amis', false, e.message);
    } finally {
        check('Aucune erreur JS (tirs amis)', T.errors.length === 0, T.errors.slice(0, 3).join(' | '));
        if (room) await T.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        await T.browser.close();
    }
}

// Reconnexion et relais d'hôte : B recharge sa page et reprend sa place ;
// puis l'hôte A part, B prend le relais et juge la manche.
async function scenarioReconnexion() {
    const room = ROOM + '_reco';
    const A = await openPlayer('A5(hôte)', '?maree=600&grace=30');
    const B = await openPlayer('B5');
    const C = await openPlayer('C5');
    try {
        await A.page.type('#roomInput', room);
        await A.page.click('#createBtn');
        await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });
        for (const P of [B, C]) {
            await P.page.type('#roomInput', room);
            await P.page.click('#joinBtn');
            await P.page.waitForFunction(() => gameState.playerId && gameState.players[gameState.playerId], { timeout: 10000 });
        }
        await A.page.waitForFunction(() => Object.keys(gameState.players).length === 3 && !document.getElementById('launchBtn').disabled, { timeout: 10000 });
        await A.page.click('#launchBtn');
        await Promise.all([A, B, C].map(P => P.page.waitForFunction(() => gameState.gameStarted && !countdownActive(), { timeout: 12000 })));

        // B recharge sa page
        await B.page.reload({ waitUntil: 'networkidle2' });
        await A.page.waitForFunction(() => gameState.players.player2 && gameState.players.player2.offline, { timeout: 15000 })
            .then(() => check('Reconnexion : A voit B déconnecté', true))
            .catch(() => check('Reconnexion : A voit B déconnecté', false));
        const stillOn = await A.page.evaluate(() => !document.getElementById('gameControls').style.display.includes('block'));
        check('Reconnexion : à 3, la partie continue sans lui', stillOn);
        await B.page.waitForSelector('#resumeBtn', { visible: true, timeout: 10000 });
        await B.page.click('#resumeBtn');
        await B.page.waitForFunction(() => gameState.playerId === 'player2' && gameState.gameStarted &&
            gameState.players.player2 && !gameState.players.player2.offline, { timeout: 10000 });
        await A.page.waitForFunction(() => gameState.players.player2 && !gameState.players.player2.offline, { timeout: 10000 })
            .then(() => check('Reconnexion : B reprend sa place (vu par A)', true))
            .catch(() => check('Reconnexion : B reprend sa place (vu par A)', false));

        // L'hôte A part : B (première place humaine présente) prend le relais
        await A.browser.close();
        await C.page.waitForFunction(() => gameState.match.host === 'player2', { timeout: 20000 })
            .then(() => check('Relais : B devient l’hôte quand A part', true))
            .catch(() => check('Relais : B devient l’hôte quand A part', false));
        await C.page.evaluate(() => database.ref(`games/${gameState.roomId}/players/player3/alive`).set(false));
        await B.page.waitForFunction(() => gameState.match.roundOver, { timeout: 8000 });
        const winner = await B.page.evaluate(() => gameState.match.lastWinner);
        check('Relais : le nouvel hôte juge la manche', winner === 'player2', `gagnant=${winner}`);
    } catch (e) {
        check('Déroulement du scénario reconnexion', false, e.message);
    } finally {
        for (const P of [A, B, C]) check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        await B.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        for (const P of [A, B, C]) await P.browser.close().catch(() => {});
    }
}

// Onglet de l'hôte en arrière-plan : plus de requestAnimationFrame ni de
// minuterie d'IA ; le tic du Worker doit faire bouger l'IA (vu par B).
async function scenarioArrierePlan() {
    const room = ROOM + '_bg';
    const A = await openPlayer('A6(hôte caché)', '?maree=600');
    const B = await openPlayer('B6');
    try {
        await A.page.type('#roomInput', room);
        await A.page.click('#createBtn');
        await A.page.waitForSelector('[data-add-ai="player2"]', { timeout: 10000 });
        await A.page.click('[data-add-ai="player2"]');
        await A.page.waitForFunction(() => gameState.players.player2, { timeout: 10000 });
        await B.page.type('#roomInput', room);
        await B.page.click('#joinBtn');
        await A.page.waitForFunction(() => gameState.players.player3 && !document.getElementById('launchBtn').disabled, { timeout: 10000 });
        await A.page.click('#launchBtn');
        await Promise.all([A, B].map(P => P.page.waitForFunction(() => gameState.gameStarted && !countdownActive(), { timeout: 12000 })));
        await A.page.evaluate(() => {
            window.requestAnimationFrame = () => 0;   // plus d'images
            stopAI();                                 // plus de minuterie d'IA
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const seen = new Set();
        for (let i = 0; i < 25; i++) {
            const g = await gridOf(B.page, 'player2');
            seen.add(`${g.x},${g.y}`);
            await sleep(200);
        }
        check('Arrière-plan : l’IA de l’hôte caché continue de jouer', seen.size >= 2, [...seen].join(' '));
    } catch (e) {
        check('Déroulement du scénario arrière-plan', false, e.message);
    } finally {
        for (const P of [A, B]) check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
        await B.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
        for (const P of [A, B]) await P.browser.close().catch(() => {});
    }
}

// Salle d'attente : réglages de l'hôte visibles, personnage et maillot
// modifiables ; en équipes, un invité peut changer de place (d'équipe).
async function scenarioSalleAttente() {
    for (const mode of ['libre', 'equipes']) {
        const room = ROOM + '_salle_' + mode;
        const A = await openPlayer(`A7(${mode})`, mode === 'equipes' ? '?mode=equipes' : '');
        const B = await openPlayer(`B7(${mode})`);
        try {
            await A.page.type('#roomInput', room);
            await A.page.click('#createBtn');
            await A.page.waitForFunction(() => gameState.players.player1, { timeout: 10000 });
            await B.page.type('#roomInput', room);
            await B.page.click('#joinBtn');
            await B.page.waitForFunction(() => gameState.playerId === 'player2' &&
                document.getElementById('lobbySettings').textContent !== '', { timeout: 10000 });
            const settings = await B.page.$eval('#lobbySettings', e => e.textContent);
            if (mode === 'libre') {
                check('Salle d’attente : l’invité voit les réglages de l’hôte', settings.includes('Chacun pour soi') && settings.includes('carte'), settings);
                const joinedMsg = await B.page.$eval('#gameInfo', e => e.textContent);
                check('Salle d’attente : message d’arrivée avec la bonne couleur', joinedMsg.includes('joueur bleu'), joinedMsg);
                await B.page.click('[data-lobby-character="dauphin"]');
                await B.page.click('[data-lobby-suit="rose"]');
                await A.page.waitForFunction(() => gameState.players.player2.character === 'dauphin' && gameState.players.player2.suit === 'rose', { timeout: 8000 })
                    .then(() => check('Salle d’attente : personnage et maillot changés (vus par l’hôte)', true))
                    .catch(() => check('Salle d’attente : personnage et maillot changés (vus par l’hôte)', false));
                const redLocked = await B.page.$eval('[data-lobby-suit="rouge"]', b => b.disabled);
                check('Salle d’attente : la couleur de l’hôte est grisée', redLocked);
            } else {
                check('Salle d’attente : mode équipes affiché', settings.includes('Équipes'), settings);
                await B.page.waitForSelector('[data-move="player3"]', { timeout: 5000 });
                await B.page.click('[data-move="player3"]');
                await A.page.waitForFunction(() => gameState.players.player3 && !gameState.players.player3.ai && !gameState.players.player2, { timeout: 8000 });
                const moved = await B.page.evaluate(() => ({ id: gameState.playerId, suit: gameState.players.player3 && gameState.players.player3.suit,
                    team: gameState.match.teamColors.A }));
                check('Équipes : l’invité change d’équipe (place 3, couleur de l’équipe du haut)',
                    moved.id === 'player3' && moved.suit === moved.team, JSON.stringify(moved));
            }
        } catch (e) {
            check(`Déroulement du scénario salle d’attente (${mode})`, false, e.message);
        } finally {
            for (const P of [A, B]) check(`Aucune erreur JS chez ${P.label}`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
            await A.page.evaluate(r => database.ref(`games/${r}`).remove(), room).catch(() => {});
            for (const P of [A, B]) await P.browser.close().catch(() => {});
        }
    }
}
