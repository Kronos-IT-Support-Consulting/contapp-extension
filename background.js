// Each ANAF host sits behind its own F5 gateway, so each has its own session, cookie reset and connection slots.
// `api` is where requests may go and where an answer must land to count as a live session.
const SPV = site({
    host: "webserviced.anaf.ro",
    api: "https://webserviced.anaf.ro/SPVWS2/rest/",
    cookieDomain: "anaf.ro",
    // Chrome only lists or removes a cookie when the extension has access to the cookie's domain, over http:// for
    // one without the Secure flag; a cookie set on .anaf.ro needs access to anaf.ro itself.
    cookieOrigins: ["*://webserviced.anaf.ro/*", "*://anaf.ro/*"],
    // The SPV REST API answers JSON or a PDF; an HTML page under the prefix is the gateway's.
    isAnswer: isRestAnswer,
});
// The declaration portal: uploads go to /WAS6DUS/, the login starts at the root, which F5 sends through /my.policy.
const DECL = site({
    host: "decl.anaf.mfinante.gov.ro",
    api: "https://decl.anaf.mfinante.gov.ro/WAS6DUS/",
    home: "https://decl.anaf.mfinante.gov.ro/",
    cookieDomain: "decl.anaf.mfinante.gov.ro",
    cookieOrigins: ["*://decl.anaf.mfinante.gov.ro/*"],
    // The portal answers an upload with its own HTML page; only the final URL tells it from the gateway's.
    isAnswer: () => true,
});
const SITES = [SPV, DECL];
const CHUNK_SIZE = 0x8000;
// Chrome refuses runtime messages over 64 MiB; base64 adds a third, the reply envelope a few bytes.
const MAX_BODY_BYTES = 47 * 1024 * 1024;
// Chrome stops an idle MV3 service worker after 30 s. A pending fetch is not activity, an API call is.
const KEEP_ALIVE_MS = 25_000;
// A TLS handshake waiting on a certificate picker or PIN prompt that never shows hangs forever and holds one of
// Chrome's six connections to the host; after a few retries even the login tab queues behind them. Once the
// response headers arrive the body gets a longer deadline of its own, so a slow download of a large but healthy
// response is not cut off while a body that stalls for good still frees its slot.
const FETCH_TIMEOUT_MS = 90_000;
const BODY_TIMEOUT_MS = 5 * 60_000;
const TIMED_OUT = "timeout";
const CANCELLED = "cancelled";
const SESSION_LOST = "session_lost";
const PORT_NAME = "contapp-spv";
// Chrome opens at most six connections per host. Keeping two free lets the login tab through while
// background fetches are stuck on a handshake; the rest wait for a slot.
const MAX_CONCURRENT_FETCHES = 4;

// `running` counts the slots in use, `waiting` queues the rest; `inFlight` holds every pending request, holding a
// slot or waiting for one, so a login can cancel them. `sessionAlive` says whether the last completed request got
// an answer from the site, unknown after the worker restarts, which counts as lost. `sessionReset` settles once the
// login's cookie reset is done; a request started earlier would go out with the dead session.
function site(config) {
    return {
        ...config,
        permission: { origins: [`https://${config.host}/*`] },
        inFlight: new Set(),
        waiting: [],
        running: 0,
        sessionAlive: false,
        sessionReset: Promise.resolve(),
    };
}

// The normalised href when the URL is under `prefix`, otherwise null. Normalising first means the check runs on
// what fetch would actually request: "rest/../admin" resolves out of the prefix.
function allowedUrl(url, prefix) {
    if (typeof url !== "string") {
        return null;
    }

    let href;

    try {
        ({ href } = new URL(url));
    } catch {
        return null; // not a URL at all
    }

    return href.startsWith(prefix) ? href : null;
}

// The site and normalised href a login may open: anywhere under a site's API, or the declaration portal's root.
function loginTarget(url) {
    const href = allowedUrl(url, "https://");
    const target = href && SITES.find(({ api, home }) => href.startsWith(api) || href === home);

    return target ? { target, href } : null;
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + CHUNK_SIZE));
    }

    return btoa(binary);
}

function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function networkError(reason) {
    return { ok: false, error: "network", message: String(reason?.message ?? reason) };
}

// An HTML page served under the SPV prefix is the F5 gateway's, not a live session. TextDecoder drops a UTF-8 byte
// order mark; the prefix is long enough for leading whitespace.
function isRestAnswer(buffer) {
    const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024))).trimStart();

    return head.startsWith("{") || head.startsWith("[") || head.startsWith("%PDF");
}

