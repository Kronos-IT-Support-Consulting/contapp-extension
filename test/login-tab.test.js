const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "login-tab.js"), "utf8");
const DECL = "decl.anaf.mfinante.gov.ro";
const SPV = "webserviced.anaf.ro";

// Runs login-tab.js on a page at `hostname` + `pathname` served as `contentType`. `worker(message)` plays the service
// worker's answer (a throw rejects sendMessage, as an unreachable worker does); `form` is false for a page without
// F5's form.
async function loadScript(hostname, pathname, worker, { form = true, contentType = "text/html" } = {}) {
    const sent = [];
    let submits = 0;
    const authForm = { requestSubmit: () => submits++ };
    const context = vm.createContext({
        location: { hostname, pathname },
        document: { contentType, getElementById: (id) => (form && id === "auth_form" ? authForm : null) },
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

const yes = () => ({ submit: true });

test("submits the portal's F5 form once when the worker says the tab is its login tab", async () => {
    const { sent, submits } = await loadScript(DECL, "/my.policy", yes);

    assert.deepEqual(sent, [{ type: "login-form" }]);
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
        assert.equal((await loadScript(DECL, "/my.policy", worker)).submits, 0);
    }
    assert.equal((await loadScript(DECL, "/my.policy", yes, { form: false })).submits, 0, "a page without the form");
});

test("reports a landing on the portal's pages and on SPV answers, and never submits there", async () => {
    const landings = [
        [DECL, "/WAS6DUS/index.jsp", "text/html"],
        [SPV, "/SPVWS2/rest/listaMesaje", "application/json"],
        [SPV, "/SPVWS2/rest/descarcare", "application/pdf"],
    ];

    for (const [hostname, pathname, contentType] of landings) {
        const { sent, submits } = await loadScript(hostname, pathname, yes, { contentType });

        assert.deepEqual(sent, [{ type: "login-landed" }], pathname);
        assert.equal(submits, 0, pathname);
    }
});

test("says nothing on SPV's F5 pages or on a gateway page under the REST prefix", async () => {
    const silent = [
        [SPV, "/SPVWS2/rest/listaMesaje", "text/html"],
        [SPV, "/SPVWS2/rest/listaMesaje", "text/plain"],
        [SPV, "/my.policy", "text/html"],
    ];

    for (const [hostname, pathname, contentType] of silent) {
        const { sent, submits } = await loadScript(hostname, pathname, yes, { contentType });

        assert.deepEqual([sent, submits], [[], 0], `${pathname} ${contentType}`);
    }
});
