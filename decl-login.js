// Runs on the declaration portal's F5 login form and on the portal's pages behind it, and does nothing unless the
// service worker says this tab is one it opened for a ContApp login. There it submits F5's certificate form once, the
// click the user would make, and tells the worker when the portal is reached so it can close the tab.
(async () => {
    const landed = location.pathname.startsWith("/WAS6DUS/");
    let answer;

    try {
        answer = await chrome.runtime.sendMessage({ type: landed ? "decl-login-landed" : "decl-login-form" });
    } catch {
        return; // the worker is unreachable, or the extension was reloaded
    }

    const form = document.getElementById("auth_form");

    // requestSubmit, not submit, so the page's own submit handler runs as it does for a click.
    if (!landed && answer?.submit === true && typeof form?.requestSubmit === "function") {
        form.requestSubmit();
    }
})();