// Only the ContApp hosts the content script runs on may drive the worker. The patterns come from the manifest, so
// the release build, which drops the development hosts, accepts exactly what it injects into.
function fromContApp(sender) {
    let url;

    try {
        url = new URL(sender.url);
    } catch {
        return false;
    }

    if (sender.id !== chrome.runtime.id || url.protocol !== "https:") {
        return false;
    }

    const { hostname } = url;

    return chrome.runtime.getManifest().content_scripts.flatMap(({ matches }) => matches).some((pattern) => {
        const host = pattern.match(/^https:\/\/([^/]+)\/\*$/)?.[1];

        return host?.startsWith("*.") ? hostname.endsWith(host.slice(1)) : hostname === host;
    });
}

function keepAlive() {
    const timer = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), KEEP_ALIVE_MS);

    return () => clearInterval(timer);
}

// A freed slot passes straight to the next waiter without dropping `running`, so a newcomer cannot take it too.
// Rejects with the abort reason when the fetch is cancelled first, leaving the slot to the others.
function acquireSlot(target, signal) {
    const { waiting } = target;

    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }

    if (target.running < MAX_CONCURRENT_FETCHES) {
        target.running++;

        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const take = () => {
            signal.removeEventListener("abort", cancel);
            resolve();
        };
        const cancel = () => {
            waiting.splice(waiting.indexOf(take), 1);
            reject(signal.reason);
        };

        waiting.push(take);
        signal.addEventListener("abort", cancel, { once: true });
    });
}

function releaseSlot(target) {
    const next = target.waiting.shift();

    if (next) {
        next();
    } else {
        target.running--;
    }
}

async function fetchBody(target, url, init, signal, onHeaders) {
    let response;

    try {
        response = await fetch(url, { ...init, credentials: "include", redirect: "follow", cache: "no-store", signal });
        onHeaders();
    } catch (error) {
        // An abort is a DOMException, so it lands here; proxyFetch tells the page why from signal.reason.
        // Chrome reports a missing client certificate (ERR_SSL_CLIENT_AUTH_CERT_NEEDED) as a bare TypeError, and so
        // every other network failure: only being offline can be told apart.
        if (error instanceof TypeError) {
            return navigator.onLine === false ? networkError("offline") : { ok: false, error: "certificate_required" };
        }

        console.debug("ContApp SPV fetch failed", error);

        return networkError(error);
    }

    // A lost session redirects to F5's login pages. Whatever ends up outside the site's API, plain http:// included,
    // is not read, let alone handed to the page.
    if (!allowedUrl(response.url, target.api)) {
        response.body?.cancel().catch(() => {});

        return { ok: false, error: SESSION_LOST };
    }

    try {
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength > MAX_BODY_BYTES) {
            return networkError(`response of ${buffer.byteLength} bytes is too large to pass to the page`);
        }

        // The gateway can also answer under the prefix, with its own HTML page.
        if (response.status < 400 && !target.isAnswer(buffer)) {
            return { ok: false, error: SESSION_LOST };
        }

        return { ok: true, status: response.status, url: response.url, body: toBase64(buffer) };
    } catch (error) {
        console.debug("ContApp SPV body read failed", error);

        return networkError(error);
    }
}

// `controller` is the request's own: the page aborts it by closing the port, a login by cancelling every request
// to the same site. `init` adds the method and body of an upload.
async function proxyFetch(target, url, controller, init = {}) {
    // MV3 host permissions are optional in Firefox, and Chrome withholds them under "on click" site access.
    // Without the grant, fetch fails with the same TypeError as a missing certificate.
    if (!(await chrome.permissions.contains(target.permission))) {
        return { ok: false, error: "permission", message: `permission for ${target.permission.origins[0]} is not granted` };
    }

    const stopKeepAlive = keepAlive();
    let deadline;
    let holdsSlot = false;

    target.inFlight.add(controller);

    try {
        await target.sessionReset;

        try {
            await acquireSlot(target, controller.signal);
            holdsSlot = true;
        } catch {
            return { ok: false, error: CANCELLED }; // cancelled while it waited for a slot
        }

        const abortAfter = (ms) => setTimeout(() => controller.abort(TIMED_OUT), ms);
        deadline = abortAfter(FETCH_TIMEOUT_MS);

        const reply = await fetchBody(target, url, init, controller.signal, () => {
            clearTimeout(deadline);
            deadline = abortAfter(BODY_TIMEOUT_MS);
        });

        if (controller.signal.aborted && !reply.ok) {
            return { ok: false, error: controller.signal.reason === TIMED_OUT ? TIMED_OUT : CANCELLED };
        }

        // fetchBody only answers ok for an answer under the site's API.
        target.sessionAlive = reply.ok && reply.status < 400;

        return reply;
    } finally {
        clearTimeout(deadline);
        target.inFlight.delete(controller);
        if (holdsSlot) {
            releaseSlot(target);
        }
        stopKeepAlive();
    }
}

