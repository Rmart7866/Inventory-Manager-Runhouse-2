// token.js, The Run House Brooks scraper. Runs in the PAGE's world
// ("world": "MAIN" in the manifest), at document_start.
//
// WHY THIS EXISTS. FastTrack's own app calls its stock feed with a bearer
// token it keeps in memory; cookies alone get 401. A content script lives in
// an isolated world and cannot see the page's requests, so this hook watches
// the Authorization header FastTrack itself sets and posts it to the content
// script (content.js, listenForBrooksToken), which uses it for the Full
// catalog button. It never sends anything anywhere else, never logs in and
// never refreshes a token: it only repeats what the page already does.
//
// House style: no em dashes.
(function () {
    if (window.__rhBrooksTokenHook) return;
    window.__rhBrooksTokenHook = true;

    const relay = (value) => {
        if (typeof value === 'string' && /^Bearer \S+$/.test(value)) {
            window.postMessage({ source: 'rh-brooks-token', token: value }, window.location.origin);
        }
    };

    const setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (/^authorization$/i.test(name)) relay(value);
        return setHeader.apply(this, arguments);
    };

    const pageFetch = window.fetch;
    window.fetch = function (input, init) {
        try {
            const h = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined) || {});
            relay(h.get('authorization'));
        } catch (e) { /* never get in the page's way */ }
        return pageFetch.apply(this, arguments);
    };
})();
