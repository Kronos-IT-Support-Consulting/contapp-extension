const CHANNEL = "contapp-spv";
// Cancels for the requests still waiting on the worker, by the page's id.
const pending = new Map();

// A sandboxed document has the opaque origin "null": the origin check below would pass for anyone and
// postMessage would refuse "null" as a target. Such a page gets no bridge.
if (location.origin !== "null") {
    window.addEventListener("message", onMessage);
    document.documentElement.dataset.spvExtension = chrome.runtime.getManifest().version;
}

// Chrome does not inject the new content script into open tabs after the extension is updated or reloaded; this
// one stays behind with every extension API gone. Only a page reload brings the bridge back.
function orphaned() {
    try {
        return !chrome.runtime?.id;
    } catch {
        return true;
    }
}

function detach() {
    window.removeEventListener("message", onMessage);
    delete document.documentElement.dataset.spvExtension;

    return { ok: false, error: "extension_reloaded" };
}

function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

// Whatever else goes wrong between here and the service worker (no answer, an answer that cannot be decoded, a
// worker that died mid-request) looks the same to the page: "extension".
function decode(response) {
    if (typeof response !== "object" || response === null) {
        return { ok: false, error: "extension" };
    }

    try {
        return response.ok && typeof response.body === "string" ? { ...response, body: fromBase64(response.body) } : response;
    } catch {
        return { ok: false, error: "extension" };
    }
}

// Only the fields the worker reads cross over; an upload also carries its file, the body as base64.
function forward({ type, url, field, filename, contentType, body }) {
    return type === "upload" ? { type, url, field, filename, contentType, body } : { type, url };
}

// One port per request, so closing it (the page cancels, or navigates away and takes this script with it) tells
// the worker to abort the fetch.
function relay(id, message) {
    if (orphaned()) {
        return Promise.resolve(detach());
    }

    return new Promise((resolve) => {
        let port;
        let settled = false;
        const settle = (payload) => {
            if (settled) {
                return;
            }
            settled = true;
            if (pending.get(id) === cancel) {
                pending.delete(id);
            }
            port.disconnect();
            resolve(payload);
        };
        const cancel = () => settle({ ok: false, error: "cancelled" });

        try {
            port = chrome.runtime.connect({ name: CHANNEL });
        } catch (error) {
            console.debug("ContApp SPV extension unreachable", error);
            resolve(orphaned() ? detach() : { ok: false, error: "extension" });

            return;
        }

        pending.set(id, cancel);
        port.onMessage.addListener((response) => settle(decode(response)));
        port.onDisconnect.addListener(() => settle(orphaned() ? detach() : { ok: false, error: "extension" }));

        // Chrome throws instead of sending a message over 64 MiB (an upload's base64 of a file above about 48 MiB);
        // the page is told rather than left waiting for an answer that never comes.
        try {
            port.postMessage(message);
        } catch (error) {
            console.debug("ContApp SPV request could not be sent", error);
            settle({ ok: false, error: "network", message: String(error?.message ?? error) });
        }
    });
}

function reply(id, payload) {
    const transfer = payload.body instanceof ArrayBuffer ? [payload.body] : [];

    window.postMessage({ ...payload, channel: CHANNEL, direction: "reply", id }, location.origin, transfer);
}

async function onMessage(event) {
    const data = event.data;

    if (event.source !== window || event.origin !== location.origin) {
        return;
    }

    if (data?.channel !== CHANNEL || data.direction === "reply" || data.id == null || !data.type) {
        return;
    }

    // A cancel gets no reply of its own: the request it names answers "cancelled".
    if (data.type === "cancel") {
        pending.get(data.id)?.();

        return;
    }

    reply(data.id, await relay(data.id, forward(data)));
}
