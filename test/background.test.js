const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const ANAF_URL = "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60";
const EXTENSION_ID = "spv-extension-id";
const CONTAPP = { id: EXTENSION_ID, url: "https://contabilitate.contapp.ro/spv" };
const JSON_BODY = new TextEncoder().encode('{"mesaje":[]}');

// Whether a host permission pattern such as "*://anaf.ro/*" covers the origin of `url`.
const permits = (pattern, url) => {
    const [, scheme, host] = pattern.match(/^(\*|https?):\/\/([^/]+)\/\*$/);
    const { protocol, hostname } = new URL(url);

    return (scheme === "*" || `${scheme}:` === protocol) && host === hostname;
};
const permitted = (hosts, url) => hosts.some((pattern) => permits(pattern, url));

// Chrome checks a cookie against the host permissions as http(s)://<domain without the dot>/, https only when the
// cookie is Secure: getAll leaves out the cookies that fail, and remove rejects a URL that fails.
const cookieUrl = ({ domain, secure }) => `${secure ? "https" : "http"}://${domain.replace(/^\./, "")}/`;

// Runs background.js in its own realm with chrome.* stubbed. `fetchImpl(url, options, context)` plays fetch;
// `context` lets a test throw the realm's own error classes, which is what instanceof checks in the worker see.
// The cookies API only sees what `hosts`, the manifest's host permissions by default, allows. Both browsers expose
// `browser` (Chrome since 148, as a second namespace object over the same APIs); only Firefox has
// runtime.getBrowserInfo, and only Firefox accepts `firstPartyDomain` on the cookies API.
function loadBackground(fetchImpl, {
    granted = true, createTab, cookies = [], getAllCookies, firefox = false, hosts = manifest.host_permissions, online = true,
} = {}) {
    const fetchCalls = [];
    const bodies = [];
    const signals = [];
    const deadlines = [];
    const cookieQueries = [];
    const createdTabs = [];
    const removedCookies = [];
    const removedTabs = [];
    const events = [];
    const timers = [];
    const debug = [];
    const warnings = [];
    let keepAlives = 0;
    let tabIds = 100;
    let onConnect;
    let onMessage;
    let onTabRemoved;

    // Chrome's error text, for a cookie query shaped for Firefox.
    const unexpected = (method, details) => {
        if (!firefox && "firstPartyDomain" in details) {
            throw new Error(`Error in invocation of cookies.${method}(object details, optional function callback): Error at parameter 'details': Unexpected property: 'firstPartyDomain'.`);
        }
    };
    const chromeApi = {
        runtime: {
            id: EXTENSION_ID,
            getManifest: () => ({ version: "9.8.7", content_scripts: manifest.content_scripts }),
            getPlatformInfo: async () => keepAlives++,
            onConnect: { addListener: (callback) => (onConnect = callback) },
            onMessage: { addListener: (callback) => (onMessage = callback) },
            ...(firefox && { getBrowserInfo: async () => ({ name: "Firefox", vendor: "Mozilla", version: "140.0", buildID: "" }) }),
        },
        permissions: { contains: async () => granted },
        tabs: {
            create: createTab ?? (async (tab) => {
                events.push("tab");
                createdTabs.push(structuredClone(tab));

                return { ...tab, id: ++tabIds };
            }),
            remove: async (tabId) => removedTabs.push(tabId),
            onRemoved: { addListener: (callback) => (onTabRemoved = callback) },
        },
        cookies: {
            getAll: async (query) => {
                unexpected("getAll", query);
                cookieQueries.push(structuredClone(query));

                const all = getAllCookies ? await getAllCookies(query) : structuredClone(cookies);

                return all.filter((cookie) => permitted(hosts, cookieUrl(cookie)));
            },
            remove: async (details) => {
                unexpected("remove", details);
                if (!permitted(hosts, details.url)) {
                    throw new Error(`No host permissions for cookies at url: "${details.url}".`);
                }

                events.push("cookie");
                removedCookies.push(structuredClone(details));
            },
        },
    };

    const context = vm.createContext({
        URL,
        atob,
        btoa,
        AbortController,
        TextDecoder,
        FormData,
        Blob,
        URLSearchParams,
        navigator: { onLine: online },
        // Recorded instead of scheduled, so a test fires the 90 s deadline when it wants to.
        setTimeout: (callback, ms) => deadlines.push({ callback, ms, cleared: false }),
        clearTimeout: (id) => id && (deadlines[id - 1].cleared = true),
        setInterval: (callback, ms) => timers.push({ callback, ms, cleared: false }),
        clearInterval: (id) => (timers[id - 1].cleared = true),
        console: { debug: (...args) => debug.push(args), warn: (...args) => warnings.push(args) },
        fetch: async (url, options) => {
            const { signal, body, ...rest } = options;
            fetchCalls.push(structuredClone({ url, options: rest }));
            bodies.push(body);
            signals.push(signal);

            return fetchImpl(url, options, context);
        },
        chrome: chromeApi,
        browser: { ...chromeApi },
    });

    vm.runInContext(source, context);

    // Plays the content script: opens a port as `sender`, posts `message` and resolves with the first reply, cloned
    // out of the vm realm so deepEqual compares plain objects. `close()` disconnects the port the way a cancel does;
    // `handled()` says whether the worker listens to the port at all.
    const connect = (message, sender = CONTAPP, { name = "contapp-spv" } = {}) => {
        const listeners = { message: [], disconnect: [] };
        let disconnected = false;
        let close;
        const reply = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("the worker never answered")), 1000).unref();
            const port = {
                name,
                sender,
                postMessage: (response) => {
                    assert.equal(disconnected, false, "the worker must not post to a closed port");
                    clearTimeout(timeout);
                    resolve(structuredClone(response));
                },
                disconnect: () => (disconnected = true),
                onMessage: { addListener: (callback) => listeners.message.push(callback) },
                onDisconnect: { addListener: (callback) => listeners.disconnect.push(callback) },
            };

            close = () => {
                clearTimeout(timeout);
                disconnected = true;
                listeners.disconnect.forEach((callback) => callback(port));
                resolve("closed");
            };
            onConnect(port);
            if (!disconnected) {
                listeners.message.forEach((callback) => callback(message, port));
            }
        });

        return { reply, close, disconnected: () => disconnected, handled: () => listeners.message.length > 0 };
    };
    // A site's bookkeeping, which must be back to nothing once its requests have settled.
    const state = (site) => structuredClone(vm.runInContext(`({ inFlight: ${site}.inFlight.size, running: ${site}.running, waiting: ${site}.waiting.length })`, context));
    const IDLE = { inFlight: 0, running: 0, waiting: 0 };
    const send = (message, sender) => connect(message, sender).reply;
    // Plays login-tab.js: a one-off runtime message from a tab, answered through sendResponse.
    const tell = (message, tabId, url, id = EXTENSION_ID) => {
        let response;
        onMessage(message, { id, url, tab: { id: tabId } }, (value) => (response = structuredClone(value)));

        return response;
    };

    return {
        send, connect, tell, closeTab: (tabId) => onTabRemoved(tabId), removedTabs, fetchCalls, bodies, signals, deadlines, cookieQueries, createdTabs, removedCookies, events, timers,
        keepAlives: () => keepAlives, debug, warnings, state, IDLE,
    };
}

