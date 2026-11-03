# ContApp SPV browser extension

[![CI](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Kronos-IT-Support-Consulting/contapp-spv-extension)](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Lets [ContApp](https://contapp.ro) read ANAF SPV messages using the qualified certificate that lives in the
user's browser (USB token, cloud HSM, OS keychain).

## What it is

ANAF's SPV web service (`https://webserviced.anaf.ro/SPVWS2/rest/`) only answers over mutual TLS, and the
user's qualified certificate usually lives on a USB token or cloud HSM whose key cannot be exported. The
browser already knows how to do that handshake (the OS keychain / PKCS#11 middleware asks for the PIN), but
a ContApp page cannot read the response: ANAF sends no CORS headers and there is no JS API for client
certificates.

This extension is a dumb fetch proxy. A ContApp page asks it to fetch an SPV URL, the browser performs the
mTLS handshake with the user's certificate, and the raw response is handed back to the page. The extension
holds no API token, does no background polling, stores nothing and never sees the PIN or the private key.
See [PRIVACY.md](PRIVACY.md).

| File | Role |
|---|---|
| `manifest.json` | Manifest V3, Chrome/Edge shaped. Its `version` is stamped from the release tag by the workflow; the `1.0.0` in the repository only matters for load-unpacked development. |
| `background.js` | Service worker: validates the URL, fetches it, returns status/url/base64 body. |
| `content.js` | Injected into ContApp pages; bridges `window.postMessage` to the service worker. |
| `icons/` | 16/48/128 PNG icons, plus the SVG sources they are rendered from. |
| `build.sh` | Writes `dist/chrome`, `dist/firefox` and `dist/safari`, and zips the first two (requires `jq` and `zip`). |
| `safari/` | The Xcode project of the macOS app that carries the Safari extension, and `app-icon.swift`, which renders its icons. |
| `safari.sh` | Generated that Xcode project once (requires Xcode); refuses to overwrite it. |
| `test/` | `node:test` suites that load both scripts in a stubbed `vm` context. |
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
   [latest release](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/releases/latest)
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
host permission at any time (*about:addons* → ContApp SPV → the permissions tab); the extension then answers
`permission` with the message `permission for https://webserviced.anaf.ro/* is not granted`. The manifest declares no
`gecko_android` key because Firefox for Android has no client-certificate store; `web-ext lint` still prints one
advisory warning about the Android minimum version, which is expected.

### Safari (macOS)

Safari only runs web extensions shipped inside a macOS app, so there is no zip to download. With the full Xcode
installed (not only the command line tools):

1. `./build.sh` writes `dist/safari`. The Xcode project in `safari/` wraps it (app *ContApp SPV*, bundle id
   `ro.contapp.spv`, extension `ro.contapp.spv.Extension`; the ids cannot change once the app is on the App Store) and
   references `dist/safari` rather than copying it, so after a source change `./build.sh` and a rebuild in Xcode are
   enough. `safari.sh` generated the project once with Apple's converter and now refuses to run while it exists: the
   project is edited since, and regenerating it would undo that (the app id the extension id has to start with, macOS
   13, the team, the App Store settings below, the Romanian app window).
2. Open `safari/ContApp SPV/ContApp SPV.xcodeproj`, pick the *ContApp SPV* scheme and **Run**; without an Apple team, set
   signing to *Sign to Run Locally*. The app window has a button that opens Safari's extension settings.
3. Only for a build signed to run locally: Safari → Settings → Advanced → *Show features for web developers*, then
   Settings → Developer → *Allow unsigned extensions* (asked again after every Safari restart). A build signed with
   the team needs neither.
4. Safari → Settings → Extensions → enable **ContApp SPV**, and allow it on `webserviced.anaf.ro`, `anaf.ro` and the
   ContApp hosts. Safari asks for every site, content-script hosts included: until the ContApp host is allowed, the
   page sees no `data-spv-extension` and shows the install callout.

For local development run `SAFARI_DEV=1 ./build.sh` and rebuild in Xcode:
`dist/safari` then keeps the `contapp.test` hosts, which Safari needs because it has no load-unpacked. A plain
`./build.sh` drops them again; never ship an app built from a development `dist/safari`. The project signs with the
Apple Developer team `JGKF87DT24`.

For the Mac App Store the app declares the *Productivity* category and no non-exempt encryption
(`ITSAppUsesNonExemptEncryption = NO`, it only uses the system's HTTPS), and its version (`MARKETING_VERSION`, now
`1.0.0`) should match the extension's; raise the build number (`CURRENT_PROJECT_VERSION`) on every upload. The app
icon set is rendered from `icons/icon.svg` by `swift safari/app-icon.swift`. To upload: a plain `./build.sh` (never
`SAFARI_DEV=1`), then in Xcode the *ContApp SPV* scheme, destination *Any Mac*, **Product → Archive**, and in the
Organizer **Distribute App → App Store Connect**.

The Safari manifest drops `minimum_chrome_version` and asks for Safari 18 (`browser_specific_settings.safari`). In
Safari the cookie query sends only `domain`: Safari's cookies API takes neither `partitionKey` nor `firstPartyDomain`.
The engine is told apart by the extension URL scheme (`safari-web-extension:`), since Safari defines `browser` like
Firefox does.

**In Safari the SPV requests run in the ANAF tab, not in the background.** A background `fetch` carries the ANAF
session cookie but not the client certificate the session was opened with (Safari ties the certificate prompt to a
tab), and F5 answers it with its logout page, `my.logout.php3?errorcode=19`, which ends the session. The same request
sent from the SPV page in a tab gets the JSON. So in Safari the worker finds the most recently used tab under
`https://webserviced.anaf.ro/SPVWS2/rest/`, runs the fetch there as the page's own script
(`chrome.scripting.executeScript`, `world: "MAIN"`) and checks the answer like any other. The page-facing protocol
is unchanged.

When no such tab is open, the worker opens its own in the background (`listaMesaje?zile=1#contapp-spv`; the fragment
marks it and never reaches ANAF). While the session lives, Safari loads it without asking for anything, so the user
only sees a tab come and go in the tab bar. An alarm closes it after a minute without requests; the user's own SPV
tabs are never closed. If that tab ends outside the SPV API (F5's pages) the request answers `session_lost`, and if
it has not loaded within 30 s (a certificate prompt nobody sees) `certificate_required`; either way the tab is closed
and the page offers `login`, which also closes the worker's own tab once the session is lost. The Safari build alone
adds the `scripting` and `alarms` permissions.

Tried on 2026-10-27, Safari on macOS 27 with a USB token, against a local ContApp: login, *Verifică* (CNP, certificate
series, CUIs) and the inbox sync work through the tab. Still to check:

- [ ] A large PDF (tens of MiB) gets through `executeScript`'s result; its size limit in Safari is unknown.
- [ ] `login` answers `cleared` after a lost session (the extension does see the F5 cookies).
- [ ] Safari 18 is the right floor (tried on Safari for macOS 27 only).

Distribution needs an Apple Developer Program membership: either the Mac App Store (unlisted is possible) or a
notarized Developer ID build of the app. Neither is set up, and the release workflow does not build Safari yet.

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

Only URLs under `https://webserviced.anaf.ro/SPVWS2/rest/` are accepted for `fetch` and `login`.

| page sends | extension answers |
|---|---|
| `{type:"ping"}` | `{ok:true, version}` |
| `{type:"fetch", url}` | `{ok:true, status, url, body}` with `body` an ArrayBuffer (structured clone) |
| `{type:"login", url}` | `{ok:true, reset, message?}` after `chrome.tabs.create({url})`, or `{ok:false, error:"network", message}` if the tab cannot be opened |
| `{type:"cancel", id}` | nothing; the pending request with that `id` answers `{ok:false, error:"cancelled"}` |
| any | `{ok:false, error:"certificate_required"\|"session_lost"\|"timeout"\|"cancelled"\|"permission"\|"forbidden_url"\|"forbidden_origin"\|"network"\|"extension"\|"extension_reloaded"\|"unknown_type", message?}` |

- `certificate_required`: `fetch` threw a `TypeError`. That is what Chrome returns when ANAF demands a client
  certificate and no tab can show the picker (`ERR_SSL_CLIENT_AUTH_CERT_NEEDED`), but also for any other
  network-level failure while the browser is online (offline it is `network` with the message `offline`). In Safari it
  also means the SPV tab the worker opened did not load within 30 s (see *Safari* above). The page should offer the
  `login` action.
- `session_lost`: ANAF answered, but not as the SPV REST API: the request was redirected out of
  `https://webserviced.anaf.ro/SPVWS2/rest/` (to F5's login pages, or to anything over `http://`), or a `2xx`/`3xx`
  answer under the prefix was neither JSON nor a PDF (the gateway's own HTML page). No body is handed over. The page
  should offer the `login` action.
- `timeout`: ANAF sent no response headers within 90 s, usually a handshake stuck on a certificate picker or PIN
  prompt that never showed, or the body did not finish within 5 minutes of the headers. The request is aborted so it
  stops holding one of Chrome's six connections to the host. The page should offer the `login` action.
- `cancelled`: a `login` reset the lost session while this fetch was in flight or queued, or the page sent `cancel`
  for it. After a login it is not a failure to show: run the request again once the user is back from the login tab.
- `permission`: the extension has no access to `webserviced.anaf.ro` (revoked in Firefox, or Chrome's site access
  set to "on click"); `message` names the missing grant. The page should ask the user to grant site access.
- `forbidden_url`: the URL, once parsed and normalised the way `fetch` would, is not under the SPV REST prefix
  (so `…/SPVWS2/rest/../x` is refused). The request and the login tab use the normalised URL.
- `network`: anything else went wrong; `message` carries the error text. Besides fetch failures this covers a
  response too large to hand over (above 47 MiB) and a login tab that could not be opened.
- `forbidden_origin`: the request came from a page the extension does not serve. ContApp never sees it in
  practice, since the content script only runs on those hosts.
- `extension`: the content script got no usable answer from the service worker (a worker that died mid-request).
  Retry once; if it persists, reload the ContApp page.
- `extension_reloaded`: the extension was updated or reloaded since this page loaded. Chrome does not bring the
  bridge back into open tabs, so the content script detaches (and removes `data-spv-extension`); only reloading the
  ContApp page helps, so say so instead of retrying.
- `unknown_type`: the `type` is none of the above.

At most four fetches use the network at once; the rest wait their turn. Chrome opens six connections per host,
so two stay free for the login tab even when every fetch is stuck on a handshake.

`reset` in the login reply says what happened to the ANAF session before the tab opened:

- `kept`: the last fetch got a JSON or PDF answer from the SPV REST API, so the session is alive and is left alone (another
  ContApp tab may be syncing with it).
- `cleared`: the session was lost, or unknown after the service worker restarted. Every cookie the browser sends to
  `webserviced.anaf.ro` was deleted, including those set on `.anaf.ro` and partitioned ones, and fetches still in
  flight were cancelled so they stop holding connections. After a failed certificate or PIN check, ANAF's F5
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
extension through `<html data-spv-extension>`, sends `ping`/`fetch`/`login` requests, and ContApp's server
parses the SPV responses it hands back. ContApp's connect form offers only the browser extension as the
way to reach SPV, so any change to the message shapes above must ship in both repositories together.

### End-to-end walkthrough (what the user sees)

1. **Connect the certificate** — ContApp → account menu → *Certificat SPV*. There is nothing to upload:
   click **Conectează**. The page now shows the connected state with *CNP titular* empty and
   *Nesincronizat încă*.
2. **Verify** — click **Verifică**.
   - Without the extension: a callout *Instalează extensia ContApp SPV* appears and the button stays
     disabled. Install, then reload the page.
   - First time in this browser session: a warning toast *ANAF a cerut certificatul…* and a callout with
     the **Autentificare ANAF** button appear. This is expected: a background request cannot show the
     certificate picker.
3. **Authenticate at ANAF** — click **Autentificare ANAF**. A new tab opens on
   `webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60`. The browser shows the certificate picker;
   choose the SPV certificate, then the token asks for its PIN. The tab ends on a raw JSON page (either
   a message list or `{"eroare":…}`). That JSON *is* the success: the browser now holds the ANAF
   session cookie and remembers the certificate for this host. Close the tab or leave it, both work.
   If the tab shows an F5 `/my.policy` page instead, wait for it to redirect; if it stays blank, reload it once.
4. **Verify again** — back in ContApp, click **Verifică**. A success toast *Certificat valid pentru CNP …,
   cu acces la N CUI-uri* appears and the page fills in *CNP titular*, *Serie certificat* and *CUI-uri acces*.
5. **Sync the inbox** — sidebar *Declarații* → *Mesaje SPV* → **Sincronizează SPV**. The toast reports
   how many messages were created, updated and skipped, and the table lists the messages whose CIF matches
   the current company. Messages for CUIs that are not a ContApp company count as *ignorate*.
6. **Download a message** — click the download icon on a row. The extension fetches the PDF from
   `descarcare?id=<anaf id>`, ContApp stores it, the row flips to *Descărcat* and the PDF opens in a new
   tab. From then on the icon links straight to the stored file, with no ANAF round trip.
7. **Session expiry** — when ANAF drops the session (toast *ANAF a cerut certificatul…* again), repeat
   steps 3 and 4. Nothing is lost; synced messages and downloaded PDFs stay in ContApp.
8. **Request a document** — on *Mesaje SPV* click **Cerere nouă**, pick a type (e.g. *D300*) and fill only
   the fields it asks for (year, month, reason, …), then **Trimite cererea**. The extension calls
   `cerere?tip=…&cui=<current company>…` and the toast reads *Cererea <id> a fost transmisă…*. ANAF generates
   the answer later: a following **Sincronizează SPV** lists it as a new message.

Things that are *not* a problem: the login tab showing JSON, the PIN being asked only once per browser
session, the service worker in `chrome://extensions` showing *inactive* between clicks.

### Manual spike test (USB token)

The snippets use `.then` rather than top-level `await`, which Safari's console does not take.

1. Make sure the token middleware is installed and the browser can see the certificate: opening
   `https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60` directly in a tab should show the
   certificate picker and a PIN prompt.
2. Quit and restart the browser so no certificate choice is cached.
3. Load the extension (above). Open any ContApp page and its console (Safari: right-click → *Inspect Element*).
4. Define the helper, then ping. Expect `{ok:true, version:"<version>", ...}`:
   ```js
   var ask = (msg) => new Promise((resolve) => {
       const id = crypto.randomUUID();
       window.addEventListener("message", function onReply(e) {
           if (e.source !== window || e.data?.channel !== "contapp-spv" || e.data.direction !== "reply" || e.data.id !== id) return;
           window.removeEventListener("message", onReply);
           resolve(e.data);
       });
       window.postMessage({ channel: "contapp-spv", id, ...msg }, location.origin);
   });
   var url = "https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60";
   var show = (r) => console.log(JSON.stringify(r.ok ? { status: r.status, url: r.url, text: new TextDecoder().decode(r.body).slice(0, 300) } : r));
   ask({ type: "ping" }).then(show);
   ```
5. Fetch before login, expect `certificate_required`: `ask({ type: "fetch", url }).then(show)`.
6. Login: `ask({ type: "login", url }).then(show)`. Expect `reset: "cleared"`: the fetch in step 5 found no session.
   A tab opens; pick the certificate, enter the PIN, confirm JSON shows, then close the tab. (In Safari the next
   request opens an SPV tab of its own in the background and closes it a minute later.)
7. Fetch again: `ask({ type: "fetch", url }).then(show)`. Expect status 200 and the messages JSON.
8. Download one message: take an `id` from step 7 and run
   `ask({ type: "fetch", url: "https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=<id>" }).then(show)`;
   the text should start with `%PDF`.
9. Forbidden URL: `ask({ type: "fetch", url: "https://example.com/" }).then(show)` → `forbidden_url`.
10. Extension logs: Chrome: `chrome://extensions` → ContApp SPV → **service worker** link → console. Safari: Develop →
    *Web Extension Background Content* → ContApp SPV, with the console filter on *All* (the logs are `console.debug`).

### Spike findings

First run: 2026-10-13, Chrome on Windows, USB token, against staging (the real page flow, not the DevTools spike).

- [x] (1) A service-worker `fetch` succeeds after authenticating once in the login tab: yes — *Sincronizează SPV* listed the inbox.
- [ ] (2) The certificate selection survives closing the login tab: not checked yet.
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
npm install      # web-ext and the Chrome Web Store uploader, the only dev dependencies
npm test         # node:test suites in test/
./build.sh       # dist/chrome, dist/firefox and both zips
npm run lint     # web-ext lint on dist/firefox (run ./build.sh first)
```

`web-ext lint` is Mozilla's linter, so it only runs on the Firefox build: on the Chrome build it always
fails on the missing `background.scripts` fallback and gecko id, which Chrome neither needs nor wants.

To try changes, load the repository folder unpacked in Chrome (it is Chrome-shaped as is and still matches the
local `contapp.test` hosts), or `dist/firefox` in Firefox after `./build.sh`. Reload the extension and the
ContApp tab after each change. `build.sh` strips the `.test` hosts, so release builds only run on
`https://{account,contabilitate,declaratiaunica}.contapp.ro/*`.

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
bumping again; a store that already holds the version will then refuse it, which the last step reports.

Three more steps run only when their secrets are configured, and are skipped otherwise:

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

- [x] Privacy policy: [PRIVACY.md](PRIVACY.md), served by GitHub Pages at <https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY>.
- [ ] Chrome Web Store listing as **unlisted**, single-purpose description, justification for the
      `webserviced.anaf.ro` and `anaf.ro` host permissions, data-usage disclosure matching the privacy policy.
- [ ] Edge Add-ons submission (same package as Chrome; afterwards the release workflow updates it).
- [ ] Firefox: sign `dist/firefox` via AMO (unlisted / self-distributed), keep the `spv@contapp.ro` gecko id
      stable.

### Store listing

- [store/listing.md](store/listing.md): every text and answer to paste into the Chrome Web Store, Edge Partner
  Center and (if asked) AMO forms: descriptions, single purpose, permission justifications, data-usage answers,
  reviewer notes and the assets checklist.
- [PRIVACY.md](PRIVACY.md): the privacy policy (Romanian, then English), published by GitHub Pages at
  <https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY>; that URL goes into every store's privacy-policy field.
- [store/screenshots/](store/screenshots/): the 1280×800 store screenshots listed in `store/listing.md`.
- GitHub Pages is configured in the repository settings (branch `main`, folder `/`), not in a workflow;
  `_config.yml` keeps the scripts and tests out of the published site.

## Known limitations

- The content script runs on `https://{account,contabilitate,declaratiaunica}.contapp.ro/*`, and replies go to the whole page through `window.postMessage`: any
  script those pages load, third-party ones included, can drive the proxy and read the SPV answers. Keep those
  pages free of scripts ContApp does not control, and drop a host from `matches` once it no longer needs SPV.
