# Store listing — ContApp SPV

Everything to copy-paste when creating the store items by hand. After the first submission the release workflow
only ships new versions; these texts change only when edited here.

## Common

| Field | Value                                                                          |
|---|--------------------------------------------------------------------------------|
| Name | `ContApp SPV`                                                                  |
| Category | Productivity (if a subcategory is asked, pick the closest workflow/tools one)  |
| Language | Romanian                                                                       |
| Homepage | `https://contapp.ro`                                                           |
| Support URL | `https://contapp.ro/contact`                                                   |
| Support e-mail | `suport@contapp.ro`                                                            |
| Privacy policy URL | `https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY` |
| Visibility | Chrome: *Unlisted* · Edge: *Hidden* · Firefox: unlisted / self-distributed · Mac App Store: unlisted |

### Short description

Chrome shows the manifest `description` as the summary (limit 132 characters), so the Romanian text is exactly the
one in `manifest.json`. Change both together. Chrome only offers a listing in the locales present in a `_locales/`
directory, and the extension ships none, so on the Chrome Web Store the EN texts below cannot be entered; they are for
Edge Partner Center (which has its own per-language fields) and for AMO if a listing is ever created.

RO (92 characters):

```
Permite ContApp să citească mesajele din SPV ANAF folosind certificatul digital din browser.
```

EN (90 characters):

```
Lets ContApp read ANAF SPV messages using the digital certificate already in your browser.
```

### Detailed description — RO

```
ContApp SPV conectează aplicația ContApp la Spațiul Privat Virtual (SPV) al ANAF folosind certificatul digital calificat pe care îl aveți deja în browser (token USB sau certificat în cloud).

Ce face
• Citește lista mesajelor din SPV, ca să le vedeți în ContApp la firma potrivită.
• Descarcă documentele PDF din mesaje; ContApp le păstrează apoi în contul dumneavoastră.
• Trimite către ANAF cererile de documente completate în ContApp; răspunsul apare ulterior ca mesaj nou.

Serviciul SPV al ANAF răspunde numai după autentificarea cu certificat, iar o pagină web nu poate citi singură răspunsul. Extensia face legătura: pagina ContApp îi cere o adresă din serviciul SPV, browserul face autentificarea cu certificatul, iar extensia predă răspunsul ANAF, neschimbat, paginii ContApp.

Pentru cine este
Pentru clienții ContApp (firme și contabili) care au un certificat digital cu acces la SPV. Aveți nevoie de un cont ContApp și de certificat pe calculatorul respectiv, cu programul tokenului sau al semnăturii în cloud instalat. Fără un cont ContApp, extensia nu are nicio utilitate.

Ce nu face
• Nu vede PIN-ul și nu are acces la cheia privată: PIN-ul este cerut de programul tokenului sau de sistemul de operare.
• Nu stochează nimic și nu are pagină de setări.
• Nu face nimic din proprie inițiativă: nu verifică singură SPV și acționează doar când o pagină ContApp îi cere.
• Nu accesează alte site-uri decât serviciul SPV al ANAF și paginile ContApp.
• Nu folosește analiză de trafic, reclame sau cod încărcat de pe internet.

Instalare și dezinstalare
Instalați extensia din ContApp: pagina Certificat SPV afișează mesajul „Instalează extensia ContApp SPV” cu legătura de instalare. După instalare reîncărcați pagina ContApp. Pentru dezinstalare: pagina de extensii a browserului → ContApp SPV → Eliminați. Mesajele și documentele deja sincronizate rămân în ContApp.

Suport: suport@contapp.ro
```

### Detailed description — EN

