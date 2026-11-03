const ANAF_HOST = "webserviced.anaf.ro";
const ANAF_DOMAIN = "anaf.ro";
const ALLOWED_PREFIX = `https://${ANAF_HOST}/SPVWS2/rest/`;
const HOST_PERMISSION = { origins: [`https://${ANAF_HOST}/*`] };
// Chrome only lists or removes a cookie when the extension has access to the cookie's domain, over http:// for one
// without the Secure flag; a cookie set on .anaf.ro needs access to anaf.ro itself.
const COOKIE_PERMISSION = { origins: [`*://${ANAF_HOST}/*`, `*://${ANAF_DOMAIN}/*`] };
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
// Safari runs the requests in an SPV tab (see fetchInAnafTab) and opens one in the background when none is open. The
// fragment marks the tabs the worker opened itself and never reaches ANAF; zile=1 keeps the page the tab loads small.
const OWN_TAB_MARK = "#contapp-spv";
const OWN_TAB_URL = `${ALLOWED_PREFIX}listaMesaje?zile=1${OWN_TAB_MARK}`;
// A tab still loading after this is most likely waiting on a certificate prompt nobody sees: the page has to log in.
const TAB_LOAD_TIMEOUT_MS = 30_000;
// The worker's own tab closes once no request has used it for this long. An alarm, unlike a timer, also fires after
// Safari has suspended the worker.
const CLOSE_TAB_ALARM = "close-anaf-tab";
const CLOSE_TAB_AFTER_MINUTES = 1;

// The normalised href when the URL is under the SPV REST API, otherwise null. Normalising first means
// the check runs on what fetch would actually request: "rest/../admin" resolves out of the prefix.
function allowedUrl(url) {
    if (typeof url !== "string") {
        return null;
    }

    let href;

    try {
        ({ href } = new URL(url));
    } catch {
        return null; // not a URL at all
    }

    return href.startsWith(ALLOWED_PREFIX) ? href : null;
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

    return bytes.buffer;
}

// chrome-extension:, moz-extension: or safari-web-extension:. Safari defines `browser` like Firefox does, so that
// global cannot tell them apart.
function extensionScheme() {
    return new URL(chrome.runtime.getURL("")).protocol;
}

function networkError(reason) {
    return { ok: false, error: "network", message: String(reason?.message ?? reason) };
}

// The SPV REST API answers JSON or a PDF. An HTML page served under the prefix is the F5 gateway's, not a live
// session. TextDecoder drops a UTF-8 byte order mark; the prefix is long enough for leading whitespace.
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

// Every pending fetch, holding a slot or waiting for one, so a login can cancel them; `running` counts the slots
// in use, `waiting` queues the rest.
const inFlight = new Set();
const waiting = [];
let running = 0;
// Whether the last completed fetch got an SPV answer; unknown after the worker restarts, which counts as lost.
let sessionAlive = false;
// Settles once the login's cookie reset is done; a fetch started earlier would go out with the dead session.
let sessionReset = Promise.resolve();

