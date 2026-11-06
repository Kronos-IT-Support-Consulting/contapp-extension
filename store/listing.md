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
| Visibility | Chrome: *Unlisted* · Edge: *Hidden* · Firefox: unlisted / self-distributed     |

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
• Depune la ANAF, pe portalul de declarații, declarația PDF semnată pe care o alegeți în ContApp și predă paginii ContApp confirmarea depunerii, cu indexul de înregistrare.

Serviciul SPV și portalul de declarații ale ANAF răspund numai după autentificarea cu certificat, iar o pagină web nu poate citi singură răspunsul. Extensia face legătura: pagina ContApp îi cere o adresă din serviciul SPV, browserul face autentificarea cu certificatul, iar extensia predă răspunsul ANAF, neschimbat, paginii ContApp.

Pentru cine este
Pentru clienții ContApp (firme și contabili) care au un certificat digital cu acces la SPV. Aveți nevoie de un cont ContApp și de certificat pe calculatorul respectiv, cu programul tokenului sau al semnăturii în cloud instalat. Fără un cont ContApp, extensia nu are nicio utilitate.

Ce nu face
• Nu vede PIN-ul și nu are acces la cheia privată: PIN-ul este cerut de programul tokenului sau de sistemul de operare.
• Nu stochează nimic și nu are pagină de setări.
• Nu face nimic din proprie inițiativă: nu verifică singură SPV și acționează doar când o pagină ContApp îi cere.
• Nu accesează alte site-uri decât serviciul SPV al ANAF, portalul de depunere a declarațiilor al ANAF și paginile ContApp.
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
• Files with ANAF, on its declaration portal, the signed PDF declaration you choose in ContApp, and hands the filing confirmation with its registration index back to the ContApp page.

ANAF's SPV service and declaration portal only answer after certificate authentication, and a web page cannot read the answer by itself. The extension bridges the gap: the ContApp page asks it for an SPV address, the browser performs the certificate authentication, and the extension hands ANAF's response, unchanged, back to the ContApp page.

Who it is for
ContApp customers (businesses and accountants) who hold a digital certificate with SPV access. You need a ContApp account and the certificate on that computer, with the token or cloud-signature software installed. Without a ContApp account the extension does nothing useful.

What it does not do
• It never sees the PIN and has no access to the private key: the PIN is asked by the token software or the operating system.
• It stores nothing and has no settings page.
• It does nothing on its own initiative: it does not check SPV on its own and only acts when a ContApp page asks.
• It does not access any site other than ANAF's SPV service, ANAF's declaration filing portal and ContApp pages.
• It uses no analytics, no advertising and no code loaded from the internet.

Install and uninstall
Install the extension from ContApp: the SPV certificate page shows the "Instalează extensia ContApp SPV" callout with the install link. Reload the ContApp page after installing. To uninstall: the browser's extensions page → ContApp SPV → Remove. Messages and documents already synced stay in ContApp.