```
ContApp SPV connects the ContApp application to ANAF's Virtual Private Space (SPV), the Romanian tax authority's online inbox, using the qualified digital certificate you already have in your browser (USB token or cloud certificate).

What it does
• Reads the SPV message list, so you see the messages in ContApp under the right company.
• Downloads the PDF documents attached to messages; ContApp then keeps them in your account.
• Sends to ANAF the document requests you fill in on ContApp; the answer later arrives as a new message.

ANAF's SPV service only answers after certificate authentication, and a web page cannot read the answer by itself. The extension bridges the gap: the ContApp page asks it for an SPV address, the browser performs the certificate authentication, and the extension hands ANAF's response, unchanged, back to the ContApp page.

Who it is for
ContApp customers (businesses and accountants) who hold a digital certificate with SPV access. You need a ContApp account and the certificate on that computer, with the token or cloud-signature software installed. Without a ContApp account the extension does nothing useful.

What it does not do
• It never sees the PIN and has no access to the private key: the PIN is asked by the token software or the operating system.
• It stores nothing and has no settings page.
• It does nothing on its own initiative: it does not check SPV on its own and only acts when a ContApp page asks.
• It does not access any site other than ANAF's SPV service and ContApp pages.
• It uses no analytics, no advertising and no code loaded from the internet.

Install and uninstall
Install the extension from ContApp: the SPV certificate page shows the "Instalează extensia ContApp SPV" callout with the install link. Reload the ContApp page after installing. To uninstall: the browser's extensions page → ContApp SPV → Remove. Messages and documents already synced stay in ContApp.

Support: suport@contapp.ro
```

## Chrome Web Store → Privacy tab

### Single purpose

RO:

```
Extensia are un singur scop: permite aplicației ContApp să citească serviciul SPV al ANAF (https://webserviced.anaf.ro/SPVWS2/rest/) folosind certificatul digital calificat al utilizatorului. O pagină ContApp deschisă de utilizator îi cere o adresă SPV (lista mesajelor, descărcarea unui mesaj, o cerere de document); extensia face cererea, browserul realizează autentificarea TLS reciprocă (mutual TLS) cu certificatul, iar extensia întoarce răspunsul ANAF, neschimbat, paginii ContApp. Extensia refuză orice altă adresă, nu stochează date și acționează numai la cererea paginii ContApp.
```

EN:

```
The extension has a single purpose: it lets the ContApp application read ANAF's SPV web service (https://webserviced.anaf.ro/SPVWS2/rest/) using the user's qualified digital certificate. A ContApp page the user opened asks it for an SPV address (message list, message download, document request); the extension makes the request, the browser performs the mutual-TLS handshake with the certificate, and the extension returns ANAF's response, unchanged, to the ContApp page. It refuses any other address, stores no data and only acts when the ContApp page asks.
```

### Permission justifications

The only API permission is `cookies`:

```
When the user clicks "Autentificare ANAF" in ContApp and the ANAF session no longer works, the extension deletes the cookies the browser sends to webserviced.anaf.ro (chrome.cookies.getAll for anaf.ro, keeping only the cookies that reach webserviced.anaf.ro, then chrome.cookies.remove) before opening the login tab. After a failed certificate or PIN check, ANAF's gateway keeps answering the stale session cookie with an error page, so without this the user cannot log in again until the session expires. The extension uses the cookies it lists only to delete them: it never uses, stores or transmits cookie values, never sets cookies and never touches cookies of any other site.
```

Opening the ANAF login tab (`chrome.tabs.create`) needs no permission; if a form asks why the extension opens tabs:

```
When the user clicks "Autentificare ANAF" in ContApp, the extension opens the ANAF SPV address in a new tab (chrome.tabs.create, which needs no permission). A request made by the service worker cannot show the browser's client-certificate picker or the token's PIN prompt; a visible tab can. After the user picks the certificate in that tab, the browser can reuse it for the extension's requests. The extension does not query or read any tab.
```

Host permissions `*://webserviced.anaf.ro/*` and `*://anaf.ro/*`:

```
ANAF's SPV web service only answers over mutual TLS and sends no CORS headers, so a web page cannot read its responses. The service worker fetches the SPV URL the ContApp page asked for, with credentials included, so the browser performs the client-certificate handshake. The code accepts only URLs starting with https://webserviced.anaf.ro/SPVWS2/rest/ and rejects everything else; it never makes HTTP requests and never requests anything from anaf.ro.

The other two parts of the patterns exist only for the login's cookie reset described under the cookies permission: chrome.cookies lists and removes a cookie only when the extension has host access to the cookie's domain, over http:// for a cookie without the Secure attribute, and to anaf.ro itself for a cookie set on .anaf.ro, which the browser also sends to webserviced.anaf.ro.
```