// A freed slot passes straight to the next waiter without dropping `running`, so a newcomer cannot take it too.
// Rejects with the abort reason when the fetch is cancelled first, leaving the slot to the others.
function acquireSlot(signal) {
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }

    if (running < MAX_CONCURRENT_FETCHES) {
        running++;

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

function releaseSlot() {
    const next = waiting.shift();

    if (next) {
        next();
    } else {
        running--;
    }
}

async function fetchBody(url, signal, onHeaders) {
    let response;

    try {
        response = await fetch(url, { credentials: "include", redirect: "follow", cache: "no-store", signal });
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

    // A lost session redirects to F5's login pages. Whatever ends up outside the SPV REST API, plain http:// included,
    // is not read, let alone handed to the page.
    if (!allowedUrl(response.url)) {
        console.debug("ContApp SPV session lost: redirected to", response.status, response.url);
        response.body?.cancel().catch(() => {});

        return { ok: false, error: SESSION_LOST };
    }

    let buffer;

    try {
        buffer = await response.arrayBuffer();
    } catch (error) {
        console.debug("ContApp SPV body read failed", error);

        return networkError(error);
    }

    return restReply(response.status, response.url, buffer);
}

// The reply for an answer from under the SPV prefix. The gateway can also answer there, with its own HTML page.
function restReply(status, url, buffer) {
    if (buffer.byteLength > MAX_BODY_BYTES) {
        return networkError(`response of ${buffer.byteLength} bytes is too large to pass to the page`);
    }

    if (status < 400 && !isRestAnswer(buffer)) {
        console.debug("ContApp SPV session lost: not a REST answer", status, url);

        return { ok: false, error: SESSION_LOST };
    }

    return { ok: true, status, url, body: toBase64(buffer) };
}

// Runs in the ANAF tab as the page's own script, so it has nothing but its argument: no closure, no worker helpers.
async function fetchFromPage(url) {
    try {
        const response = await fetch(url, { credentials: "include", redirect: "follow", cache: "no-store" });
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";

        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
        }

        return { status: response.status, url: response.url, body: btoa(binary) };
    } catch (error) {
        return { error: String(error?.message ?? error) };
    }
}

// Resolves with the tab once it has loaded, or null if it does not within `ms` or goes away.
function loadedTab(tabId, ms) {
    return new Promise((resolve) => {
        const done = (tab) => {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve(tab);
        };
        const onUpdated = (id, change, tab) => id === tabId && tab.status === "complete" && done(tab);
        const timer = setTimeout(() => done(null), ms);

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.get(tabId).then((tab) => tab.status === "complete" && done(tab), () => done(null));
    });
}

// Opens the worker's own SPV tab in the background. A live session loads the JSON without asking for anything; a
// lost one ends on F5's pages (session_lost) or waits on a certificate prompt (certificate_required), and the tab is
// closed again so the login starts from its own.
async function openOwnTab() {
    const { id } = await chrome.tabs.create({ url: OWN_TAB_URL, active: false });
    const tab = await loadedTab(id, TAB_LOAD_TIMEOUT_MS);

    if (tab && allowedUrl(tab.url)) {
        return { tab };
    }

    console.debug("ContApp SPV could not open an SPV tab", tab?.url ?? "the page did not load");
    chrome.tabs.remove(id).catch(() => {});

    return { error: tab ? SESSION_LOST : "certificate_required" };
}

// Requests that find no SPV tab at the same time share the one being opened.
let openingTab = null;

// The most recently used SPV tab, the user's or the worker's own, or a new one of the worker's.
async function anafTab() {
    const tabs = await chrome.tabs.query({ url: `${ALLOWED_PREFIX}*` });
    const tab = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

    if (tab) {
        return { tab };
    }

    openingTab ??= openOwnTab().finally(() => (openingTab = null));

    return openingTab;
}

// Only the tabs the worker opened; the user's own SPV tabs stay.
async function closeOwnTabs() {
    const tabs = await chrome.tabs.query({ url: `${ALLOWED_PREFIX}*` });
    const own = tabs.filter((tab) => tab.url?.endsWith(OWN_TAB_MARK)).map((tab) => tab.id);

    if (own.length > 0) {
        await chrome.tabs.remove(own);
    }
}

// Every request restarts the countdown; one still running when it ends starts it over.
chrome.alarms?.onAlarm.addListener(({ name }) => {
    if (name !== CLOSE_TAB_ALARM) {
        return;
    }

    if (inFlight.size > 0) {
        console.debug("ContApp SPV keeps its SPV tab open for", inFlight.size, "requests still running");
        chrome.alarms.create(CLOSE_TAB_ALARM, { delayInMinutes: CLOSE_TAB_AFTER_MINUTES });
    } else {
        console.debug("ContApp SPV closes its SPV tab");
        closeOwnTabs().catch((error) => console.debug("ContApp SPV could not close its SPV tab", error));
    }
});

// Safari sends a background fetch the ANAF session cookie but not the client certificate the session was opened
// with, and the F5 gateway logs the session out (my.logout.php3?errorcode=19). A fetch from an SPV page open in a tab
// goes out as that page's own, so in Safari the request runs there, in a tab the worker opens when there is none.
async function fetchInAnafTab(url, signal, onHeaders) {
    chrome.alarms.create(CLOSE_TAB_ALARM, { delayInMinutes: CLOSE_TAB_AFTER_MINUTES });

    const { tab, error } = await anafTab();

    if (!tab) {
        return { ok: false, error };
    }

    // The tab's connection is already up, so there is no handshake to wait for: the whole fetch gets the body deadline.
    onHeaders();

    // The fetch in the tab cannot be aborted from here; the request stops waiting for it instead.
    const aborted = new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    let answer;

    try {
        const injection = chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: fetchFromPage, args: [url] });
        [{ result: answer }] = await Promise.race([injection, aborted]);
    } catch (error) {
        console.debug("ContApp SPV fetch in the ANAF tab failed", error);

        return networkError(error);
    }

    if (typeof answer?.body !== "string") {
        console.debug("ContApp SPV fetch in the ANAF tab failed", answer?.error);

        return networkError(answer?.error ?? "no answer from the ANAF tab");
    }

    if (!allowedUrl(answer.url)) {
        console.debug("ContApp SPV session lost: redirected to", answer.status, answer.url);

        return { ok: false, error: SESSION_LOST };
    }

    return restReply(answer.status, answer.url, fromBase64(answer.body));
}