const unreachable = () => assert.fail("fetch must not be called");
const respond = (status, bytes = JSON_BODY, url = ANAF_URL) => async () => ({ status, url, arrayBuffer: async () => bytes.slice().buffer });
const answered = () => ({ status: 200, url: ANAF_URL, arrayBuffer: async () => JSON_BODY.slice().buffer });
const throwing = (name, message) => (url, options, context) => {
    throw new (vm.runInContext(name, context))(message);
};

test("ping answers the manifest version", async () => {
    const { send } = loadBackground(unreachable);

    assert.deepEqual(await send({ type: "ping" }), { ok: true, version: "9.8.7" });
});

test("the hosts the worker fetches from are the ones the manifest asks permission for", () => {
    const listener = { addListener() {} };
    const context = vm.createContext({ chrome: { runtime: { onConnect: listener, onMessage: listener }, tabs: { onRemoved: listener } }, URL });
    vm.runInContext(source, context);

    const sites = structuredClone(vm.runInContext("SITES.map(({ host, api, permission, cookieOrigins }) => ({ host, api, permission, cookieOrigins }))", context));

    for (const { host, api, permission } of sites) {
        assert.deepEqual(permission, { origins: [`${new URL(api).origin}/*`] }, host);
        assert.ok(permitted(manifest.host_permissions, api), host);
    }
    assert.deepEqual(
        manifest.host_permissions,
        sites.flatMap(({ cookieOrigins }) => cookieOrigins),
        "the manifest asks for exactly what the session resets check for",
    );
    assert.deepEqual(manifest.permissions, ["cookies"], "only cookies, to reset ANAF's session before the login tab");
    assert.deepEqual(
        manifest.content_scripts.find(({ js }) => js.includes("login-tab.js")).matches,
        [
            "https://decl.anaf.mfinante.gov.ro/my.policy*",
            "https://decl.anaf.mfinante.gov.ro/WAS6DUS/*",
            "https://webserviced.anaf.ro/SPVWS2/rest/*",
        ],
        "the login helper runs only on the portal's F5 form and the pages a login ends on",
    );
});

test("fetch and login refuse anything that does not resolve under the SPV REST API", async () => {
    const { send, fetchCalls, createdTabs } = loadBackground(unreachable);
    const forbidden = [
        undefined, null, 42, [ANAF_URL], new String(ANAF_URL), "", "not a url",
        "http://webserviced.anaf.ro/SPVWS2/rest/x",
        "https://example.com/?u=https://webserviced.anaf.ro/SPVWS2/rest/x",
        "https://webserviced.anaf.ro.evil.example/SPVWS2/rest/x",
        "https://webserviced.anaf.ro@evil.example/SPVWS2/rest/x",
        "https://user@webserviced.anaf.ro/SPVWS2/rest/x",
        "https://webserviced.anaf.ro/SPVWS2/rest",
        "https://webserviced.anaf.ro/SPVWS2/restful/x",
        "https://webserviced.anaf.ro/spvws2/rest/x",
        "https://webserviced.anaf.ro//SPVWS2/rest/x",
        "javascript:alert(1)//https://webserviced.anaf.ro/SPVWS2/rest/",
        // Dot segments resolve before the request leaves the browser, so the check has to see them resolved.
        "https://webserviced.anaf.ro/SPVWS2/rest/../../admin",
        "https://webserviced.anaf.ro/SPVWS2/rest/%2e%2e/%2e%2e/admin",
        "https://webserviced.anaf.ro/SPVWS2/rest/.%2e/.%2e/admin",
        "https://webserviced.anaf.ro/SPVWS2/rest/..\\..\\admin",
        "https://webserviced.anaf.ro/SPVWS2/rest/x/../../../admin",
        // The parser leaves these in place; a server may still resolve them (Tomcat strips ";" path parameters).
        "https://webserviced.anaf.ro/SPVWS2/rest/..;/admin",
        "https://webserviced.anaf.ro/SPVWS2/rest/..%2Fadmin",
        "https://webserviced.anaf.ro/SPVWS2/rest/%2E%2E%2Fadmin",
        "https://webserviced.anaf.ro/SPVWS2/rest/..%5Cadmin",
        "https://webserviced.anaf.ro/SPVWS2/rest/x;jsessionid=1",
        "https://webserviced.anaf.ro/SPVWS2/rest/a%2eb",
    ];

    for (const url of forbidden) {
        assert.deepEqual(await send({ type: "fetch", url }), { ok: false, error: "forbidden_url" }, String(url));
        assert.deepEqual(await send({ type: "login", url }), { ok: false, error: "forbidden_url" }, String(url));
    }

    assert.equal(fetchCalls.length + createdTabs.length, 0);
});

test("fetch and login use the normalised URL", async () => {
    const { send, fetchCalls, createdTabs } = loadBackground(respond(200));
    const normalised = [
        [ANAF_URL, ANAF_URL],
        ["https://webserviced.anaf.ro:443/SPVWS2/rest/x", "https://webserviced.anaf.ro/SPVWS2/rest/x"],
        ["HTTPS://WEBSERVICED.ANAF.RO/SPVWS2/rest/x", "https://webserviced.anaf.ro/SPVWS2/rest/x"],
        [" https://webserviced.anaf.ro\\SPVWS2/rest/x", "https://webserviced.anaf.ro/SPVWS2/rest/x"],
        ["https://webserviced.anaf.ro/SPVWS2/rest/x/../y", "https://webserviced.anaf.ro/SPVWS2/rest/y"],
        ["https://webserviced.anaf.ro/SPVWS2/rest/a b?x=ü", "https://webserviced.anaf.ro/SPVWS2/rest/a%20b?x=%C3%BC"],
        // Only the path is checked for escapes: the query carries what the page puts there.
        ["https://webserviced.anaf.ro/SPVWS2/rest/cerere?tip=100%25&cui=a%2Fb;c=%2e&d=..%5C", "https://webserviced.anaf.ro/SPVWS2/rest/cerere?tip=100%25&cui=a%2Fb;c=%2e&d=..%5C"],
        ["https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=1#..;/x", "https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=1#..;/x"],
    ];

    for (const [url, href] of normalised) {
        assert.equal((await send({ type: "fetch", url })).ok, true, url);
        assert.equal(fetchCalls.at(-1).url, href);
    }

    // login takes the same normalisation, on the one SPV address it opens.
    const logins = [
        [ANAF_URL, ANAF_URL],
        ["https://webserviced.anaf.ro:443/SPVWS2/rest/listaMesaje?zile=7", "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=7"],
        ["HTTPS://WEBSERVICED.ANAF.RO/SPVWS2/rest/listaMesaje", "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje"],
        ["https://webserviced.anaf.ro/SPVWS2/rest/x/../listaMesaje#top", "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje#top"],
    ];

    for (const [url, href] of logins) {
        assert.equal((await send({ type: "login", url })).ok, true, url);
        assert.deepEqual(createdTabs.at(-1), { url: href });
    }

    // Any other SPV address is fetched on request but never opened in a tab.
    for (const url of [
        "https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=1",
        "https://webserviced.anaf.ro/SPVWS2/rest/cerere?tip=D300&cui=1",
        "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje/x",
        "https://webserviced.anaf.ro/SPVWS2/rest/listaMesajeX",
        "https://webserviced.anaf.ro/SPVWS2/rest/",
    ]) {
        assert.equal((await send({ type: "fetch", url })).ok, true, url);
        assert.deepEqual(await send({ type: "login", url }), { ok: false, error: "forbidden_url" }, url);
    }
    assert.equal(createdTabs.length, logins.length);
});

