# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A Safari (macOS) build: `build.sh` also writes `dist/safari` (`SAFARI_DEV=1` keeps the `contapp.test` hosts), and
  `safari.sh` wraps it in the Xcode project Safari needs. In Safari the SPV requests run in an ANAF tab, since a
  background request does not carry the client certificate and ANAF ends the session for it. Without one open, the
  extension opens its own in the background and closes it after a minute without requests.
- The Safari app is ready for the Mac App Store: version 1.0.0, *Productivity* category, no non-exempt encryption,
  an app icon rendered from `icons/icon.svg` (`safari/app-icon.swift`) and a Romanian app window. `safari.sh` no
  longer overwrites the committed Xcode project.
- A `session_lost` answer is logged in the worker's console with the status and the URL it ended on.

### Changed

- The development hosts mirror the production ones: `https://{account,contabilitate,declaratiaunica}.contapp.test/*`
  instead of every `contapp.test` host.
- The content script only runs on `https://{account,contabilitate,declaratiaunica}.contapp.ro/*`, and the service worker only answers this extension's content script on
  those hosts (`forbidden_origin` otherwise).
- Each request travels over its own runtime port. The page can send `{type:"cancel", id}`, and a tab that closes or
  navigates away aborts its fetches, so they stop holding a connection slot.