// A multipart/form-data body with the one file field the declaration portal reads. The bytes arrive as base64,
// since they cross window.postMessage and a runtime port as a string.
function multipart({ field, filename, contentType, body }) {
    if (![field, filename, contentType, body].every((value) => typeof value === "string") || !field) {
        throw new Error("upload needs field, filename, contentType and body as strings");
    }

    let bytes;

    try {
        bytes = fromBase64(body);
    } catch {
        throw new Error("upload body is not base64");
    }

    if (bytes.byteLength > MAX_BODY_BYTES) {
        throw new Error(`upload of ${bytes.byteLength} bytes is too large`);
    }

    const form = new FormData();
    form.append(field, new Blob([bytes], { type: contentType }), filename);

    return form;
}

async function proxyUpload(url, message, controller) {
    let body;

    try {
        body = multipart(message);
    } catch (error) {
        return networkError(error);
    }

    return proxyFetch(DECL, url, controller, { method: "POST", body });
}

// Firefox throws on cookie queries without firstPartyDomain while first-party isolation is on; null means all.
function cookieQuery(target) {
    const query = { domain: target.cookieDomain, partitionKey: {} };

    return typeof browser === "undefined" ? query : { ...query, firstPartyDomain: null };
}

// The browser sends the host its own cookies and those set on a parent domain such as .anaf.ro.
function reachesHost({ host }, { domain, hostOnly }) {
    const bare = domain.replace(/^\./, "");

    return hostOnly ? bare === host : host === bare || host.endsWith(`.${bare}`);
}

// After a failed certificate or PIN check ANAF's F5 gateway keeps answering the dead session's cookie with its
// error page, so the login tab starts from no cookie at all. The values are only passed back to remove.
async function forgetSession(target) {
    const permission = { origins: target.cookieOrigins };

    if (!(await chrome.permissions.contains(permission))) {
        throw new Error(`permission for ${permission.origins.join(" and ")} is not granted`);
    }

    const cookies = (await chrome.cookies.getAll(cookieQuery(target))).filter((cookie) => reachesHost(target, cookie));

    await Promise.all(cookies.map(({ name, domain, path, storeId, partitionKey, firstPartyDomain }) =>
        chrome.cookies.remove({
            url: `https://${domain.replace(/^\./, "")}${path}`,
            name,
            storeId,
            ...(partitionKey && { partitionKey }),
            ...(firstPartyDomain !== undefined && { firstPartyDomain }),
        })));
}

// A live session is kept: another ContApp tab may be using it. A lost one is cleared, and the requests to the same
// site still stuck on it or queued behind them are cancelled so they stop holding connections the login tab needs.
// Requests that arrive during the reset wait for it.
async function resetLostSession(target) {
    if (target.sessionAlive) {
        return { reset: "kept" };
    }

    for (const controller of target.inFlight) {
        controller.abort(CANCELLED);
    }

    const reset = forgetSession(target);
    target.sessionReset = reset.catch(() => {});

    try {
        await reset;

        return { reset: "cleared" };
    } catch (error) {
        console.warn("ContApp SPV could not clear the ANAF session", error);

        return { reset: "failed", message: String(error?.message ?? error) };
    }
}

async function openLogin({ target, href }) {
    const outcome = await resetLostSession(target);
    await chrome.tabs.create({ url: href });

    return { ok: true, ...outcome };
}

async function handle(message, controller) {
    const forbidden = { ok: false, error: "forbidden_url" };

    switch (message?.type) {
        case "ping":
            return { ok: true, version: chrome.runtime.getManifest().version };
        case "fetch": {
            const url = allowedUrl(message.url, SPV.api);

            return url ? proxyFetch(SPV, url, controller) : forbidden;
        }
        case "upload": {
            const url = allowedUrl(message.url, DECL.api);

            return url ? proxyUpload(url, message, controller) : forbidden;
        }
        case "login": {
            const login = loginTarget(message.url);

            return login ? openLogin(login) : forbidden;
        }
        default:
            return { ok: false, error: "unknown_type" };
    }
}

// One port per request: the content script closes it when the page cancels the request or goes away, which aborts
// the fetch so it stops holding a slot and keeping the worker awake.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    if (!fromContApp(port.sender)) {
        port.postMessage({ ok: false, error: "forbidden_origin" });
        port.disconnect();

        return;
    }

    const controller = new AbortController();
    let closed = false;
    const answer = (reply) => {
        if (!closed) {
            port.postMessage(reply);
        }
    };

    port.onDisconnect.addListener(() => {
        closed = true;
        controller.abort(CANCELLED);
    });
    port.onMessage.addListener((message) => {
        handle(message, controller).then(answer, (error) => {
            console.debug("ContApp SPV handler failed", error);
            answer(networkError(error));
        });
    });
});