Support: suport@contapp.ro
```

## Chrome Web Store → Privacy tab

### Single purpose

RO:

```
Extensia are un singur scop: permite aplicației ContApp să comunice cu serviciile ANAF care cer certificatul digital calificat al utilizatorului, adică serviciul SPV (https://webserviced.anaf.ro/SPVWS2/rest/) și portalul de depunere a declarațiilor (https://decl.anaf.mfinante.gov.ro/WAS6DUS/). O pagină ContApp deschisă de utilizator îi cere o adresă SPV (lista mesajelor, descărcarea unui mesaj, o cerere de document) sau îi dă declarația PDF semnată pe care utilizatorul a ales să o depună; extensia face cererea, browserul realizează autentificarea TLS reciprocă (mutual TLS) cu certificatul, iar extensia întoarce răspunsul ANAF, neschimbat, paginii ContApp. Extensia refuză orice altă adresă, nu stochează date și acționează numai la cererea paginii ContApp.
```

EN:

```
The extension has a single purpose: it lets the ContApp application talk to the ANAF services that require the user's qualified digital certificate, namely the SPV web service (https://webserviced.anaf.ro/SPVWS2/rest/) and the declaration filing portal (https://decl.anaf.mfinante.gov.ro/WAS6DUS/). A ContApp page the user opened asks it for an SPV address (message list, message download, document request) or hands it the signed PDF declaration the user chose to file; the extension makes the request, the browser performs the mutual-TLS handshake with the certificate, and the extension returns ANAF's response, unchanged, to the ContApp page. It refuses any other address, stores no data and only acts when the ContApp page asks.
```

### Permission justifications

The only API permission is `cookies`:

```
When the user clicks "Autentificare ANAF" in ContApp and the ANAF session of that server no longer works, the extension deletes the cookies the browser sends to that server before opening the login tab: for SPV, chrome.cookies.getAll for anaf.ro, keeping only the cookies that reach webserviced.anaf.ro; for the declaration portal, chrome.cookies.getAll for decl.anaf.mfinante.gov.ro; then chrome.cookies.remove. Each server's session is reset on its own; the other one is left alone. After a failed certificate or PIN check, ANAF's gateway keeps answering the stale session cookie with an error page, so without this the user cannot log in again until the session expires. The extension uses the cookies it lists only to delete them: it never uses, stores or transmits cookie values, never sets cookies and never touches cookies of any other site.
```

Opening the ANAF login tab (`chrome.tabs.create`) needs no permission; if a form asks why the extension opens tabs:

```
When the user clicks "Autentificare ANAF" in ContApp, the extension opens the ANAF SPV address, or the declaration portal's start page https://decl.anaf.mfinante.gov.ro/, in a new tab (chrome.tabs.create, which needs no permission). A request made by the service worker cannot show the browser's client-certificate picker or the token's PIN prompt; a visible tab can. After the user picks the certificate in that tab, the browser can reuse it for the extension's requests. The declaration portal's tab is closed again (chrome.tabs.remove, no permission needed) once it reaches the portal, and only that tab, whose id the extension got from chrome.tabs.create. The extension does not query or read any tab.
```

Host permissions `*://webserviced.anaf.ro/*` and `*://anaf.ro/*`:

```
ANAF's SPV web service only answers over mutual TLS and sends no CORS headers, so a web page cannot read its responses. The service worker fetches the SPV URL the ContApp page asked for, with credentials included, so the browser performs the client-certificate handshake. The code accepts only URLs starting with https://webserviced.anaf.ro/SPVWS2/rest/ and rejects everything else; it never makes HTTP requests and never requests anything from anaf.ro.

The other two parts of the patterns exist only for the login's cookie reset described under the cookies permission: chrome.cookies lists and removes a cookie only when the extension has host access to the cookie's domain, over http:// for a cookie without the Secure attribute, and to anaf.ro itself for a cookie set on .anaf.ro, which the browser also sends to webserviced.anaf.ro.
```

Host permission `*://decl.anaf.mfinante.gov.ro/*`:

```
ANAF's declaration filing portal only answers over mutual TLS and sends no CORS headers, so a web page cannot submit a declaration to it or read its answer. When the user files a declaration in ContApp, the service worker POSTs the signed PDF the ContApp page handed it, as multipart/form-data with credentials included, so the browser performs the client-certificate handshake, and returns the portal's HTML answer (the filing confirmation and registration index) to the ContApp page. The code only POSTs declarations to URLs starting with https://decl.anaf.mfinante.gov.ro/WAS6DUS/ and only opens the login tab on https://decl.anaf.mfinante.gov.ro/; it rejects everything else and never makes HTTP requests. When the portal's session is not known to be alive, or F5 bounced an upload to its login page before it reached the portal, the service worker repeats what ANAF's F5 login page does (GET https://decl.anaf.mfinante.gov.ro/, then POST https://decl.anaf.mfinante.gov.ro/my.policy with the form's only field, vhost=standard); the browser answers the certificate request only with a certificate already chosen for the host in this session, otherwise nothing is sent and ContApp asks the user to log in. A bounced upload is resent once; no other failure is ever resent. The http:// part of the pattern exists only for the login's cookie reset: chrome.cookies lists and removes a cookie without the Secure attribute only with host access over http://.
```

Content script `decl-login.js` on `https://decl.anaf.mfinante.gov.ro/my.policy*` and `https://decl.anaf.mfinante.gov.ro/WAS6DUS/*`:

```
It saves the user a click in the ANAF login tab the extension opened. On F5's login page it asks the service worker whether this tab is one the extension opened for a ContApp login (the worker remembers the ids of the tabs it created); only then does it submit the page's "Prezentare certificat" form (#auth_form), once per tab, so a certificate picker the user cancels does not loop. On the portal's pages behind the login it tells the worker the login succeeded, and the worker closes that tab (chrome.tabs.remove, only for tab ids it created) so the user is back in ContApp. In any other tab showing the portal it does nothing. It reads no page content and sends nothing but the message type.
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
privacy policy, which lists the certificate holder's CNP, CUIs and tax documents, and the declarations the user files
(their tax and personal data). The extension stores nothing and sends nothing to its publisher directly, but it relays
ANAF's response to the ContApp page the user opened, and that page sends it to ContApp's server under the user's own
account; a declaration goes from the ContApp page through the extension to ANAF only. The certificate and PIN are never read, and the ANAF
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
5. Filing a declaration works the same way against ANAF's declaration portal: the ContApp page hands the extension the signed PDF the user chose to file ({type:"upload"}), the service worker POSTs it as multipart/form-data to https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do, and returns the portal's HTML answer ("Succes depunere" with the registration index) to the ContApp page. Before the upload, and once after an upload F5 bounced to /my.policy, the service worker logs in silently (GET https://decl.anaf.mfinante.gov.ro/, POST /my.policy with vhost=standard); this only succeeds when a certificate was already chosen for the host in this browser session. Otherwise "Autentificare ANAF" opens https://decl.anaf.mfinante.gov.ro/ in a new tab next to ContApp; decl-login.js submits F5's "Prezentare certificat" form once in that tab, the browser shows the certificate picker and PIN, and when the tab reaches /WAS6DUS/ the extension closes it. Opening the portal in a tab yourself shows that nothing is submitted or closed there.

Without a certificate you can still check: on https://contabilitate.contapp.ro (or another ContApp application host), the extension answers a {channel:"contapp-spv", type:"ping"} message with its version, rejects any URL outside https://webserviced.anaf.ro/SPVWS2/rest/ (for an upload, outside https://decl.anaf.mfinante.gov.ro/WAS6DUS/) with "forbidden_url", and a fetch of an SPV URL returns "certificate_required". The source is two short files, background.js and content.js.

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
ContApp SPV is a companion extension for ContApp (https://contapp.ro), a Romanian online accounting application. It relays requests from ContApp pages to ANAF's SPV web service (https://webserviced.anaf.ro/SPVWS2/rest/), and the signed PDF declarations the user chooses to file to ANAF's declaration portal (https://decl.anaf.mfinante.gov.ro/WAS6DUS/), so the browser can authenticate with the user's client certificate, and returns the raw response to the ContApp page. It stores nothing itself; because the relayed SPV responses carry the certificate holder's CNP, CUIs and tax documents, and filed declarations carry tax and personal data, which the ContApp page then stores in the user's account, the manifest declares data_collection_permissions.required = [personallyIdentifyingInfo, financialAndPaymentInfo] (Firefox 140+ shows this in the install prompt).

Source: https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension (public). There is no transpilation, bundling or minification: build.sh copies background.js, content.js and the PNG icons into dist/firefox and uses jq to rewrite manifest.json (background.scripts instead of background.service_worker, plus the data_collection_permissions declaration). To reproduce: ./build.sh (requires jq and zip).

Testing end to end needs a ContApp account and a Romanian qualified certificate with SPV access; a screencast is available on request at suport@contapp.ro.
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
