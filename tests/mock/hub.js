// Base Firebase simulée en mémoire, partagée entre tous les navigateurs du
// test (FIREBASE_MOCK=1). Sert quand la vraie base n'est pas joignable
// (conteneur sans réseau) : mêmes scénarios, sans rien écrire en ligne.
//   - hub.attach(page, browser) : AVANT page.goto. Remplace les scripts
//     Firebase du CDN par mock/firebase-client.js et coupe les autres
//     ressources externes (polices Google).
//   - Les ops de chaque page sont appliquées à la base maître puis
//     renvoyées à toutes les pages, dans le même ordre pour tout le monde.
//   - onDisconnect (remove / set, TIMESTAMP serveur résolu ici) : appliqué
//     quand la page ou son navigateur se ferme, ou quand la page se recharge
//     (nouveau « hello » : l'ancienne connexion est morte).
const fs = require('fs');
const path = require('path');

const CLIENT = fs.readFileSync(path.join(__dirname, 'firebase-client.js'), 'utf8');

function createHub() {
    let master = null;
    const clients = new Set(); // { page, queue, onDisconnect: Map(path -> action) }

    const split = p => String(p || '').split('/').filter(Boolean);

    function prune(v) {
        if (v === null || v === undefined || typeof v !== 'object') return v === undefined ? null : v;
        const out = {};
        for (const k of Object.keys(v)) {
            const c = prune(v[k]);
            if (c !== null) out[k] = c;
        }
        return Object.keys(out).length ? out : null;
    }

    function setAt(parts, value) {
        value = prune(JSON.parse(JSON.stringify(value === undefined ? null : value)));
        if (parts.length === 0) { master = value; return; }
        if (master === null || typeof master !== 'object') master = {};
        let node = master;
        for (let i = 0; i < parts.length - 1; i++) {
            if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
            node = node[parts[i]];
        }
        if (value === null) delete node[parts[parts.length - 1]];
        else node[parts[parts.length - 1]] = value;
        master = prune(master);
    }

    function broadcast(op) {
        for (const w of op.writes) setAt(split(w[0]), w[1]);
        for (const c of clients) {
            // file par page : les ops arrivent dans l'ordre maître
            c.queue = c.queue
                .then(() => c.page.evaluate(msg => window.__mockReceive && window.__mockReceive(msg), { type: 'op', op }))
                .catch(() => {});
        }
    }

    const resolve = v => (v && typeof v === 'object'
        ? (v['.sv'] === 'timestamp' ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])))
        : v);
    let serverOps = 0;
    function runOnDisconnect(client) {
        const writes = [...client.onDisconnect.entries()].map(([p, action]) =>
            [p, action.type === 'set' ? resolve(action.value) : null]);
        client.onDisconnect.clear();
        if (writes.length) broadcast({ id: 'server:' + (serverOps++), writes });
    }
    function disconnect(client) {
        if (!clients.delete(client)) return;
        runOnDisconnect(client);
    }

    async function attach(page, browser) {
        const client = { page, queue: Promise.resolve(), onDisconnect: new Map() };
        clients.add(client);
        page.on('close', () => disconnect(client));
        if (browser) browser.on('disconnected', () => disconnect(client));

        await page.exposeFunction('__mockSend', msg => {
            if (msg.type === 'hello') {
                // rechargement de la page : l'ancienne connexion est morte
                if (client.helloed) runOnDisconnect(client);
                client.helloed = true;
                return master;
            }
            if (msg.type === 'op') broadcast(msg.op);
            if (msg.type === 'onDisconnect') {
                if (msg.action === 'remove') client.onDisconnect.set(msg.path, { type: 'remove' });
                else if (msg.action === 'set') client.onDisconnect.set(msg.path, { type: 'set', value: msg.value });
                else {
                    // cancel() : le chemin et tous ses descendants
                    for (const p of [...client.onDisconnect.keys()]) {
                        if (p === msg.path || p.startsWith(msg.path + '/')) client.onDisconnect.delete(p);
                    }
                }
            }
            return null;
        });

        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            if (url.startsWith('http://localhost')) return req.continue();
            if (url.includes('firebase-app-compat')) {
                return req.respond({ status: 200, contentType: 'text/javascript', body: CLIENT });
            }
            const css = url.includes('fonts.googleapis.com');
            return req.respond({ status: 200, contentType: css ? 'text/css' : 'text/javascript', body: '' });
        });
    }

    return { attach, dump: () => master };
}

module.exports = { createHub };