Content script on `https://{account,contabilitate,declaratiaunica}.contapp.ro/*`:

```
The content script is the bridge between the ContApp page and the service worker: it receives the page's requests through window.postMessage (same origin only), forwards them to the service worker and posts the answer back. It also marks the page (data-spv-extension attribute) so ContApp knows the extension is installed. It runs only on the ContApp application hosts, and the service worker refuses requests from any other page.
```

Remote code: **No, I am not using remote code.**

```
All code ships in the package (background.js, content.js); nothing is downloaded or evaluated at runtime.
```

### Data usage

Categories collected: tick **Personally identifiable information** and **Financial and payment information**; leave
Health information, Authentication information, Personal communications, Location, Web history, User activity and
Website content unticked.

Reasoning: Chrome counts transmitting and sharing as handling user data and requires the disclosure to match the
privacy policy, which lists the certificate holder's CNP, CUIs and tax documents. The extension stores nothing and
sends nothing to its publisher directly, but it relays ANAF's response to the ContApp page the user opened, and that
page sends it to ContApp's server under the user's own account. The certificate and PIN are never read, and the ANAF
cookies are only listed to be deleted, never used, stored or sent, so *Authentication information* stays unticked. The Firefox build declares the same two categories in
`data_collection_permissions` (see `build.sh`).

Certifications, all three ticked:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: `https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY`

### Notes for the reviewer

```
ContApp SPV is a companion extension for ContApp (https://contapp.ro), an online accounting application for Romanian businesses and accountants. It is distributed unlisted and installed from inside the ContApp app.

Testing it end to end needs two things a reviewer normally does not have: a ContApp account and a Romanian qualified digital certificate with access to ANAF's SPV (Spațiul Privat Virtual) on a USB token or cloud HSM. The flow is:
1. In ContApp, the SPV certificate page detects the extension (the content script sets <html data-spv-extension="<version>">).
2. ContApp asks the extension, via window.postMessage, to fetch https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60. The service worker fetches it with credentials; the first time, the request fails because no certificate has been chosen yet.
3. The user clicks "Autentificare ANAF"; the extension opens that ANAF URL in a new tab (chrome.tabs.create, no extra permission), the browser shows the certificate picker and the token asks for its PIN.
4. Back in ContApp, the same fetch now succeeds; the extension returns the JSON (or, for descarcare?id=..., the PDF bytes) to the ContApp page.

Without a certificate you can still check: on https://contabilitate.contapp.ro (or another ContApp application host), the extension answers a {channel:"contapp-spv", type:"ping"} message with its version, rejects any URL outside https://webserviced.anaf.ro/SPVWS2/rest/ with "forbidden_url", and a fetch of an SPV URL returns "certificate_required". The source is two short files, background.js and content.js.

We can send a screencast of the full flow with a real certificate on request: suport@contapp.ro.
```

## Edge Add-ons (Partner Center)

Same package as Chrome (`contapp-spv-chrome-<version>.zip`). Fields Partner Center asks for:

| Section | Field | Value |
|---|---|---|
| Availability | Visibility | **Hidden** (install only by direct link) |
| Availability | Markets | All markets (Romania is the only one that matters) |
| Properties | Category | Productivity |
| Properties | Privacy policy required | Yes → `https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY` |
| Properties | Website URL | `https://contapp.ro` |
| Properties | Support contact | `suport@contapp.ro` (or the support URL above) |
| Properties | Mature content | No |
| Store listing (Romanian; add English as a second language) | Description | Detailed description above (Edge requires at least 250 characters) |
| Store listing | Short description | Read-only: Edge takes it from the manifest `description` |
| Store listing | Extension logo | `store/icon-512.png` (Edge asks for 1:1, 128×128 minimum; 300×300 recommended) |
| Store listing | Screenshots | `store/screenshots/*.png`, 1280×800 |
| Store listing | Small / large promotional tile, YouTube video | Small tile: `store/promo-440x280.png`; large tile and video: leave empty |
| Store listing | Search terms | `contapp`, `SPV`, `ANAF`, `certificat digital`, `declarații`, `contabilitate` |
| Submission | Notes for certification | Same text as *Notes for the reviewer* above |