test("fetch returns status, final url and the body as base64, whatever the status or size", async () => {
    // A PDF header, then every byte value, in lengths around the 0x8000 chunk toBase64 encodes at a time.
    for (const length of [4, 5, 0x7fff, 0x8000, 0x8001, 0x8000 * 3 + 7]) {
        const bytes = Uint8Array.from({ length }, (_, i) => (i < 4 ? "%PDF".charCodeAt(i) : (i * 7 + 13) & 0xff));
        const { send, fetchCalls } = loadBackground(respond(200, bytes, `${ANAF_URL}&final`));

        assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), {
            ok: true,
            status: 200,
            url: `${ANAF_URL}&final`,
            body: Buffer.from(bytes).toString("base64"),
        });
        assert.deepEqual(fetchCalls, [{
            url: ANAF_URL,
            options: { credentials: "include", redirect: "follow", cache: "no-store" },
        }]);
    }

    // HTTP errors are the page's business: they still arrive as ok:true with the status.
    for (const status of [401, 404, 500]) {
        const { send } = loadBackground(respond(status, new TextEncoder().encode("denied")));

        assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: true, status, url: ANAF_URL, body: "ZGVuaWVk" });
    }
});

test("fetch failures map to certificate_required for a TypeError and network for everything else", async () => {
    const failures = [
        [throwing("TypeError", "Failed to fetch"), { ok: false, error: "certificate_required" }],
        [throwing("Error", "boom"), { ok: false, error: "network", message: "boom" }],
        [throwing("RangeError", "too big"), { ok: false, error: "network", message: "too big" }],
        [() => { throw new Error("host realm"); }, { ok: false, error: "network", message: "host realm" }],
        [() => { throw "plain string"; }, { ok: false, error: "network", message: "plain string" }],
        [() => { throw null; }, { ok: false, error: "network", message: "null" }],
    ];

    for (const [fetchImpl, expected] of failures) {
        const { send } = loadBackground(fetchImpl);

        assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), expected);
    }
});

test("a body that cannot be read is a network error, even when the stream throws a TypeError", async () => {
    const { send } = loadBackground(async (url, options, context) => ({
        status: 200,
        url: ANAF_URL,
        arrayBuffer: async () => throwing("TypeError", "body stream already read")(url, options, context),
    }));

    assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "network", message: "body stream already read" });
});

test("a fetch cut off by the deadline answers timeout, not certificate_required", async () => {
    // A real fetch rejects with the signal's reason once the deadline aborts it.
    const { send, deadlines, state, IDLE } = loadBackground((url, options) => {
        deadlines.at(-1).callback();
        throw options.signal.reason;
    });

    assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "timeout" });
    assert.deepEqual(deadlines.map(({ ms }) => ms), [90_000]);
    assert.deepEqual(state("SPV"), IDLE, "a timed-out request is forgotten like any other");

    // AbortSignal.timeout's own rejection, in case the deadline is ever built that way.
    const domTimeout = loadBackground(() => {
        domTimeout.deadlines.at(-1).callback();
        throw new DOMException("signal timed out", "TimeoutError");
    });

    assert.deepEqual(await domTimeout.send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "timeout" });
});

test("once the headers arrive the body gets five minutes instead of 90 s, so a slow download is not cut off", async () => {
    let whileReading;
    const { send, deadlines } = loadBackground(async () => ({
        status: 200,
        url: ANAF_URL,
        arrayBuffer: async () => {
            whileReading = deadlines.map(({ ms, cleared }) => [ms, cleared]);

            return JSON_BODY.slice().buffer;
        },
    }));

    assert.equal((await send({ type: "fetch", url: ANAF_URL })).ok, true);
    assert.deepEqual(whileReading, [[90_000, true], [300_000, false]]);
    assert.equal(deadlines[1].cleared, true, "and the body deadline is cleared once it is read");
});

test("a body that stalls after the headers times out and frees its slot", async () => {
    const { send, deadlines, fetchCalls } = loadBackground((url, options) => {
        if (fetchCalls.length > 4) {
            return answered();
        }

        return {
            status: 200,
            url: ANAF_URL,
            arrayBuffer: () => new Promise((resolve, reject) => {
                options.signal.addEventListener("abort", () => reject(options.signal.reason));
            }),
        };
    });
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const stalled = Array.from({ length: 4 }, () => send({ type: "fetch", url: ANAF_URL }));
    const queued = send({ type: "fetch", url: ANAF_URL });

    await settle();
    assert.equal(fetchCalls.length, 4);

    deadlines.filter(({ ms, cleared }) => ms === 300_000 && !cleared).forEach(({ callback }) => callback());
    for (const reply of await Promise.all(stalled)) {
        assert.deepEqual(reply, { ok: false, error: "timeout" });
    }
    assert.equal((await queued).ok, true);
});

test("at most four fetches use the network at once, leaving connections for the login tab", async () => {
    const pending = [];
    const { send, fetchCalls, state, IDLE } = loadBackground(() => new Promise((resolve) => pending.push(resolve)));
    const replies = Array.from({ length: 6 }, () => send({ type: "fetch", url: ANAF_URL }));
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    await settle();
    assert.equal(fetchCalls.length, 4);
    assert.deepEqual(state("SPV"), { inFlight: 6, running: 4, waiting: 2 });

    pending.shift()(answered());
    await settle();
    assert.equal(fetchCalls.length, 5, "a finished fetch hands its slot to the next one");

    while (pending.length) {
        pending.shift()(answered());
        await settle();
    }

    assert.equal(fetchCalls.length, 6);

    assert.deepEqual((await Promise.all(replies)).map(({ ok }) => ok), [true, true, true, true, true, true]);
    assert.deepEqual(state("SPV"), IDLE, "nothing is left behind once every request has settled");

    // A handed-over slot stays counted: the next wave is limited like the first, not by what the hand-offs left.
    const more = Array.from({ length: 6 }, () => send({ type: "fetch", url: ANAF_URL }));
    await settle();
    assert.equal(fetchCalls.length, 10, "four more at once, not six");

    while (pending.length) {
        pending.shift()(answered());
        await settle();
    }
    assert.deepEqual((await Promise.all(more)).map(({ ok }) => ok), Array(6).fill(true));
    assert.deepEqual(state("SPV"), IDLE);
});

test("a port under another name is not this extension's bridge: no listener, no answer, no fetch", async () => {
    const { connect, fetchCalls } = loadBackground(unreachable);
    const other = connect({ type: "fetch", url: ANAF_URL }, CONTAPP, { name: "other" });
    const ours = connect({ type: "ping" });

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([other.handled(), other.disconnected()], [false, false], "left alone, not even refused");
    assert.equal(ours.handled(), true);
    assert.deepEqual(await ours.reply, { ok: true, version: "9.8.7" });
    assert.equal(fetchCalls.length, 0);
    other.close();
});

test("a body too large for a runtime message is a network error instead of a reply that never arrives", async () => {
    const { send } = loadBackground(respond(200, new Uint8Array(48 * 1024 * 1024)));
    const response = await send({ type: "fetch", url: ANAF_URL });

    assert.equal(response.error, "network");
    assert.match(response.message, /50331648 bytes/);
});