- A fetch that ends outside the SPV REST API (F5's login pages, or anything over `http://`), or a `2xx`/`3xx` answer
  under it that is neither JSON nor a PDF, answers `session_lost` without a body instead of `ok:true`.
- A ContApp tab left open across an extension update or reload answers `extension_reloaded` and detaches, instead of
  `extension` on every request.
- A failed fetch while the browser is offline answers `network` (`offline`) instead of `certificate_required`.

- A fetch cancelled by a login answers `cancelled` instead of `network` with the message
  `cancelled by the ANAF login`, and a fetch without the ANAF host permission answers `permission` instead of
  `network`, so the page can tell them apart without matching text.
- A session only counts as alive (and is kept at the next `login`) when the last fetch got a JSON or PDF answer:
  an HTML page the F5 gateway serves under the SPV prefix now clears the cookies like a redirect does.

### Fixed

- A response body that stalls after the headers times out after 5 minutes instead of holding its slot and keeping
  the service worker awake for good.
- A JSON answer that starts with a byte order mark or more than a few blank bytes counts as a live session.

### Security

- Release workflow: the zips are built before any dependency code runs, checked against their recorded SHA-256
  before every upload, and published from a job in the `store` environment; `GH_TOKEN` no longer reaches
  `web-ext sign`.
- Release zips are reproducible: file times are the commit time and entries are sorted.

## [1.4.0] — 2026-10-16

### Fixed

- The login's cookie reset can see and delete every ANAF session cookie in Chrome: the extension now has host
  access to `anaf.ro` (for cookies set on `.anaf.ro`) and over `http://` (for cookies without the Secure attribute),
  without which Chrome leaves those cookies out of `cookies.getAll`. It still only requests
  `https://webserviced.anaf.ro/SPVWS2/rest/`.
- A login on a lost session also cancels the fetches queued behind the stuck ones, and fetches sent while the
  cookies are being cleared wait for it, so none goes out with the dead session.

### Security

- Release workflow: the GitHub token reaches only the two steps that call `gh` and is no longer written into
  `.git/config`, `npm ci` runs with `--ignore-scripts`, and actions are pinned to commit SHAs.

## [1.3.0] — 2026-10-16

### Changed

- A fetch that gets no response headers within 90 s answers `timeout`. A handshake stuck on a certificate picker or
  PIN prompt that never showed used to hang forever and hold one of the browser's connections to ANAF, so after a
  few retries every request, the login tab included, queued behind them until the browser restarted. Once the
  headers arrive the deadline stops, so a slow download of a large response is not cut off.
- At most four fetches use the network at once; the rest wait, so two of Chrome's six connections per host stay
  free for the login tab.
- `login` resets a lost ANAF session before it opens the tab: it deletes the browser's `webserviced.anaf.ro`
  cookies and cancels the fetches still stuck on it, so a session ANAF's gateway marked as failed no longer sends
  every new login to its error page. A live session is kept. The reply carries `reset: "kept" | "cleared" |
  "failed"`. This adds the `cookies` permission.
- Chrome and Edge 119 are the minimum versions.

## [1.2.0] — 2026-10-14

### Security

- URLs are parsed and normalised before the SPV prefix check, so `…/SPVWS2/rest/../x` no longer reaches another
  path on the ANAF host; the request and the login tab use the normalised URL.
- The `tabs` permission is gone: opening the login tab never needed it, and it made Chrome warn about reading
  browsing history.
- Release workflow: store secrets are scoped to the step that uses them, the Chrome Web Store uploader is a pinned
  dev dependency instead of an unpinned `npx` download, and a pushed `v*` tag is only released when its commit is
  on `main`.

### Changed

- The Firefox build declares `data_collection_permissions` as personally identifying and financial information
  (the relayed SPV responses), which Firefox 140+ shows in the install prompt; Firefox 140 and Chrome 110 are the
  minimum versions.
- A fetch now answers `network` (with a message) instead of `certificate_required` when the ANAF host permission
  has been revoked, and when the response is too large to hand to the page (above 47 MiB).
- The service worker keeps itself alive while an SPV response is pending, so a slow download no longer dies with
  Chrome's idle timeout.
- Release workflow: one release at a time; a re-run after a partial failure reuses the version and refreshes the
  assets instead of bumping again; every configured store is attempted even when another one fails; the Edge
  Add-ons step reports API errors instead of waiting them out.
- Store zips contain only the PNG icons the manifest references.
- Privacy policy and store texts: cookies, background behaviour, data categories and the processor's legal entity
  are stated as they are; rights and the ANSPDCP address follow the official wording.

### Fixed

- A reply the content script cannot decode now answers `extension` instead of leaving the page waiting forever.
- Sandboxed (opaque-origin) ContApp documents get no bridge instead of a bridge whose replies throw.

## [1.1.0] — 2026-10-14

### Added

- Release workflow publishes to Edge Add-ons when its secrets are configured.
- MIT licence, security policy, contribution guide, code owners, Dependabot and a pull request template.
- Store listing texts, the 512 px store icon and six 1280×800 screenshots in `store/`.
- CI checks that release manifests carry only production hosts.

### Changed

- Release: Actions → Release → Run workflow bumps the version from the latest tag and releases `main`; the tag is the only version source.
- Name and texts spell the brand ContApp.
- Icons use the ContApp mark in brand green with an "SPV" badge (toolbar size: the mark alone); sources in `icons/icon.svg` and `icons/icon-small.svg`, store icon in `store/icon-512.png`.
- Privacy policy follows GDPR Art. 13 (controller details, DPO, purposes and legal bases, recipients, transfers, retention, rights, ANSPDCP) and is published from `PRIVACY.md` by GitHub Pages.
- Release builds only match `https://*.contapp.ro/*`.
- `shell-quote` (a dev-only dependency of `web-ext`) is overridden to a patched version.

## [1.0.0] — 2026-10-13

First standalone release, moved out of the ContApp application repository.

### Added

- `ping` answers the extension version; the version is also exposed as `<html data-spv-extension>` on
  ContApp pages.
- `fetch` proxies a GET to ANAF SPV with the browser's client certificate and returns status, final URL and
  the body as an ArrayBuffer; a missing certificate is reported as `certificate_required`.
- `login` opens the SPV URL in a new tab so the browser can show the certificate picker and PIN prompt.
- Only URLs under `https://webserviced.anaf.ro/SPVWS2/rest/` are accepted; everything else answers
  `forbidden_url`.
- Chrome/Edge and Firefox builds, zipped by `build.sh` and attached to each GitHub release.

[Unreleased]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension/releases/tag/v1.0.0