## Firefox (AMO)

Nothing to fill: the first `web-ext sign` run in the release workflow creates the add-on (`spv@contapp.ro`) as
unlisted / self-distributed, with no listing page.

If AMO asks for review notes or source code:

```
ContApp SPV is a companion extension for ContApp (https://contapp.ro), a Romanian online accounting application. It relays requests from ContApp pages to ANAF's SPV web service (https://webserviced.anaf.ro/SPVWS2/rest/) so the browser can authenticate with the user's client certificate, and returns the raw response to the ContApp page. It stores nothing itself; because the relayed SPV responses carry the certificate holder's CNP, CUIs and tax documents, which the ContApp page then stores in the user's account, the manifest declares data_collection_permissions.required = [personallyIdentifyingInfo, financialAndPaymentInfo] (Firefox 140+ shows this in the install prompt).

Source: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension (public). There is no transpilation, bundling or minification: build.sh copies background.js, content.js and the PNG icons into dist/firefox and uses jq to rewrite manifest.json (background.scripts instead of background.service_worker, plus the data_collection_permissions declaration). To reproduce: ./build.sh (requires jq and zip).

Testing end to end needs a ContApp account and a Romanian qualified certificate with SPV access; a screencast is available on request at suport@contapp.ro.
```

## Mac App Store (Safari)

Safari only installs extensions carried by a macOS app, so the Safari build is listed as a Mac app (`ro.contapp.spv`,
the Xcode project in `safari/`). Fields in App Store Connect, in the order it asks for them. The limits are Apple's;
the counts are of the texts below.

### New app

| Field | Value |
|---|---|
| Platform | macOS |
| Name (max 30) | `ContApp SPV` |
| Primary language | Romanian |
| Bundle ID | `ro.contapp.spv` (register it first: developer.apple.com → Identifiers → App IDs, with `ro.contapp.spv.Extension`) |
| SKU | `contapp-spv-macos` |

### App information

| Field | Value |
|---|---|
| Subtitle (max 30) | RO `Mesaje SPV ANAF în ContApp` (26) · EN `ANAF SPV messages in ContApp` (28) |
| Primary category | Productivity |
| Secondary category | Business |
| Content rights | No third-party content |
| Age rating | Every question *None* / *No* → 4+ |
| Copyright | `2026 Kronos IT Support & Consulting S.R.L.` |
| Support URL | `https://contapp.ro/contact` |
| Marketing URL | `https://contapp.ro` |
| Privacy policy URL | `https://kronos-it-support-consulting.github.io/contapp-spv-extension/PRIVACY` |
| Price | Free · Availability: all countries (Romania is the only one that matters) |

Keywords (max 100, comma-separated, no spaces after commas; the name and subtitle already count, so they are not
repeated):

RO (94 characters):

```
spv,anaf,certificat digital,token,declaratii,contabilitate,fiscal,mesaje,cerere,contabil,firma
```

EN (95 characters):

```
spv,anaf,romania,tax,digital certificate,token,accounting,accountant,declaration,messages,inbox
```

Promotional text (max 170; can change without a new review):

RO (161 characters):

```
Sincronizați mesajele din SPV ANAF în ContApp direct din Safari, cu certificatul digital pe care îl aveți deja. Nicio încărcare de certificat, niciun PIN salvat.
```

EN (147 characters):

```
Sync your ANAF SPV messages into ContApp straight from Safari, with the digital certificate you already have. No certificate upload, no stored PIN.
```

### Description — RO

