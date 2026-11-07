# Politica de confidențialitate — extensia ContApp

Data intrării în vigoare: 14.10.2026 · Ultima actualizare: 07.11.2026 · [English version below](#privacy-policy--contapp-extension)

Această politică explică ce date prelucrează extensia de browser **ContApp**, de ce, pe ce temei și ce drepturi
aveți, conform art. 13 din Regulamentul (UE) 2016/679 (GDPR). Ea completează
[Politica de confidențialitate ContApp](https://contapp.ro/politica-de-confidentialitate/),
[Termenii și condițiile](https://contapp.ro/termeni-si-conditii/) și
[Politica de utilizare cookies](https://contapp.ro/politica-utilizare-cookies/).

## 1. Cine suntem

Extensia este publicată de **Kronos IT Support & Consulting SRL**, operatorul platformei [ContApp](https://contapp.ro):

- sediul social: Loc. Tifești, județul Vrancea, Str. Secundară 58, nr. 24, cod poștal 627375, România;
- Registrul Comerțului: J39/10237/2006, CUI 18256126;
- e-mail: [contact@contapp.ro](mailto:contact@contapp.ro), telefon: +40 791 512 012;
- responsabil cu protecția datelor (DPO): [dpo@contapp.ro](mailto:dpo@contapp.ro).

## 2. Ce face extensia

Extensia permite aplicației ContApp să citească mesajele din Spațiul Privat Virtual (SPV) al ANAF, să descarce
documentele din ele, să trimită cereri de documente și să depună la ANAF declarațiile pe care le-ați ales,
folosind certificatul digital calificat din browserul dumneavoastră (token USB sau certificat în cloud). Acest lucru
este necesar pentru că serviciul SPV și portalul de depunere a declarațiilor ale ANAF acceptă numai conexiuni
autentificate cu certificat, iar o pagină web nu poate citi singură răspunsul.

Extensia acționează numai când o pagină ContApp deschisă de dumneavoastră îi cere:

1. pagina ContApp cere o adresă din serviciul ANAF `https://webserviced.anaf.ro/SPVWS2/rest/` (lista mesajelor,
   descărcarea unui mesaj, o cerere de document) sau, când depuneți o declarație, îi dă extensiei fișierul PDF semnat
   al declarației, pe care extensia îl trimite la `https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do`;
2. extensia trimite cererea către ANAF, iar browserul și sistemul de operare fac autentificarea cu certificatul;
3. extensia întoarce răspunsul ANAF (date JSON, un fișier PDF sau, la depunere, pagina HTML de confirmare a
   portalului, cu indexul de înregistrare), neschimbat, paginii ContApp care l-a cerut.

Extensia refuză orice altă adresă. Nu face nimic din proprie inițiativă: componenta ei de fundal rulează numai cât
timp răspunde unei cereri a paginii ContApp, nu verifică singură SPV, nu are pagină de setări și nu ia decizii
automate.

## 3. Ce date prelucrează, în ce scop și pe ce temei

| Date | Scop | Temei legal |
|---|---|---|
| Răspunsurile SPV: lista mesajelor (id, tip, dată, CIF, detalii, CNP-ul titularului certificatului, seria certificatului, CUI-urile la care are acces) și documentele descărcate, care pot conține date personale și fiscale | Afișarea și păstrarea mesajelor și documentelor SPV în contul dumneavoastră ContApp, la cererea dumneavoastră | Executarea contractului de utilizare a platformei ContApp (art. 6 alin. (1) lit. b) GDPR) |
| Parametrii cererilor de documente (tip, CUI, an, lună, motiv) | Transmiterea către ANAF a cererii completate în ContApp | Executarea contractului (art. 6 alin. (1) lit. b) GDPR) |
| Declarația depusă: fișierul PDF semnat pe care ați ales să îl depuneți, cu datele fiscale și personale din el (de exemplu CUI, CNP, nume, adresă, sume declarate), și răspunsul portalului ANAF (confirmarea depunerii și indexul de înregistrare) | Depunerea la ANAF a declarației întocmite în ContApp și păstrarea confirmării în contul dumneavoastră ContApp, la cererea dumneavoastră | Executarea contractului (art. 6 alin. (1) lit. b) GDPR) |

**Ce nu prelucrează extensia:**

- **Certificatul și PIN-ul.** Alegerea certificatului și introducerea PIN-ului sunt gestionate de browser, de
  sistemul de operare și de programul tokenului sau al semnăturii în cloud. Extensia nu vede PIN-ul și nu are acces
  la cheia privată.
- **Cookie-uri.** Extensia nu folosește, nu salvează și nu transmite valorile cookie-urilor și nu setează cookie-uri.
  Cererile pe care le trimite către ANAF includ cookie-urile pe care browserul le are deja pentru
  `webserviced.anaf.ro` sau `decl.anaf.mfinante.gov.ro` (cookie-ul de sesiune setat de ANAF după autentificare), la
  fel ca orice cerere făcută din browser. Când apăsați „Autentificare ANAF” și sesiunea ANAF a acelui server nu mai
  funcționează, extensia șterge cookie-urile pe care browserul le trimite către serverul respectiv (pentru
  `webserviced.anaf.ro` inclusiv cele setate pentru `anaf.ro`), ca autentificarea să înceapă o sesiune nouă în locul
  uneia eșuate; sesiunea celuilalt server nu este atinsă. Pentru asta browserul îi listează cookie-urile ANAF;
  extensia le folosește doar ca să le șteargă. Alte site-uri nu sunt atinse.
- **Istoric de navigare, conținutul altor site-uri, date de utilizare.** Extensia nu le accesează.

Pentru datele contului dumneavoastră ContApp, Kronos IT Support & Consulting SRL este operator. Pentru datele din
documentele SPV și din declarațiile firmelor pe care le administrați, Kronos IT Support & Consulting SRL (ContApp) acționează ca
persoană împuternicită, în numele dumneavoastră, conform capitolului XXII din
[Termenii și condițiile](https://contapp.ro/termeni-si-conditii/).

Folosirea extensiei este opțională. Fără ea, sincronizarea mesajelor SPV prin certificatul din browser nu este
disponibilă, dar restul platformei ContApp funcționează.

## 4. Destinatari

- **ANAF.** Cererile pleacă direct din browserul dumneavoastră către serverul SPV al ANAF sau, pentru depunerea
  declarațiilor, către portalul `decl.anaf.mfinante.gov.ro`, ca atunci când intrați în SPV sau depuneți o declarație
  din browser.
- **ContApp.** Pagina ContApp care primește răspunsul îl trimite serverelor ContApp, în contul în care sunteți
  autentificat. De acolo datele sunt prelucrate de Kronos IT Support & Consulting SRL și de furnizorii săi
  (persoane împuternicite) enumerați în
  [Politica de confidențialitate ContApp](https://contapp.ro/politica-de-confidentialitate/), secțiunea
  „Cu cine partajăm datele?”.
- **Nimeni altcineva.** Extensia nu trimite date către alte servere, nu folosește servicii de analiză, telemetrie
  sau reclame, nu încarcă cod de pe internet, nu vinde date și nu creează profiluri.

Folosirea informațiilor primite prin extensie respectă
[Politica privind datele utilizatorilor din Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
inclusiv cerințele de utilizare limitată (Limited Use).

## 5. Transferuri în afara Spațiului Economic European

Extensia nu transferă date în afara SEE: ea comunică numai cu ANAF și cu pagina ContApp din browserul dumneavoastră.
Eventualele transferuri făcute de furnizorii ContApp și garanțiile aplicate (decizii de adecvare, clauze
contractuale standard) sunt descrise în
[Politica de confidențialitate ContApp](https://contapp.ro/politica-de-confidentialitate/), secțiunea
„Transferuri internaționale”.

## 6. Cât timp păstrăm datele

- **Extensia:** nu păstrează nimic. Declarația trimisă și răspunsurile ANAF stau în memoria browserului doar cât
  durează transferul către ANAF, respectiv către pagina ContApp. Extensia nu are permisiunea `storage`.
- **ContApp:** mesajele și documentele sincronizate rămân în contul dumneavoastră până le ștergeți sau până la
  închiderea contului, apoi conform perioadelor din
  [Politica de confidențialitate ContApp](https://contapp.ro/politica-de-confidentialitate/), secțiunea
  „Perioada de stocare”, sau celor impuse de lege.

## 7. Securitate

Extensia face cereri numai prin HTTPS, iar conexiunea cu ANAF este autentificată cu certificatul dumneavoastră
calificat. Dacă ANAF redirecționează o cerere în afara serviciului SPV sau, la depunere, în afara
`https://decl.anaf.mfinante.gov.ro/WAS6DUS/` (de exemplu către pagina de autentificare sau către o adresă HTTP),
extensia nu citește răspunsul și nu îl transmite paginii. Extensia acceptă cereri numai de la paginile aplicațiilor
ContApp (`account`, `contabilitate` și `declaratiaunica`.contapp.ro) și numai pentru adrese din serviciul SPV al ANAF
și, pentru depunere, din `https://decl.anaf.mfinante.gov.ro/WAS6DUS/`. Răspunsurile ajung la pagina ContApp care le-a cerut, unde le pot vedea și scripturile
încărcate de acea pagină; ContApp răspunde pentru scripturile pe care le include. Codul sursă
este public, la [github.com/Kronos-IT-Support-Consulting/contapp-spv-extension](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension).

## 8. Permisiunile extensiei

| Permisiune | De ce |
|---|---|
| Acces la `*://webserviced.anaf.ro/*` | Citește răspunsurile serviciului SPV al ANAF, pe care paginile web nu le pot citi direct. Extensia acceptă doar adrese care încep cu `https://webserviced.anaf.ro/SPVWS2/rest/`. Accesul cuprinde și `http://` numai pentru că altfel browserul nu îi arată extensiei cookie-urile ANAF fără atributul Secure; extensia nu face nicio cerere prin HTTP. |
| Acces la `*://anaf.ro/*` | Folosit numai pentru cookie-uri: browserul îi arată extensiei și o lasă să șteargă un cookie setat pentru `.anaf.ro` (pe care îl trimite și către `webserviced.anaf.ro`) doar dacă are acces la `anaf.ro`. Extensia nu face nicio cerere către `anaf.ro`. |
| Acces la `*://decl.anaf.mfinante.gov.ro/*` | Trimite la portalul de depunere a declarațiilor al ANAF declarația PDF pe care ați ales să o depuneți și citește răspunsul portalului, pe care paginile web nu îl pot citi direct. Extensia trimite fișiere (POST) numai la adrese care încep cu `https://decl.anaf.mfinante.gov.ro/WAS6DUS/` și deschide fila de autentificare numai pe pagina de start a portalului, `https://decl.anaf.mfinante.gov.ro/`. Când sesiunea portalului nu este cunoscută ca activă sau a expirat, extensia se autentifică singură înainte de depunere, la fel cum ar face pagina de autentificare ANAF: deschide pagina de start a portalului și trimite formularul de autentificare (`POST https://decl.anaf.mfinante.gov.ro/my.policy` cu singurul câmp `vhost=standard`); browserul folosește certificatul ales deja pentru portal în sesiunea curentă a browserului, iar dacă nu a fost ales niciunul, nu se trimite nimic și ContApp vă cere autentificarea. Extensia nu citește conținutul acestor pagini. Accesul cuprinde și `http://` numai pentru că altfel browserul nu îi arată extensiei cookie-urile portalului fără atributul Secure; extensia nu face nicio cerere prin HTTP. |
| Script de conținut pe `https://{account,contabilitate,declaratiaunica}.contapp.ro/*` | Primește cererile paginii ContApp și îi întoarce răspunsurile. Nu rulează pe alte site-uri. |
| Script de conținut pe `https://decl.anaf.mfinante.gov.ro/my.policy*`, `https://decl.anaf.mfinante.gov.ro/WAS6DUS/*` și `https://webserviced.anaf.ro/SPVWS2/rest/*` | Numai în fila de autentificare deschisă de extensie la cererea ContApp: pe portalul de declarații apasă o singură dată butonul „Prezentare certificat” al paginii de autentificare ANAF (dacă renunțați la alegerea certificatului, butonul rămâne pentru dumneavoastră); când fila ajunge în portal sau la un răspuns al serviciului SPV (JSON sau PDF), îi spune extensiei să o închidă. În orice altă filă cu aceste adrese doar întreabă extensia dacă fila este una deschisă de ea, apoi nu face nimic. Citește doar tipul documentului afișat (de exemplu JSON), nu conținutul paginilor, și nu transmite date din ele. |
| Cookie-uri (`cookies`) | Șterge cookie-urile pe care browserul le trimite către `webserviced.anaf.ro` sau `decl.anaf.mfinante.gov.ro` înainte de deschiderea filei de autentificare ANAF pentru acel server, când sesiunea lui nu mai funcționează, ca o sesiune eșuată să nu blocheze o nouă autentificare. Nu folosește, nu salvează și nu transmite valorile cookie-urilor și nu atinge alte site-uri. |

Pentru autentificarea la ANAF, extensia deschide o filă nouă pe adresa listei de mesaje SPV sau pe pagina de start a
portalului de declarații, ca browserul să poată afișa alegerea certificatului și cererea de PIN; deschiderea filei nu
necesită nicio permisiune, iar extensia nu citește filele deschise. Fila este deschisă lângă fila ContApp; pe portalul
de declarații formularul de autentificare ANAF din ea este trimis automat o singură dată (vedeți scriptul de conținut
de mai sus). Fila este închisă automat când autentificarea a reușit (fila a ajuns în portal sau la un răspuns SPV), ca
să reveniți în ContApp; extensia o urmărește cel mult 5 minute și nu închide nicio altă filă. În Firefox, unde
scripturile extensiilor nu rulează în vizualizatorul JSON, extensia cere ea însăși adresa SPV pe care s-a oprit fila
de autentificare, o singură dată, și închide fila dacă ANAF răspunde; răspunsul nu este trimis paginii ContApp și nu
este păstrat.

În Chrome și Edge 128 sau mai noi, dacă niciun certificat potrivit nu este disponibil când ANAF îl cere prima dată
(tokenul nu este conectat, programul lui nu rulează), browserul reține că nu există certificat pentru acel site și
fila de autentificare nu mai afișează alegerea certificatului până când browserul este închis complet (toate
ferestrele) și redeschis. Conectați tokenul înainte de prima „Autentificare ANAF”.

## 9. Drepturile dumneavoastră

Conform GDPR aveți dreptul de acces (art. 15), la rectificare (art. 16), la ștergere (art. 17), la restricționarea
prelucrării (art. 18), la portabilitatea datelor (art. 20) și la opoziție (art. 21). Nu sunteți supus unor
decizii bazate exclusiv pe prelucrare automată (art. 22).

Extensia nu păstrează date despre dumneavoastră, deci cererile privesc datele ajunse în contul ContApp. Le puteți
trimite la [dpo@contapp.ro](mailto:dpo@contapp.ro) sau prin poștă la sediul de mai sus. Răspundem în cel mult o lună
de la primire (art. 12 alin. (3) GDPR).

Aveți dreptul să depuneți plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter
Personal (ANSPDCP), B-dul G-ral. Gheorghe Magheru nr. 28-30, sector 1, cod poștal 010336, București,
[anspdcp@dataprotection.ro](mailto:anspdcp@dataprotection.ro), [dataprotection.ro](https://www.dataprotection.ro),
și să vă adresați instanței.

## 10. Dezinstalare

- Chrome: `chrome://extensions` → ContApp → Eliminați.
- Edge: `edge://extensions` → ContApp → Eliminați.
- Firefox: `about:addons` → ContApp → Eliminați.

Dezinstalarea nu șterge nimic din ContApp: mesajele și documentele sincronizate rămân în cont. Pentru ștergerea lor,
vedeți secțiunea 9.

## 11. Modificări

Publicăm orice versiune nouă a acestei politici la aceeași adresă și actualizăm data de mai sus. Dacă o versiune
nouă a extensiei ar prelucra date în alt mod, actualizăm politica înainte de publicarea acelei versiuni.

---

# Privacy policy — ContApp extension

Effective date: 14 October 2026 · Last updated: 7 November 2026

This policy explains what data the **ContApp** browser extension processes, why, on what legal basis and what
rights you have, under Article 13 of Regulation (EU) 2016/679 (GDPR). It supplements the
[ContApp privacy policy](https://contapp.ro/politica-de-confidentialitate/), the
[terms and conditions](https://contapp.ro/termeni-si-conditii/) and the
[cookie policy](https://contapp.ro/politica-utilizare-cookies/) (all in Romanian).

## 1. Who we are

The extension is published by **Kronos IT Support & Consulting SRL**, the operator of [ContApp](https://contapp.ro):

- registered office: Loc. Tifești, Vrancea County, Str. Secundară 58, nr. 24, 627375, Romania;
- Trade Register no. J39/10237/2006, tax ID (CUI) 18256126;
- e-mail: [contact@contapp.ro](mailto:contact@contapp.ro), phone: +40 791 512 012;
- data protection officer (DPO): [dpo@contapp.ro](mailto:dpo@contapp.ro).

## 2. What the extension does

The extension lets the ContApp application read messages from ANAF's Virtual Private Space (SPV, the Romanian tax
authority's portal), download the documents in them, send document requests and file with ANAF the declarations you
chose to file, using the qualified digital certificate in your browser (USB token or cloud certificate). This is
needed because ANAF's SPV service and declaration filing portal only accept certificate-authenticated connections, and
a web page cannot read the response on its own.

It only acts when a ContApp page you opened asks it to:

1. the ContApp page asks for an address under ANAF's `https://webserviced.anaf.ro/SPVWS2/rest/` service (message
   list, message download, document request) or, when you file a declaration, hands the extension the declaration's
   signed PDF file, which the extension sends to `https://decl.anaf.mfinante.gov.ro/WAS6DUS/displayFile.do`;
2. the extension sends the request to ANAF, and the browser and operating system perform the certificate
   authentication;
3. the extension returns ANAF's response (JSON data, a PDF file or, for a filing, the portal's HTML confirmation page
   with the registration index), unchanged, to the ContApp page that asked for it.

The extension refuses any other address. It does nothing on its own initiative: its background component runs only
while answering a request from a ContApp page; it does not check SPV on its own, has no settings page and makes no
automated decisions.

## 3. What data it processes, for what purpose and on what legal basis

| Data | Purpose | Legal basis |
|---|---|---|
| SPV responses: the message list (id, type, date, tax ID (CIF), details, the certificate holder's personal identification number (CNP), the certificate serial number, the tax IDs (CUI) it can access) and downloaded documents, which can contain personal and tax data | Showing and keeping your SPV messages and documents in your ContApp account, at your request | Performance of the ContApp platform contract (Art. 6(1)(b) GDPR) |
| Document request parameters (type, tax ID, year, month, reason) | Sending the request you filled in on ContApp to ANAF | Performance of the contract (Art. 6(1)(b) GDPR) |
| The filed declaration: the signed PDF file you chose to file, with the tax and personal data it contains (for example tax ID, personal identification number (CNP), name, address, declared amounts), and the ANAF portal's answer (the filing confirmation and registration index) | Filing with ANAF the declaration prepared in ContApp and keeping the confirmation in your ContApp account, at your request | Performance of the contract (Art. 6(1)(b) GDPR) |

**What the extension does not process:**

- **Certificate and PIN.** Choosing the certificate and entering the PIN are handled by the browser, the operating
  system and the token or cloud-signature software. The extension never sees the PIN and has no access to the
  private key.
- **Cookies.** The extension does not use, store or transmit cookie values, and sets no cookies. The requests it
  sends to ANAF carry the cookies the browser already holds for `webserviced.anaf.ro` or `decl.anaf.mfinante.gov.ro`
  (the session cookie ANAF sets after authentication), like any request made from the browser. When you click
  "Autentificare ANAF" and that server's ANAF session no longer works, the extension deletes the cookies the browser
  sends to that server (for `webserviced.anaf.ro` including those set for `anaf.ro`), so the login starts a new
  session instead of reusing a failed one; the other server's session is left alone. To do that the
  browser lists the ANAF cookies to the extension, which uses them only to delete them. No other site is touched.
- **Browsing history, other sites' content, usage data.** The extension does not access them.

For your ContApp account data, Kronos IT Support & Consulting SRL is the controller. For the data in the SPV
documents and declarations of the companies you manage, Kronos IT Support & Consulting SRL (ContApp) acts as a processor on your behalf,
under chapter XXII of the [terms and conditions](https://contapp.ro/termeni-si-conditii/).

Using the extension is optional. Without it, syncing SPV messages through the certificate in your browser is not
available, but the rest of the ContApp platform works.

## 4. Recipients

- **ANAF.** Requests go directly from your browser to ANAF's SPV server or, for filing declarations, to the
  `decl.anaf.mfinante.gov.ro` portal, as when you open SPV or file a declaration in your browser.
- **ContApp.** The ContApp page that receives the response sends it to ContApp's servers, under the account you are
  signed in to. From there the data is processed by Kronos IT Support & Consulting SRL and its processors listed in
  the [ContApp privacy policy](https://contapp.ro/politica-de-confidentialitate/), section "Cu cine partajăm datele?".
- **Nobody else.** The extension sends no data to any other server, uses no analytics, telemetry or advertising,
  loads no code from the internet, does not sell data and does not build profiles.

The use of information received through the extension adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## 5. Transfers outside the European Economic Area

The extension transfers no data outside the EEA: it only talks to ANAF and to the ContApp page in your browser. Any
transfers made by ContApp's providers, and the safeguards applied (adequacy decisions, standard contractual clauses),
are described in the [ContApp privacy policy](https://contapp.ro/politica-de-confidentialitate/), section
"Transferuri internaționale".

## 6. How long data is kept

- **The extension:** keeps nothing. A filed declaration and ANAF's responses stay in browser memory only while being
  sent to ANAF or handed to the ContApp page. The extension has no `storage` permission.
- **ContApp:** synced messages and documents stay in your account until you delete them or close the account, then
  for the periods in the [ContApp privacy policy](https://contapp.ro/politica-de-confidentialitate/), section
  "Perioada de stocare", or those required by law.

## 7. Security

The extension only makes HTTPS requests, and the connection to ANAF is authenticated with your qualified
certificate. If ANAF redirects a request outside the SPV service or, for a filing, outside
`https://decl.anaf.mfinante.gov.ro/WAS6DUS/` (to the login page or an HTTP address, for example), the extension neither
reads the response nor passes it to the page. The extension only accepts requests from the ContApp application pages
(`account`, `contabilitate` and `declaratiaunica`.contapp.ro) and only for addresses in ANAF's SPV service and, for
filings, under `https://decl.anaf.mfinante.gov.ro/WAS6DUS/`. Answers go to the ContApp page that asked, where scripts that page loads can see
them too; ContApp is responsible for the scripts it includes. The source code is public at
[github.com/Kronos-IT-Support-Consulting/contapp-spv-extension](https://github.com/Kronos-IT-Support-Consulting/contapp-spv-extension).

## 8. Extension permissions

| Permission | Why |
|---|---|
| Host access to `*://webserviced.anaf.ro/*` | Reads responses from ANAF's SPV service, which web pages cannot read directly. The extension only accepts addresses starting with `https://webserviced.anaf.ro/SPVWS2/rest/`. The access covers `http://` only because the browser otherwise hides ANAF cookies without the Secure attribute from the extension; it makes no HTTP requests. |
| Host access to `*://anaf.ro/*` | Used only for cookies: the browser lists a cookie set on `.anaf.ro` (which it also sends to `webserviced.anaf.ro`) to the extension, and lets it delete one, only with access to `anaf.ro`. The extension makes no requests to `anaf.ro`. |
| Host access to `*://decl.anaf.mfinante.gov.ro/*` | Sends the PDF declaration you chose to file to ANAF's declaration filing portal and reads the portal's answer, which web pages cannot read directly. The extension only sends files (POST) to addresses starting with `https://decl.anaf.mfinante.gov.ro/WAS6DUS/` and only opens the login tab on the portal's start page, `https://decl.anaf.mfinante.gov.ro/`. When the portal's session is not known to be alive or has expired, the extension logs in by itself before filing, as ANAF's login page would: it opens the portal's start page and posts the login form (`POST https://decl.anaf.mfinante.gov.ro/my.policy` with its only field, `vhost=standard`); the browser uses the certificate already chosen for the portal in this browser session, and if none was chosen nothing is sent and ContApp asks you to log in. The extension does not read the content of these pages. The access covers `http://` only because the browser otherwise hides the portal's cookies without the Secure attribute from the extension; it makes no HTTP requests. |
| Content script on `https://{account,contabilitate,declaratiaunica}.contapp.ro/*` | Receives the ContApp page's requests and returns the answers. It does not run on any other site. |
| Content script on `https://decl.anaf.mfinante.gov.ro/my.policy*`, `https://decl.anaf.mfinante.gov.ro/WAS6DUS/*` and `https://webserviced.anaf.ro/SPVWS2/rest/*` | Only in the login tab the extension opened at ContApp's request: on the declaration portal it presses the ANAF login page's "Prezentare certificat" button once (if you cancel the certificate choice, the button is left to you); once the tab reaches the portal or an answer of the SPV service (JSON or PDF), it tells the extension to close it. In any other tab showing these addresses it only asks the extension whether the tab is one it opened, then does nothing. It reads only the displayed document's type (JSON, for example), not page content, and transmits nothing from the pages. |
| Cookies (`cookies`) | Deletes the cookies the browser sends to `webserviced.anaf.ro` or `decl.anaf.mfinante.gov.ro` before the ANAF login tab for that server opens, when its session no longer works, so a failed session cannot block a new login. It does not use, store or transmit cookie values and touches no other site. |

To authenticate at ANAF, the extension opens a new tab on the SPV message list address or the declaration portal's
start page so the browser can show the certificate picker and the PIN prompt; opening the tab needs no permission, and
the extension does not read open tabs. The tab opens next to the ContApp tab; on the declaration portal the ANAF login
form in it is submitted automatically once (see the content script above). The tab is closed automatically once the
login succeeds (it reached the portal or an SPV answer), so you are back in ContApp; the extension watches it for at
most 5 minutes and closes no other tab. In Firefox, where extensions' scripts do not run in the JSON viewer,
the extension itself requests the SPV address the login tab stopped on, once, and closes the tab if ANAF answers; that
answer is not passed to the ContApp page and is not kept.

In Chrome and Edge 128 and newer, if no matching certificate is available when ANAF first asks for one (token not
plugged in, its software not running), the browser remembers that there is no certificate for that site and the login
tab shows no certificate picker until the browser is closed completely (every window) and reopened. Plug the token in
before the first "Autentificare ANAF".

## 9. Your rights

Under the GDPR you have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of
processing (Art. 18), data portability (Art. 20) and objection (Art. 21). You are not subject to decisions based
solely on automated processing (Art. 22).

The extension keeps no data about you, so requests concern the data that reached your ContApp account. Send them to
[dpo@contapp.ro](mailto:dpo@contapp.ro) or by post to the registered office above. We answer within one month of
receipt (Art. 12(3) GDPR).

You have the right to lodge a complaint with the Romanian data protection authority (Autoritatea Națională de
Supraveghere a Prelucrării Datelor cu Caracter Personal, ANSPDCP), B-dul G-ral. Gheorghe Magheru nr. 28-30, sector 1,
postal code 010336, Bucharest, [anspdcp@dataprotection.ro](mailto:anspdcp@dataprotection.ro),
[dataprotection.ro](https://www.dataprotection.ro), and to go to court.

## 10. Uninstalling

- Chrome: `chrome://extensions` → ContApp → Remove.
- Edge: `edge://extensions` → ContApp → Remove.
- Firefox: `about:addons` → ContApp → Remove.

Uninstalling deletes nothing in ContApp: synced messages and documents stay in your account. To have them deleted,
see section 9.

## 11. Changes

We publish every new version of this policy at the same address and update the date above. If a new version of the
extension would process data differently, we update this policy before that version is published.