test("fetch refuses to run without the host permission, which Firefox lets the user revoke", async () => {
    const { send, fetchCalls } = loadBackground(unreachable, { granted: false });
    const response = await send({ type: "fetch", url: ANAF_URL });

    assert.equal(response.error, "permission");
    assert.match(response.message, /permission for https:\/\/webserviced\.anaf\.ro\/\* is not granted/);
    assert.equal(fetchCalls.length, 0);
});

test("the service worker is kept alive while a fetch is pending and left alone afterwards", async () => {
    let whileFetching;
    const { send, timers, keepAlives } = loadBackground(() => {
        timers.at(-1).callback();
        whileFetching = { timers: timers.length, keepAlives: keepAlives() };

        // The failure path is the one a refactor would forget to clear; success goes through the same finally.
        throw new Error("done");
    });

    await send({ type: "fetch", url: ANAF_URL });

    assert.deepEqual(whileFetching, { timers: 1, keepAlives: 1 });
    assert.deepEqual(timers.map((timer) => [timer.ms, timer.cleared]), [[25_000, true]]);
});

test("login clears every cookie the ANAF host receives, partitioned or on .anaf.ro, before it opens the tab", async () => {
    const cookies = [
        { name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0", secure: true },
        { name: "F5_ST", domain: ".webserviced.anaf.ro", hostOnly: false, path: "/SPVWS2", storeId: "0" },
        { name: "TS01", domain: ".anaf.ro", hostOnly: false, path: "/", storeId: "0" },
        { name: "CHIPS", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0", partitionKey: { topLevelSite: "https://contapp.ro" } },
        // Neither reaches webserviced.anaf.ro, so neither is the gateway's.
        { name: "www", domain: "www.anaf.ro", hostOnly: true, path: "/", storeId: "0" },
        { name: "host", domain: "anaf.ro", hostOnly: true, path: "/", storeId: "0" },
    ];
    const { send, removedCookies, cookieQueries, events } = loadBackground(unreachable, { cookies });

    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" });
    assert.deepEqual(cookieQueries, [{ domain: "anaf.ro", partitionKey: {} }]);
    assert.deepEqual(removedCookies, [
        { url: "https://webserviced.anaf.ro/", name: "MRHSession", storeId: "0" },
        { url: "https://webserviced.anaf.ro/SPVWS2", name: "F5_ST", storeId: "0" },
        { url: "https://anaf.ro/", name: "TS01", storeId: "0" },
        { url: "https://webserviced.anaf.ro/", name: "CHIPS", storeId: "0", partitionKey: { topLevelSite: "https://contapp.ro" } },
    ]);
    assert.deepEqual(events, ["cookie", "cookie", "cookie", "cookie", "tab"]);
});

test("on Chrome, which also has a browser namespace since 148, the cookie query carries no firstPartyDomain", async () => {
    const cookies = [{ name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0" }];
    const { send, removedCookies, cookieQueries, warnings } = loadBackground(unreachable, { cookies });

    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" });
    assert.deepEqual(cookieQueries, [{ domain: "anaf.ro", partitionKey: {} }]);
    assert.deepEqual(removedCookies, [{ url: "https://webserviced.anaf.ro/", name: "MRHSession", storeId: "0" }]);
    assert.deepEqual(warnings, []);
});

test("in Firefox the cookie query covers first-party isolation and removal passes the cookie's first-party domain", async () => {
    const cookies = [{ name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "firefox-default", firstPartyDomain: "" }];
    const { send, removedCookies, cookieQueries } = loadBackground(unreachable, { cookies, firefox: true });

    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" });
    assert.deepEqual(cookieQueries, [{ domain: "anaf.ro", partitionKey: {}, firstPartyDomain: null }]);
    assert.deepEqual(removedCookies, [{ url: "https://webserviced.anaf.ro/", name: "MRHSession", storeId: "firefox-default", firstPartyDomain: "" }]);
});

test("a session reset that cannot run is reported and logged, and the tab still opens", async () => {
    const getAllCookies = async () => { throw new Error("cookies API unavailable"); };
    const failing = loadBackground(unreachable, { getAllCookies });

    assert.deepEqual(await failing.send({ type: "login", url: ANAF_URL }), { ok: true, reset: "failed", message: "cookies API unavailable" });
    assert.deepEqual(failing.createdTabs, [{ url: ANAF_URL }]);
    assert.equal(failing.warnings.length, 1);

    // Without the host permission getAll returns nothing instead of failing, so it is checked up front.
    const revoked = loadBackground(unreachable, { granted: false });

    assert.deepEqual(await revoked.send({ type: "login", url: ANAF_URL }), {
        ok: true,
        reset: "failed",
        message: "permission for *://webserviced.anaf.ro/* and *://anaf.ro/* is not granted",
    });
    assert.deepEqual(revoked.cookieQueries, []);
    assert.deepEqual(revoked.createdTabs, [{ url: ANAF_URL }]);
});

test("login keeps a session the last fetch found alive, and clears one it found lost", async () => {
    const cookies = [{ name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0" }];
    const text = (body) => new TextEncoder().encode(body);
    const replies = [
        respond(200, text(' {"mesaje":[]}'))(),
        respond(200, text("%PDF-1.4"))(),
        respond(200, text('\uFEFF{"mesaje":[]}'))(),
        respond(200, text(`${"\r\n".repeat(20)}[]`))(),
        respond(200, text("<html></html>"), "https://webserviced.anaf.ro/my.policy")(),
        respond(200, text("<html>Access denied</html>"))(),
        respond(200, new Uint8Array(0))(),
        respond(500, text('{"eroare":"x"}'))(),
    ];
    const { send, removedCookies } = loadBackground(() => replies.shift(), { cookies });

    for (const alive of ["JSON answer", "PDF download", "JSON after a byte order mark", "JSON after blank lines"]) {
        await send({ type: "fetch", url: ANAF_URL });
        assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "kept" }, alive);
    }
    assert.equal(removedCookies.length, 0, "another ContApp tab may be syncing with it");

    for (const lost of ["redirected to F5", "gateway page under the REST prefix", "empty body", "HTTP 500"]) {
        await send({ type: "fetch", url: ANAF_URL });
        assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" }, lost);
    }
});

test("login on a lost session cancels the fetches stuck on it", async () => {
    let started;
    const stuck = new Promise((resolve) => (started = resolve));
    const { send, signals } = loadBackground((url, options) => {
        started();

        return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
    });
    const reply = send({ type: "fetch", url: ANAF_URL });

    await stuck;
    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" });
    assert.equal(signals[0].aborted, true);
    assert.deepEqual(await reply, { ok: false, error: "cancelled" });
});

test("login also cancels the fetches queued for a slot, and fetches sent during the reset wait for it", async () => {
    let finishReset;
    const resetRunning = new Promise((resolve) => (finishReset = resolve));
    const getAllCookies = async () => {
        await resetRunning;

        return [];
    };
    const { send, fetchCalls } = loadBackground((url, options) =>
        new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))),
    { getAllCookies });
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const stuck = Array.from({ length: 6 }, () => send({ type: "fetch", url: ANAF_URL }));

    await settle();
    assert.equal(fetchCalls.length, 4);

    const login = send({ type: "login", url: ANAF_URL });
    await settle();

    // The freed slots must not go to the queued fetches while the dead session's cookies are still there.
    assert.equal(fetchCalls.length, 4);
    for (const reply of await Promise.all(stuck)) {
        assert.deepEqual(reply, { ok: false, error: "cancelled" });
    }

    const late = send({ type: "fetch", url: ANAF_URL });
    await settle();
    assert.equal(fetchCalls.length, 4, "a fetch sent during the reset waits for it");

    finishReset();
    assert.deepEqual(await login, { ok: true, reset: "cleared" });
    await settle();
    assert.equal(fetchCalls.length, 5, "and starts once the cookies are gone, with every slot free again");

    // A second login cancels it in turn, which shows it held a slot normally.
    const again = send({ type: "login", url: ANAF_URL });
    finishReset();
    await again;
    assert.deepEqual(await late, { ok: false, error: "cancelled" });
});

test("login opens a tab, and a tab that cannot be opened is a network error", async () => {
    const { send, createdTabs } = loadBackground(unreachable);
    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" });
    assert.deepEqual(createdTabs, [{ url: ANAF_URL }]);

    const createTab = async () => { throw new Error("Tabs cannot be edited right now"); };
    const failing = loadBackground(unreachable, { createTab });
    assert.deepEqual(await failing.send({ type: "login", url: ANAF_URL }), { ok: false, error: "network", message: "Tabs cannot be edited right now" });
    assert.equal(failing.debug.length, 1, "the failure is logged");
});

test("unknown message types and malformed messages are rejected", async () => {
    const { send } = loadBackground(unreachable);

    for (const message of [{ type: "delete" }, {}, undefined, null, "fetch", 7, []]) {
        assert.deepEqual(await send(message), { ok: false, error: "unknown_type" });
    }
});

test("only the ContApp hosts the content script runs on may open a port", async () => {
    const { send, fetchCalls } = loadBackground(respond(200));
    const refused = [
        null,
        {},
        { id: EXTENSION_ID },
        { id: EXTENSION_ID, url: "not a url" },
        { id: EXTENSION_ID, url: "https://contapp.ro/" },
        { id: EXTENSION_ID, url: "https://blog.contapp.ro/" },
        { id: EXTENSION_ID, url: "https://crm.contapp.ro/" },
        { id: EXTENSION_ID, url: "https://drive.contapp.ro/" },
        { id: EXTENSION_ID, url: "https://api.contapp.ro/" },
        { id: EXTENSION_ID, url: "https://evil.contabilitate.contapp.ro/" },
        { id: EXTENSION_ID, url: "https://contabilitate.contapp.ro.evil.example/" },
        { id: EXTENSION_ID, url: "http://contabilitate.contapp.ro/" },
        { id: "another-extension", url: CONTAPP.url },
    ];

    for (const sender of refused) {
        assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }, sender), { ok: false, error: "forbidden_origin" }, String(JSON.stringify(sender)));
    }
    assert.equal(fetchCalls.length, 0);

    const hosts = ["account", "contabilitate", "declaratiaunica"];
    for (const url of [...hosts.map((host) => `https://${host}.contapp.ro/x?y`), "https://app.contapp.test/", "https://contapp.test/"]) {
        assert.deepEqual(await send({ type: "ping" }, { id: EXTENSION_ID, url }), { ok: true, version: "9.8.7" }, url);
    }
});

