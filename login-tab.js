// Runs on ANAF's login pages and on the answers behind them, and does nothing unless the service worker says this tab
// is one it opened for a ContApp login. On the declaration portal's F5 certificate form it submits the form once, the
// click the user would make; on the page a login ends on, the site's answer or F5's hangup page when no certificate was
// presented, it tells the worker, which closes the tab.
(async () => {
    const { hostname, pathname } = location;
    const onForm = hostname === "decl.anaf.mfinante.gov.ro" && pathname.startsWith("/my.policy");
    // SPV answers JSON or a PDF; the F5 gateway's own HTML page under the REST prefix is not the end of a login.
    const landed = hostname === "webserviced.anaf.ro"
        ? /^application\/(json|pdf)$/.test(document.contentType)
        : pathname.startsWith("/WAS6DUS/");

    // F5's hangup page: the login was refused, the browser sent no certificate.
    const refused = pathname === "/vdesk/hangup.php3";

    if (!onForm && !landed && !refused) {
        return;
    }

    const type = refused ? "login-refused" : landed ? "login-landed" : "login-form";
    let answer;

    try {
        answer = await chrome.runtime.sendMessage({ type });
    } catch {
        return; // the worker is unreachable, or the extension was reloaded
    }

    const form = document.getElementById("auth_form");

    // requestSubmit, not submit, so the page's own submit handler runs as it does for a click.
    if (onForm && answer?.submit === true && typeof form?.requestSubmit === "function") {
        form.requestSubmit();
    }
})();
