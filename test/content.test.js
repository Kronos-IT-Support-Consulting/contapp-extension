const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const ORIGIN = "https://app.contapp.ro";

// Objects built inside the vm realm have a foreign prototype; clone them before deepEqual.
const plain = (value) => structuredClone(value);

// Runs content.js in its own realm. `worker(message)` plays the service worker at the other end of each port: its
// result is posted back, and a throw disconnects the port without an answer, as a worker that dies does. What the
// page posts is collected in `posted`, what reaches the worker in `sent`, the ports opened in `ports`.
function loadContent(worker, { origin = ORIGIN } = {}) {
    const posted = [];
    const sent = [];
    const ports = [];
    let onMessage;

    const window = {
        addEventListener: (type, handler) => {
            assert.equal(type, "message");
            onMessage = handler;
        },
        removeEventListener: (type, handler) => {
            assert.equal(type, "message");
            if (handler === onMessage) {
                onMessage = undefined;
            }
        },
        postMessage: (data, targetOrigin, transfer) => posted.push({ data, targetOrigin, transfer }),
    };

    const connect = ({ name }) => {
        const listeners = { message: [], disconnect: [] };
        const port = {
            name,
            disconnected: false,
            postMessage: (message) => {
                sent.push(plain(message));
                Promise.resolve().then(() => worker(message)).then(
                    (response) => port.disconnected || listeners.message.forEach((callback) => callback(response)),
                    () => port.disconnected || listeners.disconnect.forEach((callback) => callback()),
                );
            },
            disconnect: () => (port.disconnected = true),
            onMessage: { addListener: (callback) => listeners.message.push(callback) },
            onDisconnect: { addListener: (callback) => listeners.disconnect.push(callback) },
        };

        ports.push(port);

        return port;
    };

    const context = vm.createContext({
        atob,
        window,
        location: { origin },
        document: { documentElement: { dataset: {} } },
        console: { debug() {} },
        chrome: { runtime: { id: "spv-extension-id", getManifest: () => ({ version: "9.8.7" }), connect } },
    });

    vm.runInContext(source, context);

    const listening = () => onMessage !== undefined;
    const dispatch = (data, event = {}) => onMessage?.({ data, source: window, origin, ...event });

    return { context, dispatch, listening, posted, sent, ports };
}

const request = { channel: "contapp-spv", id: "42", type: "fetch", url: "https://webserviced.anaf.ro/SPVWS2/rest/x" };
const envelope = { channel: "contapp-spv", direction: "reply", id: "42" };
const bodyOf = (text) => ({ ok: true, status: 200, url: request.url, body: Buffer.from(text).toString("base64") });

test("exposes the extension version on the html element", () => {
    const { context } = loadContent(() => ({ ok: true }));

    assert.equal(context.document.documentElement.dataset.spvExtension, "9.8.7");
});

test("installs nothing on a sandboxed page, whose opaque origin could not be checked", () => {
    const { context, listening } = loadContent(() => assert.fail("must not relay"), { origin: "null" });

    assert.equal(context.document.documentElement.dataset.spvExtension, undefined);
    assert.equal(listening(), false);
});

test("ignores everything that is not a request from this page", async () => {
    const { dispatch, sent, posted } = loadContent(() => assert.fail("must not relay"));
    const ignored = [
        [request, { origin: "https://evil.example" }],
        [request, { origin: "http://app.contapp.ro" }],
        [request, { origin: "null" }],
        [request, { source: {} }],
        [request, { source: null }],
        [{ ...request, channel: "other" }],
        [{ ...request, direction: "reply" }],
        [{ ...request, id: undefined }],
        [{ ...request, id: null }],
        [{ ...request, type: undefined }],
        [{ ...request, type: "" }],
        [null], [undefined], ["contapp-spv"], [1], [[]], [{}],
    ];

    for (const [data, event] of ignored) {
        await dispatch(data, event);
    }

    assert.equal(sent.length, 0);
    assert.equal(posted.length, 0);
});

test("relays only type and url, and posts the reply with the same id to the page origin", async () => {
    const { dispatch, sent, posted } = loadContent(() => ({ ok: true, version: "9.8.7", id: "spoofed", channel: "x" }));

    for (const id of ["7", 0]) {
        await dispatch({ channel: "contapp-spv", id, type: "ping", headers: { Cookie: "x" } });
    }

    assert.deepEqual(sent, [{ type: "ping", url: undefined }, { type: "ping", url: undefined }]);
    assert.deepEqual(plain(posted.map((p) => p.data)), [
        { ok: true, version: "9.8.7", channel: "contapp-spv", direction: "reply", id: "7" },
        { ok: true, version: "9.8.7", channel: "contapp-spv", direction: "reply", id: 0 },
    ]);
    assert.deepEqual(plain(posted.map((p) => [p.targetOrigin, p.transfer])), [[ORIGIN, []], [ORIGIN, []]]);
});

test("relays an upload's file fields, and drops them from every other type", async () => {
    const { dispatch, sent } = loadContent(() => ({ ok: true }));
    const file = { field: "linkdoc", filename: "D700.pdf", contentType: "application/pdf", body: "JVBERi0=" };
    const url = "https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do";

    await dispatch({ channel: "contapp-spv", id: "1", type: "upload", url, ...file, method: "PUT", headers: { Cookie: "x" } });
    await dispatch({ ...request, ...file });

    assert.deepEqual(sent, [{ type: "upload", url, ...file }, { type: "fetch", url: request.url }]);
});