test("a fetch that ends outside the SPV REST API is a lost session, and its body never reaches the page", async () => {
    const cookies = [{ name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0" }];

    for (const url of [
        "https://webserviced.anaf.ro/my.policy",
        "http://webserviced.anaf.ro/SPVWS2/rest/listaMesaje",
        "http://anaf.ro/",
        "https://webserviced.anaf.ro/SPVWS2/other",
    ]) {
        let read = false;
        let cancelled = false;
        const { send } = loadBackground(async () => ({
            status: 200,
            url,
            body: { cancel: async () => (cancelled = true) },
            arrayBuffer: async () => {
                read = true;

                return JSON_BODY.slice().buffer;
            },
        }), { cookies });

        await send({ type: "fetch", url: ANAF_URL });
        assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "session_lost" }, url);
        assert.deepEqual([read, cancelled], [false, true], url);
        assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "cleared" }, url);
    }
});

test("a gateway page under the prefix is a lost session, an HTTP error with any body is the page's business", async () => {
    const text = (body) => new TextEncoder().encode(body);
    const replies = [
        [respond(200, text("<html>Access denied</html>")), { ok: false, error: "session_lost" }],
        [respond(204, new Uint8Array(0)), { ok: false, error: "session_lost" }],
        [respond(503, text("<html>busy</html>")), { ok: true, status: 503, url: ANAF_URL, body: Buffer.from("<html>busy</html>").toString("base64") }],
    ];

    for (const [fetchImpl, expected] of replies) {
        assert.deepEqual(await loadBackground(fetchImpl).send({ type: "fetch", url: ANAF_URL }), expected);
    }
});

test("offline, a failed fetch is a network error rather than a missing certificate", async () => {
    const { send } = loadBackground(throwing("TypeError", "Failed to fetch"), { online: false });

    assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "network", message: "offline" });
});

test("closing the port aborts the fetch, frees its slot and posts nothing", async () => {
    const { connect, send, signals, fetchCalls } = loadBackground((url, options) => {
        if (fetchCalls.length > 4) {
            return answered();
        }

        return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
    });
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const stuck = Array.from({ length: 4 }, () => connect({ type: "fetch", url: ANAF_URL }));
    const queued = send({ type: "fetch", url: ANAF_URL });

    await settle();
    assert.equal(fetchCalls.length, 4);

    stuck[0].close();
    await settle();
    assert.equal(signals[0].aborted, true);
    assert.equal((await queued).ok, true, "the queued fetch got the freed slot");
    assert.equal(await stuck[0].reply, "closed");
});

const DECL_URL = "https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do";
const DECL_HOME = "https://decl.anaf.mfinante.gov.ro/";
const DECL_LANDING = "https://decl.anaf.mfinante.gov.ro/WAS6DUS/";
const POLICY = "https://decl.anaf.mfinante.gov.ro/my.policy";
// Every byte value, so the base64 round trip cannot hide behind ASCII.
const PDF_BYTES = Uint8Array.from({ length: 600 }, (_, i) => (i < 5 ? "%PDF-".charCodeAt(i) : (i * 31 + 7) & 0xff));
const RECEIPT = new TextEncoder().encode('<html>Succes depunere. Indexul este <b style="x">1285389142</b></html>');
const upload = (fields = {}) => ({
    type: "upload",
    url: DECL_URL,
    field: "linkdoc",
    filename: "D700.pdf",
    contentType: "application/pdf",
    body: Buffer.from(PDF_BYTES).toString("base64"),
    ...fields,
});
const stalled = (url, options) =>
    new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
const landedOn = (url, bytes = new Uint8Array(0)) => ({ status: 200, url, arrayBuffer: async () => bytes.slice().buffer });
const GET_HOME = { url: DECL_HOME, options: { credentials: "include", redirect: "follow", cache: "no-store" } };
const POST_POLICY = { url: POLICY, options: { method: "POST", credentials: "include", redirect: "follow", cache: "no-store" } };
const POST_UPLOAD = { url: DECL_URL, options: { method: "POST", credentials: "include", redirect: "follow", cache: "no-store" } };

