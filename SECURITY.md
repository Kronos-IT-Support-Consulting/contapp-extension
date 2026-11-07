# Security policy

## Supported versions

Only the latest GitHub release (and, once the store listings exist, the latest store version) receives fixes.
Store-installed copies update automatically within hours of a release; copies loaded unpacked from a release zip
must be downloaded again.

## Reporting a vulnerability

E-mail **suport@contapp.ro** with the subject `[ContApp extension] security`. Include the browser and
extension version (`chrome://extensions`), what you did, what happened and, if you have one, a proof of concept.
Please do not open a public issue for security problems.

You get an acknowledgement within 2 working days and a fix or a status update within 14 days. Credit is given
in `CHANGELOG.md` unless you prefer otherwise.

## Scope

The extension only forwards requests from ContApp pages: `fetch` to `https://webserviced.anaf.ro/SPVWS2/rest/*` and
`upload` (the signed declaration) to `https://decl.anaf.mfinante.gov.ro/WAS6DUS/*`, returning the raw response. For
the declaration portal it also logs in silently (`GET /`, `POST /my.policy`). A `login` deletes that host's ANAF
cookies and opens the login tab, where the `login-tab.js` content script submits the portal's F5 form and reports
when the login ended or was refused (F5's `/vdesk/hangup.php3` page on either host); the worker then closes that tab.
In Firefox only, the worker also reads the login tab's address and requests an SPV address that tab loaded, once per
page load, to close it (the answer is discarded). Reports about the ContApp application itself go to the same
address; reports about ANAF's service go to ANAF.