```
ContApp SPV aduce în ContApp mesajele din Spațiul Privat Virtual (SPV) al ANAF, folosind certificatul digital calificat pe care îl aveți deja în Safari (token USB sau certificat din Keychain).

Aplicația conține extensia de Safari ContApp SPV. După instalare, o activați o singură dată din Safari → Configurări → Extensii; aplicația vă arată unde.

Ce face
• Citește lista mesajelor din SPV, ca să le vedeți în ContApp la firma potrivită.
• Descarcă documentele PDF din mesaje; ContApp le păstrează apoi în contul dumneavoastră.
• Trimite către ANAF cererile de documente completate în ContApp; răspunsul apare ulterior ca mesaj nou.

Serviciul SPV al ANAF răspunde numai după autentificarea cu certificat, iar o pagină web nu poate citi singură răspunsul. Extensia face legătura: pagina ContApp îi cere o adresă din serviciul SPV, Safari face autentificarea cu certificatul, iar extensia predă răspunsul ANAF, neschimbat, paginii ContApp. În timpul sincronizării, Safari deschide pentru scurt timp un tab ANAF, pe care extensia îl închide singură.

Pentru cine este
Pentru clienții ContApp (firme și contabili) care au un certificat digital cu acces la SPV. Aveți nevoie de un cont ContApp și de certificat pe acest Mac, cu programul tokenului instalat. Fără un cont ContApp, aplicația nu are nicio utilitate.

Ce nu face
• Nu vede PIN-ul și nu are acces la cheia privată: PIN-ul este cerut de macOS sau de programul tokenului.
• Nu stochează nimic și nu are setări proprii.
• Nu face nimic din proprie inițiativă: acționează doar când o pagină ContApp îi cere.
• Nu accesează alte site-uri decât serviciul SPV al ANAF și paginile ContApp.
• Nu folosește analiză de trafic, reclame sau cod încărcat de pe internet.

Dezinstalare: ștergeți aplicația ContApp SPV din dosarul Aplicații. Mesajele și documentele deja sincronizate rămân în ContApp.

Suport: suport@contapp.ro
```

### Description — EN

```
ContApp SPV brings the messages from ANAF's Virtual Private Space (SPV), the Romanian tax authority's online inbox, into ContApp, using the qualified digital certificate you already have in Safari (USB token or a certificate in the Keychain).

The app carries the ContApp SPV Safari extension. After installing, turn it on once in Safari → Settings → Extensions; the app shows you where.

What it does
• Reads the SPV message list, so you see the messages in ContApp under the right company.
• Downloads the PDF documents attached to messages; ContApp then keeps them in your account.
• Sends to ANAF the document requests you fill in on ContApp; the answer later arrives as a new message.

ANAF's SPV service only answers after certificate authentication, and a web page cannot read the answer by itself. The extension bridges the gap: the ContApp page asks it for an SPV address, Safari performs the certificate authentication, and the extension hands ANAF's response, unchanged, back to the ContApp page. While syncing, Safari briefly opens an ANAF tab, which the extension closes by itself.

Who it is for
ContApp customers (businesses and accountants) who hold a digital certificate with SPV access. You need a ContApp account and the certificate on this Mac, with the token software installed. Without a ContApp account the app does nothing useful.

What it does not do
• It never sees the PIN and has no access to the private key: the PIN is asked by macOS or the token software.
• It stores nothing and has no settings of its own.
• It does nothing on its own initiative: it only acts when a ContApp page asks.
• It does not access any site other than ANAF's SPV service and ContApp pages.
• It uses no analytics, no advertising and no code loaded from the internet.

To uninstall, delete ContApp SPV from the Applications folder. Messages and documents already synced stay in ContApp.

Support: suport@contapp.ro
```

### Screenshots

Mac screenshots must be 16:10; the 1280×800 files in `store/screenshots/` qualify. Upload `01` to `05`. `06-instalare.png`
shows Chrome: replace it for this listing with Safari → Settings → Extensions → ContApp SPV turned on, with its website
access (`webserviced.anaf.ro`, the ContApp hosts) allowed, at 1280×800. The App Store shows no captions.

### App Privacy

Apple counts data as collected when it leaves the device and the developer keeps it longer than the request needs.
The extension hands ANAF's answers to the ContApp page, which stores them in the user's ContApp account, so this
matches the Chrome *Data usage* answers and the Firefox `data_collection_permissions`.