test("turns a base64 body into a transferred ArrayBuffer", async () => {
    for (const text of ["%PDF-1.7", ""]) {
        const { dispatch, posted } = loadContent(() => bodyOf(text));

        await dispatch(request);

        const { data, transfer } = posted[0];
        assert.equal(Object.prototype.toString.call(data.body), "[object ArrayBuffer]");
        assert.equal(Buffer.from(data.body).toString(), text);
        assert.equal(transfer.length, 1);
        assert.equal(transfer[0], data.body);
        assert.deepEqual(plain({ ...data, body: undefined }), { ok: true, status: 200, url: request.url, body: undefined, ...envelope });
    }
});

test("leaves the body alone unless the reply is ok", async () => {
    const { dispatch, posted } = loadContent(() => ({ ok: false, error: "network", body: "aGk=" }));

    await dispatch(request);

    assert.deepEqual(plain(posted[0]), { data: { ok: false, error: "network", body: "aGk=", ...envelope }, targetOrigin: ORIGIN, transfer: [] });
});

test("matches concurrent replies to their requests in completion order", async () => {
    const pending = new Map();
    const { dispatch, posted } = loadContent(({ url }) => new Promise((resolve) => pending.set(url, resolve)));

    const first = dispatch({ ...request, id: "first", url: `${request.url}1` });
    const second = dispatch({ ...request, id: "second", url: `${request.url}2` });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(posted.length, 0);

    pending.get(`${request.url}2`)(bodyOf("two"));
    await second;
    pending.get(`${request.url}1`)(bodyOf("one"));
    await first;

    assert.deepEqual(posted.map((p) => [p.data.id, Buffer.from(p.data.body).toString()]), [["second", "two"], ["first", "one"]]);
});

test("answers extension when the service worker is unreachable, silent, not an object or sends an undecodable body", async () => {
    const workers = [
        () => { throw new Error("Extension context invalidated."); },
        () => undefined,
        () => null,
        () => "",
        () => "ok",
        () => 7,
        () => ({ ok: true, status: 200, url: request.url, body: "@@not base64@@" }),
    ];

    for (const worker of workers) {
        const { dispatch, posted } = loadContent(worker);

        await dispatch(request);

        assert.deepEqual(plain(posted[0].data), { ok: false, error: "extension", ...envelope });
    }
});

test("a message the port refuses, as Chrome does above 64 MiB, answers network at once and leaves nothing pending", async () => {
    const { context, dispatch, sent, posted, ports } = loadContent(() => ({ ok: true }));
    const { connect } = context.chrome.runtime;
    const refused = "Message exceeded maximum allowed size of 64MiB.";
    context.chrome.runtime.connect = (...args) => {
        const port = connect(...args);
        port.postMessage = () => { throw new Error(refused); };

        return port;
    };

    await dispatch({ ...request, type: "upload", field: "linkdoc", filename: "D700.pdf", contentType: "application/pdf", body: "JVBERi0=" });

    assert.deepEqual(plain(posted.map((p) => p.data)), [{ ok: false, error: "network", message: refused, ...envelope }]);
    assert.deepEqual([sent, ports[0].disconnected], [[], true]);

    // Nothing is left to cancel, and the next request opens a port of its own as usual.
    await dispatch({ channel: "contapp-spv", id: request.id, type: "cancel" });
    assert.equal(posted.length, 1, "the cancel answers nothing");
    context.chrome.runtime.connect = connect;
    await dispatch({ ...request, id: "43" });
    assert.deepEqual(plain(posted[1].data), { ok: true, ...envelope, id: "43" });
    assert.equal(ports.length, 2);
});

test("each request gets its own port, closed once the answer is in", async () => {
    const { dispatch, ports } = loadContent(() => ({ ok: true }));

    await dispatch(request);
    await dispatch({ ...request, id: "43" });

    assert.deepEqual(ports.map(({ name, disconnected }) => [name, disconnected]), [["contapp-spv", true], ["contapp-spv", true]]);
});

test("cancel closes the request's port and answers it cancelled, and gets no reply of its own", async () => {
    const { dispatch, ports, posted } = loadContent(() => new Promise(() => {}));
    const pending = dispatch(request);

    await dispatch({ channel: "contapp-spv", id: "unknown", type: "cancel" });
    assert.equal(posted.length, 0);

    await dispatch({ channel: "contapp-spv", id: request.id, type: "cancel" });
    await pending;

    assert.equal(ports[0].disconnected, true);
    assert.deepEqual(plain(posted.map((p) => p.data)), [{ ok: false, error: "cancelled", ...envelope }]);
});

test("once the extension is reloaded or updated, the stale script answers extension_reloaded and detaches", async () => {
    const ways = [
        ["before the request", (chrome) => delete chrome.runtime.id],
        ["runtime gone entirely", (chrome) => delete chrome.runtime],
        ["while connecting", (chrome) => {
            chrome.runtime.connect = () => {
                delete chrome.runtime.id;
                throw new Error("Extension context invalidated.");
            };
        }],
        // The port drops without an answer and the runtime is gone by the time the script looks.
        ["mid-request", null],
    ];

    for (const [name, lose] of ways) {
        const loaded = loadContent(() => {
            delete loaded.context.chrome.runtime.id;
            throw new Error("port closed");
        });
        lose?.(loaded.context.chrome);

        await loaded.dispatch(request);

        assert.deepEqual(plain(loaded.posted.map((p) => p.data)), [{ ok: false, error: "extension_reloaded", ...envelope }], name);
        assert.equal(loaded.context.document.documentElement.dataset.spvExtension, undefined, name);
        assert.equal(loaded.listening(), false, name);
    }
});
