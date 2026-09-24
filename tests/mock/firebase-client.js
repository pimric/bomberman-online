// Faux SDK Firebase (compat 9.x) pour les tests hors ligne : servi à la place
// de firebase-app-compat.js quand FIREBASE_MOCK=1 (voir mock/hub.js).
// Couvre seulement ce que game.html et les tests utilisent : ref, child, key,
// set, update (multi-chemins), remove, push, transaction, on/once/off
// ('value' et 'child_added'), onDisconnect().remove()/cancel(), .info/*.
// Même modèle que le vrai SDK : chaque page garde la copie « serveur »
// (ops reçues du hub, dans un ordre unique pour toutes les pages) plus ses
// propres écritures pas encore confirmées, appliquées par-dessus. Une
// écriture est donc visible tout de suite en local (listeners déclenchés en
// synchrone, comme la latency compensation) et n'est jamais « défaite » par
// l'écho d'une écriture plus ancienne.
(function () {
    const TIMESTAMP = { '.sv': 'timestamp' };
    let serverTree = null;  // état confirmé par le hub
    let tree = null;        // état visible = serverTree + écritures en attente
    const listeners = []; // { path, event, cb, last }
    const pendingOps = [];  // mes écritures envoyées, pas encore revenues
    const clientId = Math.random().toString(36).slice(2, 10);
    let opCounter = 0;
    let ready = false;
    const readyCallbacks = [];

    const split = path => String(path || '').split('/').filter(Boolean);
    const join = parts => parts.join('/');
    const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

    function getAt(parts) {
        let node = tree;
        for (const p of parts) {
            if (node === null || typeof node !== 'object') return null;
            node = node[p];
            if (node === undefined) return null;
        }
        return node === undefined ? null : node;
    }

    // Comme Firebase : objets vides et null n'existent pas
    function prune(v) {
        if (v === null || typeof v !== 'object') return v === undefined ? null : v;
        const out = {};
        for (const k of Object.keys(v)) {
            const c = prune(v[k]);
            if (c !== null) out[k] = c;
        }
        return Object.keys(out).length ? out : null;
    }

    function setAt(parts, value) {
        value = prune(clone(value));
        if (parts.length === 0) { tree = value; return; }
        if (tree === null || typeof tree !== 'object') tree = {};
        let node = tree;
        for (let i = 0; i < parts.length - 1; i++) {
            if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
            node = node[parts[i]];
        }
        if (value === null) delete node[parts[parts.length - 1]];
        else node[parts[parts.length - 1]] = value;
        tree = prune(tree);
    }

    function resolveServerValues(v) {
        if (v && typeof v === 'object') {
            if (v['.sv'] === 'timestamp') return Date.now();
            const out = Array.isArray(v) ? [] : {};
            for (const k of Object.keys(v)) out[k] = resolveServerValues(v[k]);
            return out;
        }
        return v;
    }

    // op = { id, writes: [[path, value], ...] }
    function applyWrites(op) {
        for (const [path, value] of op.writes) setAt(split(path), value);
    }

    function fireListeners() {
        for (const l of listeners.slice()) {
            if (!listeners.includes(l)) continue;
            const val = getAt(split(l.path));
            if (l.event === 'value') {
                const json = JSON.stringify(val);
                if (json === l.last) continue;
                l.last = json;
                l.cb(new Snapshot(l.path, val));
            } else if (l.event === 'child_added') {
                const keys = val && typeof val === 'object' ? Object.keys(val) : [];
                for (const k of keys) {
                    if (l.seen.has(k)) continue;
                    l.seen.add(k);
                    l.cb(new Snapshot(l.path + '/' + k, val[k]));
                }
                l.seen = new Set(keys.filter(k => l.seen.has(k)));
            }
        }
    }

    function write(writes) {
        const op = { id: clientId + ':' + (opCounter++), writes: writes.map(([p, v]) => [p, resolveServerValues(clone(v))]) };
        pendingOps.push(op);
        if (ready) {
            applyWrites(op);
            fireListeners();
            window.__mockSend({ type: 'op', op });
        }
        return Promise.resolve();
    }

    // Réception depuis le hub (ops de toutes les pages, dans l'ordre maître)
    window.__mockReceive = function (msg) {
        if (msg.type !== 'op') return;
        const i = pendingOps.findIndex(op => op.id === msg.op.id);
        if (i >= 0) pendingOps.splice(i, 1);
        tree = serverTree;
        applyWrites(msg.op);
        serverTree = tree;
        tree = clone(serverTree);
        for (const op of pendingOps) applyWrites(op);
        fireListeners();
    };

    let keyCounter = 0;
    function pushKey() {
        // clés triables comme celles de Firebase (horodatage + compteur + hasard)
        return '-M' + Date.now().toString(36) + (keyCounter++).toString(36).padStart(4, '0') +
            Math.random().toString(36).slice(2, 8);
    }

    // Comme Firebase à la lecture : un objet à clés entières assez dense
    // (plus de la moitié des indices présents) redevient un tableau
    function arrayify(v) {
        if (v === null || typeof v !== 'object') return v;
        const keys = Object.keys(v);
        for (const k of keys) v[k] = arrayify(v[k]);
        if (keys.length && keys.every(k => /^(0|[1-9]\d*)$/.test(k))) {
            const max = Math.max(...keys.map(Number));
            if (max + 1 <= keys.length * 2) {
                const arr = [];
                for (const k of keys) arr[Number(k)] = v[k];
                return arr;
            }
        }
        return v;
    }

    class Snapshot {
        constructor(path, val) {
            this._val = arrayify(clone(val));
            this.ref = new Ref(path);
            this.key = split(path).pop() || null;
        }
        val() { return clone(this._val); }
        exists() { return this._val !== null; }
        forEach(cb) {
            if (!this._val || typeof this._val !== 'object') return false;
            for (const k of Object.keys(this._val)) {
                if (cb(new Snapshot(join([...split(this.ref.path), k]), this._val[k])) === true) return true;
            }
            return false;
        }
    }

    function whenReady(fn) {
        if (ready) setTimeout(fn, 0);
        else readyCallbacks.push(fn);
    }

    class Ref {
        constructor(path) {
            this.path = join(split(path));
            this.key = split(path).pop() || null;
        }
        child(p) { return new Ref(join([...split(this.path), ...split(p)])); }
        set(value) { return write([[this.path, value]]); }
        update(values) {
            return write(Object.keys(values).map(k => [join([...split(this.path), ...split(k)]), values[k]]));
        }
        remove() { return write([[this.path, null]]); }
        push(value) {
            const ref = this.child(pushKey());
            if (value !== undefined) ref.set(value);
            return ref;
        }
        transaction(fn) {
            return new Promise(resolve => whenReady(() => {
                const next = fn(clone(getAt(split(this.path))));
                if (next === undefined) {
                    resolve({ committed: false, snapshot: new Snapshot(this.path, getAt(split(this.path))) });
                    return;
                }
                write([[this.path, next]]);
                resolve({ committed: true, snapshot: new Snapshot(this.path, getAt(split(this.path))) });
            }));
        }
        on(event, cb) {
            if (this.path === '.info/connected' || this.path === '.info/serverTimeOffset') {
                const v = this.path === '.info/connected' ? true : 0;
                setTimeout(() => cb(new Snapshot(this.path, v)), 0);
                return cb;
            }
            const l = { path: this.path, event, cb, last: undefined, seen: new Set() };
            listeners.push(l);
            whenReady(() => {
                if (!listeners.includes(l)) return;
                if (event === 'value') {
                    const val = getAt(split(l.path));
                    l.last = JSON.stringify(val);
                    cb(new Snapshot(l.path, val));
                } else {
                    fireListeners();
                }
            });
            return cb;
        }
        once(event, cb) {
            return new Promise(resolve => whenReady(() => {
                const snap = new Snapshot(this.path, getAt(split(this.path)));
                if (cb) cb(snap);
                resolve(snap);
            }));
        }
        off(event, cb) {
            for (let i = listeners.length - 1; i >= 0; i--) {
                const l = listeners[i];
                if (l.path === this.path && (!event || l.event === event) && (!cb || l.cb === cb)) listeners.splice(i, 1);
            }
        }
        onDisconnect() {
            const path = this.path;
            return {
                remove: () => { window.__mockSend({ type: 'onDisconnect', path, action: 'remove' }); return Promise.resolve(); },
                set: value => { window.__mockSend({ type: 'onDisconnect', path, action: 'set', value }); return Promise.resolve(); },
                cancel: () => { window.__mockSend({ type: 'onDisconnect', path, action: 'cancel' }); return Promise.resolve(); }
            };
        }
    }

    const db = { ref: path => new Ref(path) };
    const databaseFn = () => db;
    databaseFn.ServerValue = { TIMESTAMP };
    window.firebase = {
        initializeApp: () => ({}),
        database: databaseFn
    };

    // Copie initiale de la base maître
    window.__mockSend({ type: 'hello' }).then(master => {
        serverTree = prune(master);
        tree = clone(serverTree);
        ready = true;
        for (const op of pendingOps) {
            applyWrites(op);
            window.__mockSend({ type: 'op', op });
        }
        fireListeners();
        for (const fn of readyCallbacks.splice(0)) fn();
    });
})();