// `controller` is the request's own: the page aborts it by closing the port, a login by cancelling every fetch.
async function proxyFetch(url, controller) {
    // MV3 host permissions are optional in Firefox, and Chrome withholds them under "on click" site access.
    // Without the grant, fetch fails with the same TypeError as a missing certificate.
    if (!(await chrome.permissions.contains(HOST_PERMISSION))) {
        return { ok: false, error: "permission", message: `permission for ${HOST_PERMISSION.origins[0]} is not granted` };
    }

    const stopKeepAlive = keepAlive();
    let deadline;
    let holdsSlot = false;

    inFlight.add(controller);

    try {
        await sessionReset;

        try {
            await acquireSlot(controller.signal);
            holdsSlot = true;
        } catch {
            return { ok: false, error: CANCELLED }; // cancelled while it waited for a slot
        }

        const abortAfter = (ms) => setTimeout(() => controller.abort(TIMED_OUT), ms);
        deadline = abortAfter(FETCH_TIMEOUT_MS);

        const fetchVia = extensionScheme() === "safari-web-extension:" ? fetchInAnafTab : fetchBody;
        const reply = await fetchVia(url, controller.signal, () => {
            clearTimeout(deadline);
            deadline = abortAfter(BODY_TIMEOUT_MS);
        });

        if (controller.signal.aborted && !reply.ok) {
            return { ok: false, error: controller.signal.reason === TIMED_OUT ? TIMED_OUT : CANCELLED };
        }

        // Both only answer ok for a REST answer under the SPV prefix.
        sessionAlive = reply.ok && reply.status < 400;

        return reply;
    } finally {
        clearTimeout(deadline);
        inFlight.delete(controller);
        if (holdsSlot) {
            releaseSlot();
        }
        stopKeepAlive();
    }
}

// Firefox throws on cookie queries without firstPartyDomain while first-party isolation is on; null means all.
// Safari's cookies API takes neither that key nor partitionKey.
function cookieQuery() {
    const query = { domain: ANAF_DOMAIN };

    switch (extensionScheme()) {
        case "moz-extension:":
            return { ...query, partitionKey: {}, firstPartyDomain: null };
        case "safari-web-extension:":
            return query;
        default:
            return { ...query, partitionKey: {} };
    }
}

// The browser sends the host its own cookies and those set on a parent domain such as .anaf.ro.
function reachesAnafHost({ domain, hostOnly }) {
    const bare = domain.replace(/^\./, "");

    return hostOnly ? bare === ANAF_HOST : ANAF_HOST === bare || ANAF_HOST.endsWith(`.${bare}`);
}

// After a failed certificate or PIN check ANAF's F5 gateway keeps answering the dead session's cookie with its
// error page, so the login tab starts from no cookie at all. The values are only passed back to remove.
async function forgetAnafSession() {
    if (!(await chrome.permissions.contains(COOKIE_PERMISSION))) {
        throw new Error(`permission for ${COOKIE_PERMISSION.origins.join(" and ")} is not granted`);
    }

    const cookies = (await chrome.cookies.getAll(cookieQuery())).filter(reachesAnafHost);

    await Promise.all(cookies.map(({ name, domain, path, storeId, partitionKey, firstPartyDomain }) =>
        chrome.cookies.remove({
            url: `https://${domain.replace(/^\./, "")}${path}`,
            name,
            storeId,
            ...(partitionKey && { partitionKey }),
            ...(firstPartyDomain !== undefined && { firstPartyDomain }),
        })));
}

// A live session is kept: another ContApp tab may be syncing with it. A lost one is cleared, and the fetches still
// stuck on it or queued behind them are cancelled so they stop holding connections the login tab needs. Fetches
// that arrive during the reset wait for it.
async function resetLostSession() {
    if (sessionAlive) {
        return { reset: "kept" };
    }

    for (const controller of inFlight) {
        controller.abort(CANCELLED);
    }

    const reset = forgetAnafSession();
    sessionReset = reset.catch(() => {});

    try {
        await reset;

        return { reset: "cleared" };
    } catch (error) {
        console.warn("ContApp SPV could not clear the ANAF session", error);

        return { reset: "failed", message: String(error?.message ?? error) };
    }
}

async function openLogin(url) {
    const outcome = await resetLostSession();

    // The worker's own SPV tab holds the lost session; the next request opens a new one after the login.
    if (outcome.reset !== "kept" && extensionScheme() === "safari-web-extension:") {
        await closeOwnTabs().catch((error) => console.debug("ContApp SPV could not close its SPV tab", error));
    }
    await chrome.tabs.create({ url });

    return { ok: true, ...outcome };
}

async function handle(message, controller) {
    const url = allowedUrl(message?.url);

    switch (message?.type) {
        case "ping":
            return { ok: true, version: chrome.runtime.getManifest().version };
        case "fetch":
            return url ? proxyFetch(url, controller) : { ok: false, error: "forbidden_url" };
        case "login":
            return url ? openLogin(url) : { ok: false, error: "forbidden_url" };
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
