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
// The cookies API only sees what `hosts`, the manifest's host permissions by default, allows.
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
    const events = [];
    const timers = [];
    const debug = [];
    const warnings = [];
    let keepAlives = 0;
    let onConnect;

    const context = vm.createContext({
        URL,
        atob,
        btoa,
        AbortController,
        TextDecoder,
        FormData,
        Blob,
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
        chrome: {
            runtime: {
                id: EXTENSION_ID,
                getManifest: () => ({ version: "9.8.7", content_scripts: manifest.content_scripts }),
                getPlatformInfo: async () => keepAlives++,
                onConnect: { addListener: (callback) => (onConnect = callback) },
            },
            permissions: { contains: async () => granted },
            tabs: {
                create: createTab ?? (async (tab) => {
                    events.push("tab");
                    createdTabs.push(structuredClone(tab));
                }),
            },
            cookies: {
                getAll: async (query) => {
                    cookieQueries.push(structuredClone(query));

                    const all = getAllCookies ? await getAllCookies(query) : structuredClone(cookies);

                    return all.filter((cookie) => permitted(hosts, cookieUrl(cookie)));
                },
                remove: async (details) => {
                    if (!permitted(hosts, details.url)) {
                        throw new Error(`No host permissions for cookies at url: "${details.url}".`);
                    }

                    events.push("cookie");
                    removedCookies.push(structuredClone(details));
                },
            },
        },
        ...(firefox && { browser: {} }),
    });

    vm.runInContext(source, context);

    // Plays the content script: opens a port as `sender`, posts `message` and resolves with the first reply, cloned
    // out of the vm realm so deepEqual compares plain objects. `close()` disconnects the port the way a cancel does.
    const connect = (message, sender = CONTAPP) => {
        const listeners = { message: [], disconnect: [] };
        let disconnected = false;
        let close;
        const reply = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("the worker never answered")), 1000).unref();
            const port = {
                name: "contapp-spv",
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

        return { reply, close, disconnected: () => disconnected };
    };
    const send = (message, sender) => connect(message, sender).reply;

    return {
        send, connect, fetchCalls, bodies, signals, deadlines, cookieQueries, createdTabs, removedCookies, events, timers,
        keepAlives: () => keepAlives, debug, warnings,
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
    const context = vm.createContext({ chrome: { runtime: { onConnect: { addListener() {} } } }, URL });
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
    ];

    for (const [url, href] of normalised) {
        assert.equal((await send({ type: "fetch", url })).ok, true, url);
        assert.equal((await send({ type: "login", url })).ok, true, url);
        assert.equal(fetchCalls.at(-1).url, href);
        assert.deepEqual(createdTabs.at(-1), { url: href });
    }
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
    const { send, deadlines } = loadBackground((url, options) => {
        deadlines.at(-1).callback();
        throw options.signal.reason;
    });

    assert.deepEqual(await send({ type: "fetch", url: ANAF_URL }), { ok: false, error: "timeout" });
    assert.deepEqual(deadlines.map(({ ms }) => ms), [90_000]);

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
    const { send, fetchCalls } = loadBackground(() => new Promise((resolve) => pending.push(resolve)));
    const replies = Array.from({ length: 6 }, () => send({ type: "fetch", url: ANAF_URL }));
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    await settle();
    assert.equal(fetchCalls.length, 4);

    pending.shift()(answered());
    await settle();
    assert.equal(fetchCalls.length, 5, "a finished fetch hands its slot to the next one");

    while (pending.length) {
        pending.shift()(answered());
        await settle();
    }

    assert.equal(fetchCalls.length, 6);

    assert.deepEqual((await Promise.all(replies)).map(({ ok }) => ok), [true, true, true, true, true, true]);
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

test("upload posts the file as multipart/form-data and answers in fetch's reply shape", async () => {
    const { send, fetchCalls, bodies } = loadBackground(respond(200, RECEIPT, DECL_URL));

    assert.deepEqual(await send(upload()), { ok: true, status: 200, url: DECL_URL, body: Buffer.from(RECEIPT).toString("base64") });
    assert.deepEqual(fetchCalls, [{
        url: DECL_URL,
        options: { method: "POST", credentials: "include", redirect: "follow", cache: "no-store" },
    }]);

    const file = bodies[0].get("linkdoc");
    assert.deepEqual([...bodies[0].keys()], ["linkdoc"]);
    assert.deepEqual([file.name, file.type], ["D700.pdf", "application/pdf"]);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), PDF_BYTES);

    const multipart = await new Response(bodies[0]).text();
    assert.match(multipart, /Content-Disposition: form-data; name="linkdoc"; filename="D700.pdf"\r\nContent-Type: application\/pdf\r\n/);
});