// Plays ANAF's F5 gateway in front of the portal: without a session the root and an upload end on /my.policy, and the
// form's POST opens one when the browser has a certificate for the host (`certificate`), else fails as Chrome does.
// `upload(context)` overrides what an upload under a live session gets.
function portal({ session = false, certificate = true, upload: onUpload } = {}) {
    const state = { session };
    const impl = (url, options, context) => {
        if (url === DECL_HOME) {
            return landedOn(state.session ? DECL_LANDING : `${POLICY}?x=1`);
        }

        if (url === POLICY) {
            assert.equal(options.body.toString(), "vhost=standard");
            if (!certificate) {
                return throwing("TypeError", "Failed to fetch")(url, options, context);
            }
            state.session = true;

            return landedOn(DECL_LANDING);
        }

        if (!state.session) {
            return landedOn(POLICY);
        }

        return onUpload ? onUpload(url, options, context) : landedOn(DECL_URL, RECEIPT);
    };

    return { impl, state };
}
const receipt = { ok: true, status: 200, url: DECL_URL, body: Buffer.from(RECEIPT).toString("base64") };
const uploadsSent = (fetchCalls) => fetchCalls.filter(({ url }) => url === DECL_URL).length;

test("upload posts the file as multipart/form-data and answers in fetch's reply shape", async () => {
    const { send, fetchCalls, bodies } = loadBackground(portal({ session: true }).impl);

    assert.deepEqual(await send(upload()), receipt);
    assert.deepEqual(fetchCalls, [GET_HOME, POST_UPLOAD]);

    const file = bodies[1].get("linkdoc");
    assert.deepEqual([...bodies[1].keys()], ["linkdoc"]);
    assert.deepEqual([file.name, file.type], ["D700.pdf", "application/pdf"]);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), PDF_BYTES);

    const multipart = await new Response(bodies[1]).text();
    assert.match(multipart, /Content-Disposition: form-data; name="linkdoc"; filename="D700.pdf"\r\nContent-Type: application\/pdf\r\n/);
});

test("upload only goes under the declaration portal's /WAS6DUS/, and fetch never goes there", async () => {
    const { send, fetchCalls } = loadBackground(unreachable);
    // The message is the refused URL's origin and path, so a ContApp config pointing elsewhere shows in its logs.
    const forbidden = [
        [undefined], [42], [""], ["not a url"], [new String(DECL_URL)],
        [ANAF_URL, "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje"],
        [DECL_HOME, DECL_HOME],
        [`${POLICY}?nonce=abc`, POLICY],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS", "https://decl.anaf.mfinante.gov.ro/WAS6DUS"],
        ["https://decl.anaf.mfinante.gov.ro/WAS7DUS/displayFile.do?x=1#y", "https://decl.anaf.mfinante.gov.ro/WAS7DUS/displayFile.do"],
        ["https://decl.anaf.mfinante.gov.ro/was6dus/displayFile.do", "https://decl.anaf.mfinante.gov.ro/was6dus/displayFile.do"],
        ["http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do", "http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do"],
        ["https://decl.anaf.mfinante.gov.ro.evil.example/WAS6DUS/displayFile.do", "https://decl.anaf.mfinante.gov.ro.evil.example/WAS6DUS/displayFile.do"],
        ["https://decl.anaf.mfinante.gov.ro@evil.example/WAS6DUS/displayFile.do", "https://evil.example/WAS6DUS/displayFile.do"],
        ["https://user@decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do", "https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do"],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS/../my.policy", POLICY],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS/%2e%2e/my.policy", POLICY],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS/..;/other/servlet", "https://decl.anaf.mfinante.gov.ro/WAS6DUS/..;/other/servlet"],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS/..%2F..%2Fmy.policy", "https://decl.anaf.mfinante.gov.ro/WAS6DUS/..%2F..%2Fmy.policy"],
        ["https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do;jsessionid=1", "https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do;jsessionid=1"],
        ["https://anaf.mfinante.gov.ro/WAS6DUS/displayFile.do", "https://anaf.mfinante.gov.ro/WAS6DUS/displayFile.do"],
    ];

    for (const [url, message] of forbidden) {
        const expected = { ok: false, error: "forbidden_url", ...(message && { message }) };
        assert.deepEqual(await send(upload({ url })), expected, String(url));
    }
    assert.deepEqual(await send({ type: "fetch", url: DECL_URL }), { ok: false, error: "forbidden_url" });
    assert.equal(fetchCalls.length, 0);
});

test("an upload without a usable file is a network error and sends nothing", async () => {
    const { send, fetchCalls } = loadBackground(unreachable);
    const invalid = [
        [{ body: "@@not base64@@" }, "upload body is not base64"],
        [{ body: undefined }, "upload needs field, filename, contentType and body as strings"],
        [{ body: new Uint8Array(4) }, "upload needs field, filename, contentType and body as strings"],
        [{ field: "" }, "upload needs field, filename, contentType and body as strings"],
        [{ field: undefined }, "upload needs field, filename, contentType and body as strings"],
        [{ filename: null }, "upload needs field, filename, contentType and body as strings"],
        [{ contentType: 7 }, "upload needs field, filename, contentType and body as strings"],
    ];

    for (const [fields, message] of invalid) {
        assert.deepEqual(await send(upload(fields)), { ok: false, error: "network", message }, JSON.stringify(fields));
    }
    assert.equal(fetchCalls.length, 0);
});

test("upload refuses to run without the declaration portal's host permission", async () => {
    const { send, fetchCalls } = loadBackground(unreachable, { granted: false });

    assert.deepEqual(await send(upload()), {
        ok: false,
        error: "permission",
        message: "permission for https://decl.anaf.mfinante.gov.ro/* is not granted",
    });
    assert.equal(fetchCalls.length, 0);
});

test("without a known live session the upload logs in silently first, and sends nothing when that fails", async () => {
    const cases = [
        ["a certificate already chosen", portal({ certificate: true }).impl, receipt, [GET_HOME, POST_POLICY, POST_UPLOAD]],
        ["still logged in", portal({ session: true }).impl, receipt, [GET_HOME, POST_UPLOAD]],
        ["no certificate for the host yet", portal({ certificate: false }).impl, { ok: false, error: "certificate_required" }, [GET_HOME, POST_POLICY]],
        ["the handshake already wants one", throwing("TypeError", "Failed to fetch"), { ok: false, error: "certificate_required" }, [GET_HOME]],
        ["offline", throwing("TypeError", "Failed to fetch"), { ok: false, error: "network", message: "offline" }, [GET_HOME], { online: false }],
        ["F5 shows its form again", () => landedOn(`${POLICY}?nonce=1`), { ok: false, error: "session_lost", message: POLICY }, [GET_HOME, POST_POLICY]],
        ["the root leads elsewhere", () => landedOn("http://decl.anaf.mfinante.gov.ro/?a=b"), { ok: false, error: "session_lost", message: "http://decl.anaf.mfinante.gov.ro/" }, [GET_HOME]],
        ["the portal moved", (url) => landedOn(url === DECL_HOME ? `${POLICY}?x` : `${DECL_HOME}WAS7DUS/`), { ok: false, error: "session_lost", message: `${DECL_HOME}WAS7DUS/` }, [GET_HOME, POST_POLICY]],
        ["the gateway fails", throwing("Error", "boom"), { ok: false, error: "network", message: "boom" }, [GET_HOME]],
    ];

    for (const [name, impl, expected, calls, options] of cases) {
        const { send, fetchCalls, bodies } = loadBackground(impl, options);

        assert.deepEqual(await send(upload()), expected, name);
        assert.deepEqual(fetchCalls, calls, name);
        if (calls.includes(POST_POLICY)) {
            assert.equal(bodies[1].toString(), "vhost=standard", name);
        }
    }

    const timed = loadBackground((url, options) => {
        timed.deadlines.at(-1).callback();
        throw options.signal.reason;
    });
    assert.deepEqual(await timed.send(upload()), { ok: false, error: "timeout" });
    assert.equal(uploadsSent(timed.fetchCalls), 0);
});

