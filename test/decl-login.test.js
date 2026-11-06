const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "decl-login.js"), "utf8");
const POLICY = "/my.policy";
const LANDING = "/WAS6DUS/";

// Runs decl-login.js on a page at `pathname`. `worker(message)` plays the service worker's answer (a throw rejects
// sendMessage, as an unreachable worker does); `form` is false for a page without F5's form.
async function loadScript(pathname, worker, { form = true } = {}) {
    const sent = [];
    let submits = 0;
    const authForm = { requestSubmit: () => submits++ };
    const context = vm.createContext({
        location: { pathname },
        document: { getElementById: (id) => (form && id === "auth_form" ? authForm : null) },
        chrome: {
            runtime: {
                sendMessage: async (message) => {
                    sent.push(structuredClone(message));

                    return worker(message);
                },
            },
        },
    });

    vm.runInContext(source, context);
    await new Promise((resolve) => setImmediate(resolve));

    return { sent, submits };
}

test("submits F5's form once when the worker says the tab is its login tab", async () => {
    const { sent, submits } = await loadScript(POLICY, () => ({ submit: true }));

    assert.deepEqual(sent, [{ type: "decl-login-form" }]);
    assert.equal(submits, 1);
});

test("leaves the form alone unless the worker answers submit:true", async () => {
    const answers = [
        () => ({ submit: false }),
        () => undefined,
        () => ({ submit: "yes" }),
        () => { throw new Error("Could not establish connection. Receiving end does not exist."); },
    ];

    for (const worker of answers) {
        assert.equal((await loadScript(POLICY, worker)).submits, 0);
    }
});

test("on the portal's pages it only reports the landing, and never submits", async () => {
    const { sent, submits } = await loadScript(`${LANDING}index.jsp`, () => ({ submit: true }));

    assert.deepEqual(sent, [{ type: "decl-login-landed" }]);
    assert.equal(submits, 0);
});

test("a page without the form is left alone", async () => {
    assert.equal((await loadScript(POLICY, () => ({ submit: true }), { form: false })).submits, 0);
});