test("upload only goes under the declaration portal's /WAS6DUS/, and fetch never goes there", async () => {
    const { send, fetchCalls } = loadBackground(unreachable);
    const forbidden = [
        undefined, 42, "", "not a url",
        ANAF_URL,
        DECL_HOME,
        "https://decl.anaf.mfinante.gov.ro/my.policy",
        "https://decl.anaf.mfinante.gov.ro/WAS6DUS",
        "https://decl.anaf.mfinante.gov.ro/was6dus/displayFile.do",
        "http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do",
        "https://decl.anaf.mfinante.gov.ro.evil.example/WAS6DUS/displayFile.do",
        "https://decl.anaf.mfinante.gov.ro@evil.example/WAS6DUS/displayFile.do",
        "https://user@decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do",
        "https://decl.anaf.mfinante.gov.ro/WAS6DUS/../my.policy",
        "https://decl.anaf.mfinante.gov.ro/WAS6DUS/%2e%2e/my.policy",
        "https://anaf.mfinante.gov.ro/WAS6DUS/displayFile.do",
    ];

    for (const url of forbidden) {
        assert.deepEqual(await send(upload({ url })), { ok: false, error: "forbidden_url" }, String(url));
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

test("an upload that lands on F5's login page is a lost session, whose body never reaches the page", async () => {
    for (const url of [`${DECL_HOME}my.policy`, DECL_HOME, "http://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do"]) {
        let read = false;
        const { send } = loadBackground(async () => ({
            status: 200,
            url,
            body: { cancel: async () => {} },
            arrayBuffer: async () => (read = true),
        }));

        assert.deepEqual(await send(upload()), { ok: false, error: "session_lost" }, url);
        assert.equal(read, false, url);
    }
});

test("upload failures map like fetch's: certificate_required, timeout", async () => {
    assert.deepEqual(await loadBackground(throwing("TypeError", "Failed to fetch")).send(upload()), { ok: false, error: "certificate_required" });

    const timed = loadBackground((url, options) => {
        timed.deadlines.at(-1).callback();
        throw options.signal.reason;
    });
    assert.deepEqual(await timed.send(upload()), { ok: false, error: "timeout" });
});

test("closing the port aborts the upload and posts nothing", async () => {
    const { connect, signals } = loadBackground(stalled);
    const pending = connect(upload());

    await new Promise((resolve) => setImmediate(resolve));
    pending.close();

    assert.equal(signals[0].aborted, true);
    assert.equal(await pending.reply, "closed");
});

test("login opens the declaration portal's root, and refuses its other pages", async () => {
    const { send, createdTabs } = loadBackground(unreachable);

    for (const url of [DECL_HOME, "https://decl.anaf.mfinante.gov.ro", "HTTPS://DECL.ANAF.MFINANTE.GOV.RO:443/", DECL_URL]) {
        assert.equal((await send({ type: "login", url })).ok, true, url);
    }
    assert.deepEqual(createdTabs.map(({ url }) => url), [DECL_HOME, DECL_HOME, DECL_HOME, DECL_URL]);

    for (const url of [`${DECL_HOME}my.policy`, `${DECL_HOME}?x`, "http://decl.anaf.mfinante.gov.ro/", "https://anaf.mfinante.gov.ro/"]) {
        assert.deepEqual(await send({ type: "login", url }), { ok: false, error: "forbidden_url" }, url);
    }
});

test("each site keeps its own session: a login clears only the cookies and requests of its own host", async () => {
    const cookies = [
        { name: "MRHSession", domain: "webserviced.anaf.ro", hostOnly: true, path: "/", storeId: "0" },
        { name: "TS01", domain: ".anaf.ro", hostOnly: false, path: "/", storeId: "0" },
        { name: "MRHSession", domain: "decl.anaf.mfinante.gov.ro", hostOnly: true, path: "/", storeId: "0", secure: true },
        { name: "F5_ST", domain: ".decl.anaf.mfinante.gov.ro", hostOnly: false, path: "/WAS6DUS", storeId: "0" },
    ];
    const replies = [answered(), { status: 200, url: `${DECL_HOME}my.policy`, arrayBuffer: async () => new ArrayBuffer(0) }];
    const { send, removedCookies, cookieQueries } = loadBackground(() => replies.shift(), { cookies });

    assert.equal((await send({ type: "fetch", url: ANAF_URL })).ok, true);
    assert.deepEqual(await send(upload()), { ok: false, error: "session_lost" });

    assert.deepEqual(await send({ type: "login", url: ANAF_URL }), { ok: true, reset: "kept" }, "SPV is still alive");
    assert.deepEqual(await send({ type: "login", url: DECL_HOME }), { ok: true, reset: "cleared" });
    assert.deepEqual(cookieQueries, [{ domain: "decl.anaf.mfinante.gov.ro", partitionKey: {} }]);
    assert.deepEqual(removedCookies, [
        { url: "https://decl.anaf.mfinante.gov.ro/", name: "MRHSession", storeId: "0" },
        { url: "https://decl.anaf.mfinante.gov.ro/WAS6DUS", name: "F5_ST", storeId: "0" },
    ]);

    // A successful upload keeps the portal's session at the next login.
    const live = loadBackground(respond(200, RECEIPT, DECL_URL), { cookies });
    await live.send(upload());
    assert.deepEqual(await live.send({ type: "login", url: DECL_HOME }), { ok: true, reset: "kept" });
});

test("a login on the portal cancels the uploads stuck on it but not the SPV fetches, and the slots are per host", async () => {
    const { send, fetchCalls } = loadBackground(stalled);
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const fetches = Array.from({ length: 4 }, () => send({ type: "fetch", url: ANAF_URL }));
    const uploads = Array.from({ length: 5 }, () => send(upload()));

    await settle();
    assert.deepEqual(fetchCalls.map(({ url }) => url), [...Array(4).fill(ANAF_URL), ...Array(4).fill(DECL_URL)]);

    assert.deepEqual(await send({ type: "login", url: DECL_HOME }), { ok: true, reset: "cleared" });
    for (const reply of await Promise.all(uploads)) {
        assert.deepEqual(reply, { ok: false, error: "cancelled" });
    }

    let fetchesSettled = false;
    Promise.all(fetches).then(() => (fetchesSettled = true));
    await settle();
    assert.equal(fetchesSettled, false, "the SPV fetches are still running");

    await send({ type: "login", url: ANAF_URL });
    assert.deepEqual((await Promise.all(fetches)).map(({ error }) => error), Array(4).fill("cancelled"));
});