test("an upload F5 bounced to its login page is resent exactly once after a silent re-login", async () => {
    const live = portal({ session: true });
    const { send, fetchCalls } = loadBackground(live.impl);
    await send(upload());
    live.state.session = false; // the session expired between two uploads

    fetchCalls.length = 0;
    assert.deepEqual(await send(upload()), receipt);
    assert.deepEqual(fetchCalls, [POST_UPLOAD, GET_HOME, POST_POLICY, POST_UPLOAD]);

    // Bounced again after the re-login: not a third time.
    const again = loadBackground(portal({ session: true, upload: () => landedOn(POLICY) }).impl);
    assert.deepEqual(await again.send(upload()), { ok: false, error: "session_lost", message: POLICY });
    assert.equal(uploadsSent(again.fetchCalls), 1, "the silent login came first, so a bounce is final");

    // The re-login after a bounce cannot find a certificate: the page shows its login prompt.
    const expiring = portal({ session: true, certificate: false });
    const lost = loadBackground(expiring.impl);
    await lost.send(upload());
    expiring.state.session = false;
    lost.fetchCalls.length = 0;
    assert.deepEqual(await lost.send(upload()), { ok: false, error: "certificate_required" });
    assert.deepEqual(lost.fetchCalls, [POST_UPLOAD, GET_HOME, POST_POLICY]);
});

test("an upload that may have reached the portal is never resent", async () => {
    const failures = [
        ["timeout", "deadline", { ok: false, error: "timeout" }],
        ["certificate", throwing("TypeError", "Failed to fetch"), { ok: false, error: "certificate_required" }],
        ["network", throwing("Error", "reset"), { ok: false, error: "network", message: "reset" }],
        ["HTTP 500", () => landedOn(DECL_URL, new TextEncoder().encode("err")), { ok: true, status: 500, url: DECL_URL, body: "ZXJy" }],
        ["landed on the root", () => landedOn(`${DECL_HOME}?q`), { ok: false, error: "session_lost", message: DECL_HOME }],
        ["landed over http", () => landedOn("http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do"), { ok: false, error: "session_lost", message: "http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do" }],
        ["the portal moved", () => landedOn(`${DECL_HOME}WAS7DUS/displayFile.do`), { ok: false, error: "session_lost", message: `${DECL_HOME}WAS7DUS/displayFile.do` }],
    ];

    for (const [name, failure, expected] of failures) {
        let failing = false;
        const loaded = loadBackground(portal({
            session: true,
            upload: (url, options, context) => {
                if (!failing) {
                    return landedOn(DECL_URL, RECEIPT);
                }
                if (failure === "deadline") {
                    loaded.deadlines.at(-1).callback();
                    throw options.signal.reason;
                }
                const response = failure(url, options, context);

                return name === "HTTP 500" ? { ...response, status: 500 } : response;
            },
        }).impl);

        await loaded.send(upload());
        failing = true;
        loaded.fetchCalls.length = 0;
        assert.deepEqual(await loaded.send(upload()), expected, name);
        assert.deepEqual(loaded.fetchCalls, [POST_UPLOAD], name);
    }

    // A page that cancels gets cancelled, and nothing is sent again either.
    const { connect, signals, fetchCalls, state, IDLE } = loadBackground(stalled);
    const pending = connect(upload());
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(state("DECL"), { inFlight: 1, running: 1, waiting: 0 });
    pending.close();
    assert.equal(signals[0].aborted, true);
    assert.equal(await pending.reply, "closed");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetchCalls.length, 1);
    assert.deepEqual(state("DECL"), IDLE, "a cancelled upload is forgotten too");
});

test("login opens the declaration portal's root next to the ContApp tab, and refuses its other pages", async () => {
    const { send, createdTabs } = loadBackground(unreachable);

    for (const url of [DECL_HOME, "https://decl.anaf.mfinante.gov.ro", "HTTPS://DECL.ANAF.MFINANTE.GOV.RO:443/"]) {
        assert.equal((await send({ type: "login", url })).ok, true, url);
    }
    assert.deepEqual(createdTabs.map(({ url }) => url), [DECL_HOME, DECL_HOME, DECL_HOME]);

    // The upload address and the portal's pages are not opened: only the start page leads through F5's form.
    for (const url of [DECL_URL, "https://decl.anaf.mfinante.gov.ro/WAS6DUS/", POLICY, `${DECL_HOME}?x`, "http://decl.anaf.mfinante.gov.ro/", "https://anaf.mfinante.gov.ro/"]) {
        assert.deepEqual(await send({ type: "login", url }), { ok: false, error: "forbidden_url" }, url);
    }

    // The opener's window goes with it: Chrome would otherwise pick the last focused window and refuse the opener.
    const openers = [
        [{ id: 7, windowId: 3 }, { openerTabId: 7, windowId: 3 }],
        [{ id: 7 }, { openerTabId: 7 }],
        [{ windowId: 3 }, {}],
        [undefined, {}],
    ];
    for (const [tab, expected] of openers) {
        const fromTab = { ...CONTAPP, tab };
        await send({ type: "login", url: DECL_HOME }, fromTab);
        await send({ type: "login", url: ANAF_URL }, fromTab);
        assert.deepEqual(createdTabs.slice(-2), [{ url: DECL_HOME, ...expected }, { url: ANAF_URL, ...expected }], JSON.stringify(tab));
    }
});

test("F5's form is submitted once, and only in a portal tab the login opened", async () => {
    const { send, tell } = loadBackground(unreachable);
    const form = { type: "login-form" };

    await send({ type: "login", url: DECL_HOME }); // tab 101
    await send({ type: "login", url: ANAF_URL }); // tab 102, SPV: no form to submit

    const refused = [
        ["a tab the user opened", form, 55, POLICY],
        ["the SPV login tab", form, 102, POLICY],
        ["the SPV login tab on its F5 page", form, 102, "https://webserviced.anaf.ro/my.policy"],
        ["another extension", form, 101, POLICY, "other-extension"],
        ["not F5's form", form, 101, DECL_LANDING],
        ["the portal moved", form, 101, `${DECL_HOME}WAS7DUS/`],
        ["a lookalike host", form, 101, "https://decl.anaf.mfinante.gov.ro.evil.example/my.policy"],
        ["an unknown message", { type: "fetch" }, 101, POLICY],
    ];
    for (const [name, message, tabId, url, id] of refused) {
        assert.deepEqual(tell(message, tabId, url, id), { submit: false }, name);
    }

    assert.deepEqual(tell(form, 101, `${POLICY}?x=1`), { submit: true });
    assert.deepEqual(tell(form, 101, POLICY), { submit: false }, "a cancelled picker lands on the form again: no loop");
});

