# ContApp browser extension

[![CI](https://github.com/Kronos-IT-Support-Consulting/contapp-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Kronos-IT-Support-Consulting/contapp-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Kronos-IT-Support-Consulting/contapp-extension)](https://github.com/Kronos-IT-Support-Consulting/contapp-extension/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Lets [ContApp](https://contapp.ro) use ANAF's certificate-only services, reading SPV messages and filing
declarations, with the qualified certificate that lives in the user's browser (USB token, cloud HSM, OS keychain).

## What it is

ANAF's SPV web service (`https://webserviced.anaf.ro/SPVWS2/rest/`) and its declaration filing portal
(`https://decl.anaf.mfinante.gov.ro/WAS6DUS/`) only answer over mutual TLS, and the user's qualified certificate
usually lives on a USB token or cloud HSM whose key cannot be exported. The browser already knows how to do that
handshake (the OS keychain / PKCS#11 middleware asks for the PIN), but a ContApp page cannot read the response: ANAF
sends no CORS headers and there is no JS API for client certificates.

This extension is a dumb fetch proxy. A ContApp page asks it to fetch an SPV URL (or to upload a signed declaration
to the portal), the browser performs the mTLS handshake with the user's certificate, and the raw response is handed
back to the page. The extension holds no API token, does no background polling, stores nothing and never sees the
PIN or the private key.
See [PRIVACY.md](PRIVACY.md).

| File | Role |
|---|---|
| `manifest.json` | Manifest V3, Chrome/Edge shaped. Its `version` is stamped from the release tag by the workflow; the `1.0.0` in the repository only matters for load-unpacked development. |
| `background.js` | Service worker: validates the URL, fetches it (or uploads the declaration), returns status/url/base64 body; opens and closes the login tabs and clears a lost ANAF session's cookies. |
| `content.js` | Injected into ContApp pages; bridges `window.postMessage` to the service worker. |
| `login-tab.js` | Injected into the declaration portal's F5 form and pages and into SPV REST answers; in a login tab the extension opened, submits the portal's F5 form once and reports when the login ended, so the worker closes the tab. |
| `icons/` | 16/48/128 PNG icons, plus the SVG sources they are rendered from. |
| `build.sh` | Writes `dist/chrome` and `dist/firefox` and zips both (requires `jq` and `zip`), plus the `-dev` builds that also run on the local `contapp.test` hosts. |
| `test/` | `node:test` suites that load the three scripts in a stubbed `vm` context. |
| `store/` | Store listing texts, the 512 px store icon and the screenshots. |
| `PRIVACY.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE` | Privacy policy (published by GitHub Pages), changelog, security policy, contribution rules, MIT licence. |
| `.github/` | CI and release workflows, Dependabot, code owners, pull request template. |

## Install

The ContApp page must be open in the same browser profile, and the token's middleware (or the
cloud-signature agent) must be installed on that machine.

### Chrome Web Store

Not published yet. The listing will be unlisted; the install link will be shown on ContApp's *Certificat SPV* page.

### From a GitHub release (Chrome / Edge)

1. Download `contapp-spv-chrome-<version>.zip` from the
   [latest release](https://github.com/Kronos-IT-Support-Consulting/contapp-extension/releases/latest)
   and unzip it into a folder you will keep.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Enable **Developer mode**.
4. **Load unpacked** → select the unzipped folder.
5. Reload any open ContApp tab so the content script is injected.

### Firefox (temporary add-on)

1. Download `contapp-spv-firefox-<version>.zip` from the release (or run `./build.sh`).
2. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick the zip (or
   `dist/firefox/manifest.json`).

Temporary add-ons disappear when Firefox restarts. A release whose repository has AMO keys configured also
carries a signed `.xpi`, which installs permanently.

Firefox MV3 does not run `background.service_worker`; it needs `background.scripts`. `build.sh` rewrites
that key for the Firefox variant, adds the `data_collection_permissions` declaration AMO requires, and drops
`browser_specific_settings` from the Chrome variant. The gecko id `spv@contapp.ro` must stay stable.

The declaration lists *personally identifying* and *financial* information: the extension stores nothing itself,
but the SPV responses it relays carry the certificate holder's CNP, CUIs and tax documents, which the ContApp page
then stores in the user's account, and Mozilla counts data handed outside the add-on as collection. Firefox 140+
shows this in the install prompt, hence `strict_min_version: "140.0"`. Firefox also lets the user revoke the ANAF
host permission at any time (*about:addons* → ContApp → the permissions tab); the extension then answers
`permission` with the message `permission for https://webserviced.anaf.ro/* is not granted`. The manifest declares no
`gecko_android` key because Firefox for Android has no client-certificate store; `web-ext lint` still prints one
advisory warning about the Android minimum version, which is expected.

In Firefox, whose JSON viewer runs no content script, the worker requests the address the SPV login tab loaded and
closes the tab on an SPV answer, so both login tabs close by themselves there too.

Chrome and Edge need version 119 or newer (`minimum_chrome_version`): from 110 an extension API call resets the
service worker's idle timer, which is how the worker stays alive while an SPV response is pending, and from 119
`chrome.cookies` takes a `partitionKey`, which the login needs to clear partitioned ANAF cookies too.

## Protocol

Page ↔ content script, via `window.postMessage`. Both sides check `event.origin === location.origin` and
`event.source === window`. Every message carries `channel: "contapp-spv"` and an `id`; replies also carry
`direction: "reply"` so the page can tell its own requests from answers (the content script ignores
anything marked as a reply).

Content script ↔ service worker: one `chrome.runtime.connect` port per request. The worker answers only ports
opened by this extension's content script from a page on one of the hosts the manifest injects it into; closing
the port (a `cancel`, or the tab navigating away or closing) aborts the request.

Only URLs under `https://webserviced.anaf.ro/SPVWS2/rest/` are accepted for `fetch`, only URLs under
`https://decl.anaf.mfinante.gov.ro/WAS6DUS/` for `upload`, and for `login` only the two addresses ContApp logs in
with: the SPV message list, `https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje` with any query (`?zile=60`), or
exactly `https://decl.anaf.mfinante.gov.ro/` (the declaration portal's start page). A login tab is a visible request
made with the user's certificate, so nothing else is opened on the page's behalf.

| page sends | extension answers |
|---|---|
| `{type:"ping"}` | `{ok:true, version}` |
| `{type:"fetch", url}` | `{ok:true, status, url, body}` with `body` an ArrayBuffer (structured clone) |
| `{type:"upload", url, field, filename, contentType, body}` | the same as `fetch`: `{ok:true, status, url, body}` with ANAF's answer as an ArrayBuffer |
| `{type:"login", url}` | `{ok:true, reset, message?}` after `chrome.tabs.create({url})`, or `{ok:false, error:"network", message}` if the tab cannot be opened |
| `{type:"cancel", id}` | nothing; the pending request with that `id` answers `{ok:false, error:"cancelled"}` |
| any | `{ok:false, error:"certificate_required"\|"certificate_refused"\|"session_lost"\|"timeout"\|"cancelled"\|"permission"\|"forbidden_url"\|"forbidden_origin"\|"network"\|"extension"\|"extension_reloaded"\|"unknown_type", message?}` |

`upload` POSTs a `multipart/form-data` body with one file part: `field` is the part's name (`linkdoc` for ANAF's
`displayFile.do`), `filename` and `contentType` its file name and type, and `body` the file's bytes as a base64 string
(it crosses `window.postMessage` and a runtime port). It answers with the same replies and errors as `fetch`, with the
same credentials, redirects, deadlines, slots and cancelling. The portal answers an accepted declaration with an HTML
page (`Succes depunere`, `Indexul este <b>…</b>`); the page reads the outcome from that body, the extension does not.
Fields that are not strings, an empty `field`, or a `body` that is not base64 answer `network` with a `message` and
send nothing. An upload is not idempotent: after `cancelled` or `timeout` ANAF may still have registered the
declaration, so check before sending it again rather than retrying blindly.

An upload logs in to the portal by itself when it can, the way the F5 page would: `GET https://decl.anaf.mfinante.gov.ro/`
(which ends on `/my.policy` without a session) and `POST /my.policy` with `vhost=standard`, where the gateway asks for
the client certificate. Chrome answers that without a picker only when a certificate was already chosen for the host
in this browser session; otherwise the request fails and the upload answers `certificate_required` without sending
the declaration. This silent login runs:

- before the upload, when the worker does not know the portal's session to be alive (the last request to it failed,
  or the worker restarted since);
- after the upload, when the session was thought alive but F5 bounced the POST to `/my.policy`, which means it never
  reached the portal. The declaration is then sent again, once. Nothing else is ever resent: a timeout, a cancel, a
  network error, an HTTP error or a landing anywhere but `/my.policy` may have filed the declaration.

The page sees only the final reply, in the same shapes as before.

So that ContApp can log where the portal sends it (and notice ANAF moving it), the declaration paths fill the optional
`message`: an upload's `session_lost`, including after the resend, and a silent login that ends outside `/WAS6DUS/`
carry the final URL, and an upload's `forbidden_url` the refused URL. Both are scheme, host and path only; the query is
dropped, since F5 puts its nonces there. A `forbidden_url` for a value that is not a URL string has no `message`. SPV
replies are unchanged.

- `certificate_required`: `fetch` threw a `TypeError`. That is what Chrome returns when ANAF demands a client
  certificate and no tab can show the picker (`ERR_SSL_CLIENT_AUTH_CERT_NEEDED`), but also for any other
  network-level failure while the browser is online (offline it is `network` with the message `offline`). The page
  should offer the `login` action.
- `certificate_refused`: the request ended on F5's hangup page, `https://<host>/vdesk/hangup.php3`, which ANAF
  shows as *Certificatul nu a fost prezentat*: the browser sent no client certificate. Chrome does that without a
  picker when the operating system offers none (the cloud certificate's app is not running, the token is not plugged
  in), and also after the user closes the picker; either way it remembers "no certificate" for the host until the
  browser quits, so neither a `login` nor clearing cookies helps. Nothing reached the SPV API or the portal (an upload
  was not filed). For an upload, `message` carries the hangup URL like `session_lost` does. The page should tell the
  user to start the certificate's app or plug in the token, quit the browser completely and log in again. Firefox
  behaves the same way after the user cancels its certificate dialog with *Remember this decision* ticked (the
  default); a restart clears that too.
- `session_lost`: ANAF answered, but not as the SPV REST API: the request was redirected out of
  `https://webserviced.anaf.ro/SPVWS2/rest/` (to F5's login pages, or to anything over `http://`), or a `2xx`/`3xx`
  answer under the prefix was neither JSON nor a PDF (the gateway's own HTML page). For `upload`, the request ended
  outside `https://decl.anaf.mfinante.gov.ro/WAS6DUS/` (F5's `/my.policy`, the portal's start page, `http://`); the
  portal's own pages are HTML, so the body under the prefix is not checked. No body is handed over. The page should
  offer the `login` action (for an upload, with the portal's URL).
- `timeout`: ANAF sent no response headers within 90 s, usually a handshake stuck on a certificate picker or PIN
  prompt that never showed, or the body did not finish within 5 minutes of the headers. The request is aborted so it
  stops holding one of Chrome's six connections to the host. The page should offer the `login` action. In Firefox
  this is also the answer when the certificate's app is not running: Firefox waits for it instead of sending no
  certificate, and the next request works once the app runs, without a restart.
- `cancelled`: a `login` reset the lost session while this fetch was in flight or queued, or the page sent `cancel`
  for it. After a login it is not a failure to show: run the request again once the user is back from the login tab.
- `permission`: the extension has no access to `webserviced.anaf.ro`, or for `upload` to
  `decl.anaf.mfinante.gov.ro` (revoked in Firefox, or Chrome's site access set to "on click"); `message` names the
  missing grant. The page should ask the user to grant site access.
- `forbidden_url`: the URL, once parsed and normalised the way `fetch` would, is not under the prefix the type
  accepts (so `…/SPVWS2/rest/../x` is refused), or its path still carries an encoded dot, slash or backslash or a `;`
  path parameter, which the parser leaves alone but a server may resolve (`…/rest/..;/x`, `…/rest/..%2Fx`); the query
  is not checked. The request and the login tab use the normalised URL.
- `network`: anything else went wrong; `message` carries the error text. Besides fetch failures this covers a
  response or upload too large to hand over (above 47 MiB; an upload whose base64 exceeds Chrome's 64 MiB message
  limit, a file above about 48 MiB, is refused by the content script with Chrome's own message before anything reaches
  the worker), an upload whose fields are unusable, and a login tab that could not be opened.
- `forbidden_origin`: the request came from a page the extension does not serve. ContApp never sees it in
  practice, since the content script only runs on those hosts.
- `extension`: the content script got no usable answer from the service worker (a worker that died mid-request).
  Retry once; if it persists, reload the ContApp page.
- `extension_reloaded`: the extension was updated or reloaded since this page loaded. Chrome does not bring the
  bridge back into open tabs, so the content script detaches (and removes `data-spv-extension`); only reloading the
  ContApp page helps, so say so instead of retrying.
- `unknown_type`: the `type` is none of the above.

At most four requests per ANAF host use the network at once; the rest wait their turn. Chrome opens six connections
per host, so two stay free for the login tab even when every request is stuck on a handshake. `webserviced.anaf.ro`
and `decl.anaf.mfinante.gov.ro` have separate F5 gateways, so each keeps its own slots and session: a login resets
and cancels only the host it opens.

A `login` opens its tab next to the ContApp tab (`openerTabId`), so closing it brings ContApp back and the page's
`visibilitychange` handler resumes. In that tab, and only in tabs a `login` opened, `login-tab.js`:

- on the portal, submits F5's *Prezentare certificat* form once (a picker the user cancels lands on the form again and
  is left for a click). SPV's login shows no such form: F5's `/my.policy` there redirects by itself;
- once the tab reaches `https://decl.anaf.mfinante.gov.ro/WAS6DUS/`, or an SPV answer under
  `https://webserviced.anaf.ro/SPVWS2/rest/` served as JSON or PDF (not F5's `/my.policy`, `/vdesk/…` or `/public/…`
  pages, nor its HTML page under the prefix), tells the worker, which closes the tab and counts that host's session as
  alive;
- once the tab lands on F5's hangup page (`/vdesk/hangup.php3` on the same host, *Certificatul nu a fost prezentat*),
  tells the worker, which closes the tab and keeps the session lost: ContApp's next request answers
  `certificate_refused` and explains what to do.

The worker watches the tab for at most 5 minutes, staying awake meanwhile; after that, or if it restarted, the user
clicks the button and closes the tab by hand. ANAF opened any other way is left alone. Detecting the SPV answer needs
the content script: the tab's URL alone cannot tell a JSON answer from the gateway's HTML page under the same prefix.
Chrome's PDF viewer runs it; Firefox's JSON viewer and pdf.js do not, so in Firefox the worker watches the login tab
instead: once it has loaded an address under the SPV REST API, the worker requests that address itself and closes the
tab on an SPV answer (one extra request per login; the tab's URL is readable through the host permission alone).

`reset` in the login reply says what happened to that host's ANAF session before the tab opened:

- `kept`: the last request to that host got an answer (for SPV a JSON or PDF one from the REST API; for the portal
  one under `/WAS6DUS/` below HTTP 400), so the session is alive and is left alone (another
  ContApp tab may be syncing with it).
- `cleared`: the session was lost, or unknown after the service worker restarted. Every cookie the browser sends to
  the host was deleted (for `webserviced.anaf.ro` including those set on `.anaf.ro`; partitioned ones too), and
  requests to it still in flight were cancelled so they stop holding connections. After a failed certificate or PIN check, ANAF's F5
  gateway keeps answering the stale cookie with its error page; this lets the login start over.
- `failed`: the cookies could not be cleared, with `message` saying why (most often a revoked host permission).
  The tab still opens; if it lands on the gateway's error page, the user has to clear the ANAF cookies by hand.

The request follows redirects within the SPV REST API, and the reply's `url` is the final one; when ANAF's session
is gone it redirects to its F5 login pages, which answers `session_lost` (see above).

Presence check without a round trip: the content script sets
`document.documentElement.dataset.spvExtension` (i.e. `<html data-spv-extension="<version>">`) at
`document_start`.

Example from the page:

```js
const id = crypto.randomUUID();
window.addEventListener("message", function onReply(event) {
    if (event.source !== window || event.data?.channel !== "contapp-spv" || event.data.direction !== "reply" || event.data.id !== id) return;
    window.removeEventListener("message", onReply);
    console.log(event.data);
});
window.postMessage({ channel: "contapp-spv", id, type: "ping" }, location.origin);
```

## How ContApp uses it

The page side of the protocol (`spv-bridge.js`) lives in the ContApp application, not here. It detects the
extension through `<html data-spv-extension>`, sends `ping`/`fetch`/`upload`/`login`/`cancel` requests, and ContApp's
server parses the SPV responses it hands back. ContApp's connect form offers only the browser extension as the way
to reach SPV, so any change to the message shapes above must ship in both repositories together.

### End-to-end walkthrough (what the user sees)

1. **Connect the certificate** — ContApp → account menu → *Certificat SPV*. There is nothing to upload:
   click **Conectează**. The page now shows the connected state with *CNP titular* empty and
   *Nesincronizat încă*.
2. **Verify** — start the certificate's app (or plug in the token) first, then click **Verifică**.
   - Without the extension: a callout *Instalează extensia ContApp* appears and the button stays
     disabled. Install, then reload the page.
   - First time in this browser session: a warning toast *ANAF a cerut certificatul…* and a callout with
     the **Autentificare ANAF** button appear. This is expected: a background request cannot show the
     certificate picker.
   - Firefox with the certificate's app closed: the request waits until the extension's 90 s limit and ContApp
     shows its timeout message (*ANAF nu a răspuns la timp…*). Start the app; the next try works without restarting
     Firefox.
3. **Authenticate at ANAF** — click **Autentificare ANAF**. A new tab opens on
   `webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60`. The browser shows the certificate picker;
   choose the SPV certificate, then the token asks for its PIN. The tab ends on a raw JSON page (either
   a message list or `{"eroare":…}`). That JSON *is* the success: the browser now holds the ANAF
   session cookie and remembers the certificate for this host. The extension closes the tab by itself and
   ContApp comes back, in Firefox too.
   If the tab shows an F5 `/my.policy` page instead, wait for it to redirect; if it stays blank, reload it once.
   If no picker shows at all, ContApp shows *ANAF nu a primit certificatul*: the browser sent no certificate,
   because the certificate's app was not running or dropped the certificate (for example after a wrong code), the
   token was not plugged in, or the certificate picker was closed, and Chrome and Edge remember that until they quit.
   Start the certificate's app (or plug in the token), quit the browser completely (on a Mac, Cmd+Q) and log in
   again. A wrong PIN by itself does not cause this: Chromium forgets the remembered choice after a signing error and
   shows the picker again. Start the app before the first **Verifică** and do not close the picker.
   In Firefox the first **Verifică** usually needs no login tab: Firefox shows its own certificate dialog for the
   extension's request, then the PIN or code.
4. **Back in ContApp** — the check runs again by itself once the login tab closes (or click **Verifică**). A
   success toast *Certificat valid pentru CNP …, cu acces la N CUI-uri* appears and the page fills in
   *CNP titular*, *Serie certificat* and *CUI-uri acces*.
5. **Sync the inbox** — sidebar *Declarații ANAF* → *Admin ANAF* → tab *Mesaje SPV* → **Sincronizează SPV**. The
   toast reports how many messages were created, updated and skipped, and the table lists the messages whose CIF
   matches the current company. Messages for CUIs that are not a ContApp company count as *ignorate*.
6. **Downloads** — the sync then fetches the PDF of every message ContApp does not hold yet from
   `descarcare?id=<anaf id>` and stores it; the row shows *Descărcat* and its eye button opens the stored PDF with
   no ANAF round trip. A message whose download failed is fetched again by the next sync.
7. **Session expiry** — when ANAF drops the session (toast *Sesiunea SPV a expirat…* or *ANAF a cerut
   certificatul…* again), repeat steps 3 and 4. Nothing is lost; synced messages and downloaded PDFs stay in ContApp.
8. **Request a document** — on *Mesaje SPV* click **Cerere nouă**, pick a type (e.g. *D300*) and fill only
   the fields it asks for (year, month, reason, …), then **Trimite cererea**. The extension calls
   `cerere?tip=…&cui=<current company>…` and the toast reads *Cererea <id> a fost transmisă…*. ANAF generates
   the answer later: a following **Sincronizează SPV** lists it as a new message.
9. **File a declaration** — on a declaration's page click **Semnează și descarcă**; once it is signed, click
   **Încarcă în e-guvernare**. When the portal needs a login, its login tab
   (`https://decl.anaf.mfinante.gov.ro/`) opens by itself; choose the certificate and enter the PIN, and the tab
   closes. Back in ContApp the declaration is sent, but only when the extension reported that the earlier try was
   certainly not sent. Success shows the toast *Declarația a fost depusă la ANAF cu indexul …* with ANAF's index.
10. **Outcome unknown** — after a timeout, a cancel, a network error or a portal answer without an index, the
    dialog shows *Nu știm dacă depunerea a ajuns la ANAF* with **Caută la ANAF**. That lists the company's filings
    received at ANAF since that day (StareD112), so the admin can confirm the one that is this declaration before
    filing again.

Things that are *not* a problem: the login tab showing JSON, the PIN being asked only once per browser
session, the service worker in `chrome://extensions` showing *inactive* between clicks.

### Manual spike test (Chrome, USB token)

1. Make sure the token middleware is installed and Chrome can see the certificate: opening
   `https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60` directly in a tab should show the
   certificate picker and a PIN prompt.
2. Quit and restart Chrome so no certificate choice is cached.
3. Load the extension unpacked (above). Open any ContApp page and the DevTools console.
4. Ping: run the example snippet above. Expect `{ok:true, version:"<version>", ...}`.
5. Fetch before login, expect `certificate_required`:
   ```js
   const ask = (msg) => new Promise((resolve) => {
       const id = crypto.randomUUID();
       window.addEventListener("message", function onReply(e) {
           if (e.source !== window || e.data?.channel !== "contapp-spv" || e.data.direction !== "reply" || e.data.id !== id) return;
           window.removeEventListener("message", onReply);
           resolve(e.data);
       });
       window.postMessage({ channel: "contapp-spv", id, ...msg }, location.origin);
   });
   const url = "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60";
   await ask({ type: "fetch", url });
   ```
6. Login: `await ask({ type: "login", url })`. Expect `reset: "cleared"`: the fetch in step 5 found no session.
   A tab opens; pick the certificate, enter the PIN; the extension closes the tab once the JSON shows.
7. Fetch again: `const r = await ask({ type: "fetch", url }); r.status; new TextDecoder().decode(r.body)`.
   Expect status 200 and the messages JSON.
8. Download one message: take an `id` from step 7 and run
   `await ask({ type: "fetch", url: "https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=<id>" })`;
   the body should start with `%PDF` (`new TextDecoder().decode(r.body.slice(0, 4))`).
9. Forbidden URL: `await ask({ type: "fetch", url: "https://example.com/" })` → `forbidden_url`.
10. Service worker logs: `chrome://extensions` → ContApp → **service worker** link → console.

### Spike findings

First run: 2026-10-13, Chrome on Windows, USB token, against staging (the real page flow, not the DevTools spike).

- [x] (1) A service-worker `fetch` succeeds after authenticating once in the login tab: yes — *Sincronizează SPV* listed the inbox.
- [x] (2) The certificate selection survives closing the login tab: yes (2026-11-07, Chrome for Testing 156, Edge
  157 and Firefox 158 on macOS, cloud certificate). The same run showed how a missing certificate behaves, which
  2.3.0 reports as `certificate_refused`.
- [ ] (3) When ANAF's F5 session (`MRHSession`) expires (idle / absolute, observed time): not observed yet.
- [x] (4) Chrome accepts the manifest as shipped (no errors/warnings on `chrome://extensions`): yes, loaded unpacked.

Fallback if (1) ever fails: run the fetch inside the ANAF tab instead. The `login` action keeps a handle on
the tab it opened, the service worker injects a function into it with `chrome.scripting.executeScript`
(adds the `scripting` permission), that function does a same-origin `fetch` (the certificate prompt anchors
to that tab) and returns the base64 body, and the service worker relays it to the content script exactly as
today. The page-facing protocol does not change; the page may only need to keep the ANAF tab open while
syncing.

## Development

Requires Node 22+, `jq` and `zip`.

```sh
npm install      # web-ext, the Chrome Web Store uploader and Playwright, the only dev dependencies
npm test         # node:test suites in test/
./build.sh       # the four build directories and zips
npm run lint     # web-ext lint on dist/firefox (run ./build.sh first)
```

`web-ext lint` is Mozilla's linter, so it only runs on the Firefox build: on the Chrome build it always
fails on the missing `background.scripts` fallback and gecko id, which Chrome neither needs nor wants.

To try changes, load the repository folder unpacked in Chrome (it is Chrome-shaped as is and still matches the
local `contapp.test` hosts), or `dist/firefox` in Firefox after `./build.sh`. Reload the extension and the
ContApp tab after each change. `build.sh` strips the `.test` hosts, so release builds only run on
`https://{account,contabilitate,declaratiaunica}.contapp.ro/*`.

To test a build against a local ContApp without loading the source folder, use `dist/chrome-dev` or
`dist/firefox-dev` (also zipped as `contapp-spv-{chrome,firefox}-dev-<version>.zip`, and attached to every CI run's
artifact). They are the release code with the `.test` hosts kept, named "ContApp (dev)" and, in Firefox, under
their own id, so they install beside the store version. They are never published.

`npm test` runs the unit tests. `npm run test:e2e` loads `dist/chrome` (build first) into Playwright's Chromium,
with every request answered by test routes; `npx playwright install chromium` fetches the browser once. CI runs both.

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md); security reports: [SECURITY.md](SECURITY.md). MIT licensed.

## Release process

**From the browser (normal way):** Actions → **Release** → **Run workflow** → branch `main`, bump `patch`
(or `minor` / `major`) → **Run workflow**. The workflow takes the latest `v*` tag, increases it, and releases
the current `main` under the new tag.

**From a terminal (alternative):** tag a commit on `main` and push the tag (`git tag -a v1.2.3 -m v1.2.3 &&
git push origin v1.2.3`); the workflow releases that tag.

Either way the tag is the version: the workflow stamps it into `manifest.json` before building, so the version in
the repository's `manifest.json` is never bumped by hand (it only matters for load-unpacked development). The
workflow then runs the tests, builds, lints, and creates the GitHub Release with both zips and notes generated
from the merged pull requests. Creating a release needs write access to the repository; a pushed tag is only
released when its commit is on `main`, and once created, `v*` tags cannot be moved or deleted (ruleset *Release
tags*). Re-running the workflow on a commit that is already released refreshes that release's assets instead of
bumping again; a store that already holds the version will then refuse it, which the final `result` job reports.

The npm tools (web-ext, the Chrome Web Store uploader) run in their own jobs (`lint`, `cws`, `amo`), each with at most
its own store's secrets and a read-only token. The `release` job (GitHub release, Edge upload) and the `attach` job
(signed `.xpi` onto the release) hold the release-writing token and install no npm dependencies; files pass between
jobs as artifacts and are checked against the digests `release` recorded. Three store uploads run only when their
secrets are configured, and are skipped otherwise:

| Step | Repository secrets |
|---|---|
| Upload and publish the Chrome zip to the Chrome Web Store | `CWS_EXTENSION_ID`, `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |
| Sign the Firefox build on AMO (unlisted) and attach the `.xpi` to the release | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` |
| Upload the Chrome zip to Edge Add-ons and submit it for review | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` |

Set them with `gh secret set NAME` (or Settings → Secrets and variables → Actions). Every store needs the
listing created once by hand; the workflow only ships new versions of an existing item.

### Chrome Web Store secrets

1. In the [developer dashboard](https://chrome.google.com/webstore/devconsole) create the item by uploading
   `contapp-spv-chrome-<version>.zip`, fill in the listing and privacy tabs, choose *Unlisted* and submit it.
   The 32-letter id shown on the item is `CWS_EXTENSION_ID`. The publisher id on the dashboard's *Settings*
   page is `CWS_PUBLISHER_ID`; the uploader (Chrome Web Store API v2) refuses to run without it.
2. In [Google Cloud Console](https://console.cloud.google.com/), with the **same Google account** that owns
   the dashboard item: create a project, *APIs & Services → Library* → enable **Chrome Web Store API**.
3. *APIs & Services → OAuth consent screen*: user type *External*, fill in the app name and emails, no scopes
   needed, then **Publish app** (keep it in *Production*; in *Testing* status the refresh token expires after
   7 days). The "unverified app" warning on the consent screen is expected and harmless here.
4. *Credentials → Create credentials → OAuth client ID*, type **Desktop app**. Copy the client id and secret
   (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`).
5. Get the refresh token once: open this URL in the browser signed in as the owner account (replace
   `CLIENT_ID`):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:8818&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent
   ```
   Approve; the browser is sent to `http://localhost:8818/?code=…` (the page fails to load, that is fine).
   Copy the `code` value from the address bar and exchange it within a minute:
   ```sh
   curl -s https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=CODE -d grant_type=authorization_code -d redirect_uri=http://localhost:8818
   ```
   The `refresh_token` in the answer is `CWS_REFRESH_TOKEN`. It stays valid until revoked.

Edge users can also install directly from the Chrome Web Store page (Edge asks once to allow extensions
from other stores), so the Edge listing below is optional.

### Firefox (AMO) secrets

1. Sign in at <https://addons.mozilla.org/developers/> with the account that will own the add-on.
2. <https://addons.mozilla.org/developers/addon/api/key/> → **Generate new credentials**. The *JWT issuer*
   is `AMO_JWT_ISSUER`, the *JWT secret* is `AMO_JWT_SECRET`.
3. The first `web-ext sign` run creates the add-on (id `spv@contapp.ro`) on that account as unlisted /
   self-distributed; nothing has to be created by hand. The signed `.xpi` lands on the GitHub release.

### Edge Add-ons secrets

1. Register at [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) (free) and
   create the extension by uploading `contapp-spv-chrome-<version>.zip`, fill in the listing, set visibility
   *Hidden* (install only by link) and submit it. Once it exists, the overview URL contains the
   **Product ID** (`EDGE_PRODUCT_ID`).
2. Partner Center → **Publish API** → **Create API credentials**: copy the *Client ID* (`EDGE_CLIENT_ID`) and
   the *API key* (`EDGE_API_KEY`). The key is shown once and expires after the chosen period (max 2 years);
   generate a new one before it expires.

## Store checklist

- [x] Privacy policy: [PRIVACY.md](PRIVACY.md), served by GitHub Pages at <https://kronos-it-support-consulting.github.io/contapp-extension/PRIVACY>.
- [ ] Chrome Web Store listing as **unlisted**, single-purpose description, justification for the
      `webserviced.anaf.ro`, `anaf.ro` and `decl.anaf.mfinante.gov.ro` host permissions and the two content scripts
      (texts in [store/listing.md](store/listing.md)), data-usage disclosure matching the privacy policy.
- [ ] Edge Add-ons submission (same package as Chrome; afterwards the release workflow updates it).
- [ ] Firefox: sign `dist/firefox` via AMO (unlisted / self-distributed), keep the `spv@contapp.ro` gecko id
      stable.

### Store listing

- [store/listing.md](store/listing.md): every text and answer to paste into the Chrome Web Store, Edge Partner
  Center and (if asked) AMO forms: descriptions, single purpose, permission justifications, data-usage answers,
  reviewer notes and the assets checklist.
- [PRIVACY.md](PRIVACY.md): the privacy policy (Romanian, then English), published by GitHub Pages at
  <https://kronos-it-support-consulting.github.io/contapp-extension/PRIVACY>; that URL goes into every store's privacy-policy field.
- [store/screenshots/](store/screenshots/): the 1280×800 store screenshots listed in `store/listing.md`.
- GitHub Pages is configured in the repository settings (branch `main`, folder `/`), not in a workflow;
  `_config.yml` keeps the scripts and tests out of the published site.

## Known limitations

- The content script runs on `https://{account,contabilitate,declaratiaunica}.contapp.ro/*`, and replies go to the whole page through `window.postMessage`: any
  script those pages load, third-party ones included, can drive the proxy and read the SPV answers. Keep those
  pages free of scripts ContApp does not control, and drop a host from `matches` once it no longer needs SPV.
- In Firefox the SPV login tab closes after one extra request: the worker asks for the address the tab loaded, since
  Firefox's JSON viewer runs no content script.
- When ANAF asks for the certificate while the browser has none to offer (the certificate's app was not running or
  dropped the certificate, for example after a wrong code; the token was not plugged in; the certificate picker was
  closed), Chrome and Edge remember "no certificate" for the host until they quit, and no extension API can clear
  that: the user has to quit the browser. ContApp says so when the extension answers `certificate_refused`. A wrong
  PIN by itself does not cause this: Chromium clears the remembered choice on a signing error and shows the picker
  again.
