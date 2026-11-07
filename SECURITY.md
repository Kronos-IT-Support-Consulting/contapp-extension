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

The extension only forwards requests from ContApp pages to ANAF's SPV web service
(`https://webserviced.anaf.ro/SPVWS2/rest/*`) and declaration filing portal
(`https://decl.anaf.mfinante.gov.ro/WAS6DUS/*`) and returns the raw response. Reports about the ContApp application itself go to the same address; reports about
ANAF's service go to ANAF.