test("the login tab closes once it reaches the portal, only if it is ours, and the session then counts as alive", async () => {
    const { send, tell, removedTabs } = loadBackground(unreachable);
    const landed = { type: "login-landed" };

    await send({ type: "login", url: DECL_HOME }); // tab 101

    tell(landed, 55, DECL_LANDING);
    tell(landed, 101, POLICY);
    tell(landed, 101, "http://decl.anaf.mfinante.gov.ro/WAS6DUS/");
    tell(landed, 101, `${DECL_HOME}WAS7DUS/`); // the portal moved: not closed, watched until the 5-minute cap
    assert.deepEqual(removedTabs, []);

    tell(landed, 101, `${DECL_LANDING}index.jsp`);
    assert.deepEqual(removedTabs, [101]);

    tell(landed, 101, DECL_LANDING);
    assert.deepEqual(removedTabs, [101], "forgotten once closed");
    assert.deepEqual(tell({ type: "login-form" }, 101, POLICY), { submit: false });
    assert.deepEqual(await send({ type: "login", url: DECL_HOME }), { ok: true, reset: "kept" });
});

test("the SPV login tab closes once it lands on an SPV REST answer, only if it is ours, never on F5's pages", async () => {
    const { send, tell, removedTabs } = loadBackground(respond(200, new TextEncoder().encode("<html>F5</html>")));
    const landed = { type: "login-landed" };

    // The last fetch found no SPV answer, so the session counts as lost.
    await send({ type: "fetch", url: ANAF_URL });
    await send({ type: "login", url: ANAF_URL }); // tab 101
    await send({ type: "login", url: DECL_HOME }); // tab 102

    const notClosed = [
        ["a tab the user opened", 55, ANAF_URL],
        ["another extension", 101, ANAF_URL, "other-extension"],
        ["F5's login form", 101, "https://webserviced.anaf.ro/my.policy"],
        ["F5's virtual desktop", 101, "https://webserviced.anaf.ro/vdesk/hangup.php3"],
        ["F5's public files", 101, "https://webserviced.anaf.ro/public/include/js/session_check.js"],
        ["outside the REST prefix", 101, "https://webserviced.anaf.ro/SPVWS2/other"],
        ["over http", 101, "http://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60"],
        ["the portal's landing, from the SPV tab", 101, DECL_LANDING],
        ["an SPV answer, from the portal's tab", 102, ANAF_URL],
    ];
    for (const [name, tabId, url, id] of notClosed) {
        tell(landed, tabId, url, id);
        assert.deepEqual(removedTabs, [], name);
    }

    tell(landed, 101, `${ANAF_URL}&x=1`);
    assert.deepEqual(removedTabs, [101]);
    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "kept" }, "the SPV session now counts as alive");
});

test("a login tab is watched, with the worker kept alive, until it closes or five minutes pass", async () => {
    const { send, tell, closeTab, timers, deadlines, removedTabs } = loadBackground(unreachable);
    const form = { type: "login-form" };

    await send({ type: "login", url: DECL_HOME }); // tab 101
    await send({ type: "login", url: DECL_HOME }); // tab 102
    await send({ type: "login", url: ANAF_URL }); // tab 103
    assert.deepEqual(timers.map(({ ms, cleared }) => [ms, cleared]), [[25_000, false], [25_000, false], [25_000, false]]);

    closeTab(101);
    assert.deepEqual(tell(form, 101, POLICY), { submit: false });

    deadlines.filter(({ ms }) => ms === 300_000).slice(-2).forEach(({ callback }) => callback());
    assert.deepEqual(tell(form, 102, POLICY), { submit: false });
    tell({ type: "login-landed" }, 103, ANAF_URL);
    assert.deepEqual(removedTabs, [], "after five minutes the SPV tab is no longer ours to close");
    assert.deepEqual(timers.map(({ cleared }) => cleared), [true, true, true]);
    assert.deepEqual(deadlines.filter(({ ms }) => ms === 300_000).map(({ cleared }) => cleared), [true, true, true], "no expiry stays armed once a tab is forgotten");
});

test("each site keeps its own session: a login clears only the cookies and requests of its own host", async () => {
    const cookies = [
        { name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0" },
        { name: "TS01", domain: ".anaf.ro", hostOnly: false, path: "/", storeId: "0" },
        { name: "MRHSession", domain: "decl.anaf.mfinante.gov.ro", hostOnly: true, path: "/", storeId: "0", secure: true },
        { name: "F5_ST", domain: ".decl.anaf.mfinante.gov.ro", hostOnly: false, path: "/WAS6DUS", storeId: "0" },
    ];
    const { impl } = portal({ certificate: false });
    const { send, removedCookies, cookieQueries } = loadBackground((url, ...rest) => (url === ANAF_URL ? answered() : impl(url, ...rest)), { cookies });

    assert.equal((await send({ type: "fetch", url: ANAF_URL })).ok, true);
    assert.deepEqual(await send(upload()), { ok: false, error: "certificate_required" });

    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "kept" }, "SPV is still alive");
    assert.deepEqual(await send({ type: "login", url: DECL_HOME }), { ok: true, reset: "cleared" });
    assert.deepEqual(cookieQueries, [{ domain: "decl.anaf.mfinante.gov.ro", partitionKey: {} }]);
    assert.deepEqual(removedCookies, [
        { url: "https://decl.anaf.mfinante.gov.ro/", name: "MRHSession", storeId: "0" },
        { url: "https://decl.anaf.mfinante.gov.ro/WAS6DUS", name: "F5_ST", storeId: "0" },
    ]);

    // A successful upload keeps the portal's session at the next login.
    const live = loadBackground(portal({ session: true }).impl, { cookies });
    await live.send(upload());
    assert.deepEqual(await live.send({ type: "login", url: DECL_HOME }), { ok: true, reset: "kept" });
});

test("a login on the portal cancels the uploads stuck on it but not the SPV fetches, and the slots are per host", async () => {
    const { send, fetchCalls } = loadBackground(stalled);
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const fetches = Array.from({ length: 4 }, () => send({ type: "fetch", url: ANAF_URL }));
    const uploads = Array.from({ length: 5 }, () => send(upload()));

    await settle();
    assert.deepEqual(fetchCalls.map(({ url }) => url), [...Array(4).fill(ANAF_URL), ...Array(4).fill(DECL_HOME)]);

    assert.deepEqual(await send({ type: "login", url: DECL_HOME }), { ok: true, reset: "cleared" });
    for (const reply of await Promise.all(uploads)) {
        assert.deepEqual(reply, { ok: false, error: "cancelled" });
    }
    assert.equal(uploadsSent(fetchCalls), 0);

    let fetchesSettled = false;
    Promise.all(fetches).then(() => (fetchesSettled = true));
    await settle();
    assert.equal(fetchesSettled, false, "the SPV fetches are still running");

    await send({ type: "login", url: ANAF_URL });
    assert.deepEqual((await Promise.all(fetches)).map(({ error }) => error), Array(4).fill("cancelled"));
});