| Question | Answer |
|---|---|
| Do you collect data from this app? | Yes |
| Data types | **Financial Info → Other Financial Info** (tax documents, CUIs) · **Other Data → Other Data Types** (the certificate holder's CNP in the SPV answers) |
| For each: linked to the user's identity? | Yes (stored in their ContApp account) |
| For each: used for tracking? | No |
| For each: purposes | App Functionality only |

Everything else (contact info, health, location, identifiers, usage data, diagnostics, browsing history…): not collected.

### Encryption

Nothing to answer: the app declares `ITSAppUsesNonExemptEncryption = NO` (it only uses macOS's HTTPS).

### App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes. Give a ContApp test account (user and password) whose company has the SPV pages; without a certificate it still shows the extension being detected and the login prompt |
| Contact | Name, phone and `suport@contapp.ro` |
| Attachment | A screen recording of the full flow in Safari with a real certificate (see the notes) |
| Release | **Manually release this version** |

Notes:

```
ContApp SPV is the Safari version of a companion extension for ContApp (https://contapp.ro), an online accounting application for Romanian businesses and accountants. The app itself only tells the user how to turn the extension on; the extension does the work inside Safari. It is meant to be distributed unlisted, from a link inside ContApp; we are requesting unlisted distribution.

Using it end to end needs a Romanian qualified digital certificate with access to ANAF's SPV (Spațiul Privat Virtual) on a USB token, which a reviewer normally does not have. The attached recording shows the whole flow with a real certificate:
1. In Safari, turn on ContApp SPV (Settings → Extensions) and allow it on webserviced.anaf.ro and the ContApp site.
2. On ContApp's SPV certificate page the extension is detected (the content script marks the page).
3. ContApp asks the extension for https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60. Safari does not attach the client certificate to requests from an extension's background, so the extension runs the request from an ANAF tab: when none is open it opens one in the background, and closes it a minute after the last request.
4. The first time there is no ANAF session yet: ContApp shows "Autentificare ANAF", which opens the ANAF address in a tab, where macOS asks for the certificate and the token for its PIN.
5. Back in ContApp, the request succeeds and the extension returns ANAF's JSON (or, for a document download, the PDF) to the ContApp page.

Without a certificate you can still check, with the test account above: the extension is detected on the ContApp page, a sync request opens and closes the background ANAF tab and ends with ContApp asking for the ANAF login, and the extension refuses any address outside https://webserviced.anaf.ro/SPVWS2/rest/. Permissions: the extension uses cookies (to clear a dead ANAF session before a new login), scripting (to run the SPV request in the ANAF tab) and alarms (to close that tab). The source is public: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension

Contact: suport@contapp.ro
```

### Unlisted distribution request

At <https://developer.apple.com/contact/request/unlisted-app/>, once the app exists in App Store Connect (its Apple ID
is under App Information):

```
ContApp SPV is only useful to customers of ContApp (https://contapp.ro), an online accounting application for Romanian businesses and accountants: it carries a Safari extension that lets ContApp read the ANAF SPV inbox with the user's own digital certificate. It does nothing without a ContApp account and a Romanian qualified certificate. Customers install it from a direct link shown inside ContApp, next to the Chrome, Edge and Firefox versions of the same extension, which are also distributed unlisted. Listing it publicly would only reach people who cannot use it.
```

## Assets checklist

- [x] Icon 128×128: `icons/icon-128.png`
- [x] Screenshots 1280×800 in `store/screenshots/`:

  | File | Caption (RO) |
  |---|---|
  | `01-mesaje-spv.png` | Mesajele SPV ale firmei, listate în ContApp. |
  | `02-sincronizare.png` | Sincronizarea mesajelor SPV dintr-un singur clic. |
  | `03-cerere-noua.png` | Cerere nouă de document către ANAF, trimisă din ContApp. |
  | `04-certificat.png` | Certificatul SPV verificat: CNP titular și CUI-urile la care are acces. |
  | `05-autentificare-anaf.png` | Autentificarea la ANAF: browserul cere certificatul, iar tokenul cere PIN-ul. |
  | `06-instalare.png` | Instalarea extensiei din ContApp. |

- [x] Small promo tile 440×280 (PNG, RGB, no alpha): `store/promo-440x280.png`
- [x] Mac app icon, every size: in the Xcode project, rendered by `safari/app-icon.swift`
- [ ] Safari version of `06-instalare.png` for the Mac App Store (Safari → Settings → Extensions), 1280×800
